import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // 清理顺序按外键依赖从子表到父表
  await prisma.auditLog.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.claimTask.deleteMany();
  await prisma.claimCase.deleteMany();

  for (let i = 1; i <= 5; i++) {
    const claimCase = await prisma.claimCase.create({
      data: {
        case_no: `RC20261100${i}`,
        accident_time: new Date(),
        accident_location: `北京市朝阳区某街道 ${i} 号`,
        accident_type: i % 2 === 0 ? 'COLLISION' : 'FALL',
        case_status: 'PENDING_SPLIT',
      },
    });

    console.log(`Created Case: ${claimCase.case_no}`);

    await prisma.claimTask.create({
      data: {
        case_id: claimCase.id,
        task_no: `TASK-${Date.now()}-${i}-RIDER`,
        task_type: 'rider_injury',
        insurance_type: 'employer',
        business_line: 'injury',
        task_status: 'PENDING',
      },
    });

    if (i % 2 === 0) {
      await prisma.claimTask.create({
        data: {
          case_id: claimCase.id,
          task_no: `TASK-${Date.now()}-${i}-PROPERTY`,
          task_type: 'third_property',
          insurance_type: 'third_party',
          business_line: 'property',
          task_status: 'PENDING',
        },
      });
    }
  }

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });