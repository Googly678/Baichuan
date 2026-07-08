import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { PrismaClient } from '@prisma/client';

const redisConnection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379');
const prisma = new PrismaClient();

export const splitQueue = new Queue('claim-split-queue', { connection: redisConnection });

export class ClaimService {
  // 注意：该服务目前未接入主路由，仅保留为异步拆分示例。
  static async createClaimCase(data: any, operator: string) {
    const requestKey = data?.orderId || data?.order_id || `adhoc-${Date.now()}`;
    const lockKey = `lock:create-case:${requestKey}`;

    const isLocked = await redisConnection.setnx(lockKey, '1');
    if (!isLocked) throw new Error('正在处理中，请勿重复提交');
    await redisConnection.expire(lockKey, 10);

    try {
      const caseNo = `RC${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const accidentTime = data?.accidentTime ? new Date(data.accidentTime) : new Date();

      const newCase = await prisma.$transaction(async (tx) => {
        const c = await tx.claimCase.create({
          data: {
            case_no: caseNo,
            accident_time: accidentTime,
            accident_location: data?.location || '未知地点',
            accident_type: data?.accidentType || 'UNKNOWN',
            case_status: 'PENDING_SPLIT',
          },
        });

        await tx.auditLog.create({
          data: {
            entity_type: 'ClaimCase',
            entity_id: c.id,
            action: 'CREATE_CASE',
            operator,
          },
        });

        return c;
      });

      await splitQueue.add(
        'split-task',
        { caseId: newCase.id, operator },
        {
          attempts: 3,
          backoff: { type: 'fixed', delay: 5000 },
          jobId: newCase.id,
        }
      );

      return newCase;
    } finally {
      await redisConnection.del(lockKey);
    }
  }

  static async checkAndCloseCase(caseId: string) {
    const lockKey = `lock:close-case:${caseId}`;
    const acquired = await redisConnection.setnx(lockKey, '1');
    if (!acquired) return;
    await redisConnection.expire(lockKey, 10);

    try {
      const openTasks = await prisma.claimTask.count({
        where: { case_id: caseId, NOT: { task_status: 'FINISHED' } },
      });

      if (openTasks === 0) {
        await prisma.$transaction(async (tx) => {
          await tx.claimCase.update({
            where: { id: caseId },
            data: { case_status: 'CLOSED' },
          });
          await tx.auditLog.create({
            data: {
              entity_type: 'ClaimCase',
              entity_id: caseId,
              action: 'AUTO_CLOSE_CASE',
              operator: 'SYSTEM',
            },
          });
        });
      }
    } finally {
      await redisConnection.del(lockKey);
    }
  }
}

export const splitWorker = new Worker(
  'claim-split-queue',
  async (job) => {
    const { caseId } = job.data;

    const claimCase = await prisma.claimCase.findUnique({ where: { id: caseId } });
    if (!claimCase || claimCase.case_status !== 'PENDING_SPLIT') return;

    await prisma.$transaction(async (tx) => {
      const createdTasks = [
        tx.claimTask.create({
          data: {
            case_id: caseId,
            task_no: `TASK-${Date.now()}-${Math.floor(Math.random() * 10000)}-RIDER`,
            task_type: 'rider_injury',
            insurance_type: 'employer',
            business_line: 'injury',
            task_status: 'PENDING',
          },
        }),
      ];

      if (claimCase.accident_type === 'COLLISION') {
        createdTasks.push(
          tx.claimTask.create({
            data: {
              case_id: caseId,
              task_no: `TASK-${Date.now()}-${Math.floor(Math.random() * 10000)}-THIRD-INJURY`,
              task_type: 'third_injury',
              insurance_type: 'third_party',
              business_line: 'injury',
              task_status: 'PENDING',
            },
          })
        );
        createdTasks.push(
          tx.claimTask.create({
            data: {
              case_id: caseId,
              task_no: `TASK-${Date.now()}-${Math.floor(Math.random() * 10000)}-THIRD-PROP`,
              task_type: 'third_property',
              insurance_type: 'third_party',
              business_line: 'property',
              task_status: 'PENDING',
            },
          })
        );
      }

      await Promise.all(createdTasks);

      await tx.claimCase.update({
        where: { id: caseId },
        data: { case_status: 'REGISTERED' },
      });

      await tx.auditLog.create({
        data: { entity_type: 'ClaimCase', entity_id: caseId, action: 'SPLIT_TASKS', operator: 'SYSTEM' },
      });
    });

    console.log(`[Worker] Case ${caseId} split successfully.`);
  },
  { connection: redisConnection }
);

