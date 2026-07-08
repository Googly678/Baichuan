import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { createCase, findCase, listCases, saveCase } from './storage';
import { findCoreRecord, upsertCoreRecord } from './coreStorage';
import { searchIcdRecords } from './icdStorage';
import { REGION_TREE } from './regionData';
import { searchHospitals } from './hospitalStorage';
import { queryWorkInjuryStandard } from './workInjuryStorage';
import {
  searchVehicleByVin,
  listVehicleModels,
  getCategoriesByModel,
  searchParts,
} from './vehiclePartsStorage';
import {
  getRepairOrderByCaseId,
  upsertRepairOrder,
  deleteRepairOrder,
  type RepairOrder,
} from './repairOrderStorage';
import {
  listReInspectionTasks,
  getReInspectionTask,
  upsertReInspectionTask,
  deleteReInspectionTask,
  listInvestigationTasks,
  getInvestigationTask,
  upsertInvestigationTask,
  deleteInvestigationTask,
  listLitigationRecords,
  getLitigationRecord,
  upsertLitigationRecord,
  deleteLitigationRecord,
  listAuxiliaryTasks,
  getAuxiliaryTask,
  upsertAuxiliaryTask,
  deleteAuxiliaryTask,
} from './auxiliaryStorage';
import { AttachmentCategory, ClaimCase, CoreClaimRecord, TaskItem } from './types';

const app = express();

// CORS 白名单：本地 + GitHub Pages 部署
// 多个域名用逗号分隔，通过 ALLOWED_ORIGINS 环境变量配置
// 默认放行 localhost:* + GitHub Pages
const allowedOrigins = (process.env.ALLOWED_ORIGINS ||
  'http://localhost:5174,http://127.0.0.1:5174,http://localhost:3000,https://*.github.io'
).split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // 同源 / curl 无 origin
    const matched = allowedOrigins.some(pat => {
      if (pat.includes('*')) {
        const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
        return re.test(origin);
      }
      return pat === origin;
    });
    cb(matched ? null : new Error('CORS: origin not allowed: ' + origin), matched);
  },
  credentials: true,
}));

app.use(express.json({ limit: '30mb' }));

// 登录接口 (MOCK)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username) return res.status(401).json({ error: 'Username required' });
  let role = 'CUSTOMER_SERVICE';
  if (username.includes('injury-auditor')) role = 'INJURY_AUDITOR';
  else if (username.includes('property-auditor')) role = 'PROPERTY_AUDITOR';
  else if (username.includes('injury')) role = 'INJURY_SURVEYOR';
  else if (username.includes('property')) role = 'PROPERTY_SURVEYOR';
  else if (username.includes('admin')) role = 'ADMIN';
  res.json({ token: `mock_token_${username}`, role });
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/regions', (_req, res) => {
  // 省/市/区三级联动字典（前端 Cascader 直接消费）
  res.json(REGION_TREE);
});

app.get('/claims', async (req, res) => {
  const claims = await listCases();
  res.json(claims.map((claim) => normalizeClaimStatuses(claim)));
});

app.get('/claims/:id', async (req, res) => {
  const claim = await findCase(req.params.id);
  if (!claim) return res.status(404).json({ error: '案件不存在' });
  res.json(normalizeClaimStatuses(claim));
});

const APPROVAL_STATUS_ORDER: Record<string, number> = {
  PENDING_SPLIT: 0,
  PENDING: 1,
  SUBMITTED_REG: 2,
  REG_APPROVED: 3,
  SUBMITTED_AGREEMENT: 4,
  AGREEMENT_APPROVED: 5,
  SUBMITTED_SURVEY: 6,
  SURVEY_APPROVED: 7,
  DONE: 8,
};

function deriveCaseStatusFromTasks(tasks: TaskItem[] = [], fallback: ClaimCase['status'] = 'PENDING') {
  if (!tasks.length) return fallback;
  return tasks.reduce((current, task) => {
    const taskStatus = task.status || fallback;
    return (APPROVAL_STATUS_ORDER[taskStatus] ?? Number.MAX_SAFE_INTEGER) < (APPROVAL_STATUS_ORDER[current] ?? Number.MAX_SAFE_INTEGER)
      ? taskStatus
      : current;
  }, tasks[0]?.status || fallback);
}

function normalizeClaimStatuses(payload: ClaimCase): ClaimCase {
  if (!payload.tasks?.length) return payload;
  return {
    ...payload,
    status: deriveCaseStatusFromTasks(payload.tasks, payload.status),
  };
}

function nowText() {
  return new Date().toISOString();
}

function toSafeNumber(value: unknown) {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : 0;
}

function calcCaseLossTotal(payload: ClaimCase) {
  return (payload.tasks || []).reduce((sum, task) => {
    const taskTotal = (task.loss_items || []).reduce((s, item) => s + toSafeNumber(item.amount), 0);
    return sum + taskTotal;
  }, 0);
}

function calcPaymentTotal(payload: ClaimCase) {
  return (payload.payment_infos || []).reduce((sum, item) => sum + toSafeNumber(item.payment_amount), 0);
}

function applyApprovalSnapshot(current: ClaimCase, next: ClaimCase) {
  const normalizedCurrent = normalizeClaimStatuses(current);
  const normalizedNext = normalizeClaimStatuses(next);
  const currentRank = APPROVAL_STATUS_ORDER[normalizedCurrent.status] ?? 0;
  const nextRank = APPROVAL_STATUS_ORDER[normalizedNext.status] ?? 0;
  const total = calcCaseLossTotal(next);
  const timestamp = nowText();

  if (nextRank >= APPROVAL_STATUS_ORDER.REG_APPROVED && !next.reg_approved_time) {
    next.reg_approved_time = timestamp;
    next.reg_amount = total;
  }
  if (nextRank >= APPROVAL_STATUS_ORDER.AGREEMENT_APPROVED && !next.agreement_approved_time) {
    next.agreement_approved_time = timestamp;
    next.agreement_amount = total;
  }
  if (nextRank >= APPROVAL_STATUS_ORDER.SURVEY_APPROVED && !next.survey_approved_time) {
    next.survey_approved_time = timestamp;
    next.survey_amount = total;
  }

  if (normalizedNext.status !== normalizedCurrent.status) {
    if (normalizedNext.status === 'REG_APPROVED' && currentRank < APPROVAL_STATUS_ORDER.REG_APPROVED) {
      next.reg_approved_time = timestamp;
      next.reg_amount = total;
    }
    if (normalizedNext.status === 'AGREEMENT_APPROVED' && currentRank < APPROVAL_STATUS_ORDER.AGREEMENT_APPROVED) {
      next.agreement_approved_time = timestamp;
      next.agreement_amount = total;
    }
    if (normalizedNext.status === 'SURVEY_APPROVED' && currentRank < APPROVAL_STATUS_ORDER.SURVEY_APPROVED) {
      next.survey_approved_time = timestamp;
      next.survey_amount = total;
    }
  }
}

async function syncCoreDbFromCase(payload: ClaimCase) {
  const existing = await findCoreRecord(payload.case_no);
  const record: CoreClaimRecord = {
    case_no: payload.case_no,
    accident_time: payload.accident_time,
    report_time: payload.report_time,
    reg_approved_time: payload.reg_approved_time ?? existing?.reg_approved_time,
    reg_amount: payload.reg_amount ?? existing?.reg_amount,
    agreement_approved_time: payload.agreement_approved_time ?? existing?.agreement_approved_time,
    agreement_amount: payload.agreement_amount ?? existing?.agreement_amount,
    survey_approved_time: payload.survey_approved_time ?? existing?.survey_approved_time,
    survey_amount: payload.survey_amount ?? existing?.survey_amount,
    updated_at: nowText(),
  };
  await upsertCoreRecord(record);
}

app.post('/claims', async (req, res) => {
  try {
    const payload = req.body || {};
    const now = new Date();
    const id = randomUUID();
    const tasks: TaskItem[] = [];

    const newCase: ClaimCase = {
      id,
      case_no: `CL${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`,
      vehicle_type: payload.vehicle_type || 'E_BIKE',
      vehicle_label: payload.vehicle_label || '电动自行车（非机动车）',
      is_motor: payload.vehicle_type !== 'E_BIKE',
      status: 'PENDING_SPLIT',
      reporter: payload.reporter_name || '报案人',
      rider_name: payload.rider_name || '骑手',
      rider_type: payload.rider_type || '专送',
      company: payload.company || '演示公司',
      report_time: now.toISOString(),
      accident_time: payload.accident_time || now.toISOString(),
      accident_location: payload.accident_location || '',
      product: payload.product || '雇主责任险',
      tasks,
      has_litigation: false,
      has_investigation: false,
      investigation_blocking: false,
      liability_ratio: Number(payload.liability_ratio || 100),
      task_details: {
        has_rider_injury: payload.has_rider_injury ?? true,
        has_third_injury: payload.has_third_injury ?? false,
        has_vehicle_loss: payload.has_vehicle_loss ?? false,
        has_property_loss: payload.has_property_loss ?? false,
      },
      attachments: [],
      payment_infos: [],
      audit_logs: [{ id: randomUUID(), time: now.toISOString(), operator: '客服专员', action: '创建报案（待分流）' }],
    };
    const created = await createCase(newCase);
    await syncCoreDbFromCase(created);
    res.json({ success: true, data: created });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/claims/:id/split', async (req, res) => {
  try {
    const source = await findCase(req.params.id);
    if (!source) return res.status(404).json({ error: '案件不存在' });
    if (source.status !== 'PENDING_SPLIT') {
      return res.status(400).json({ error: '该案件状态不允许分流' });
    }

    const flags = {
      has_rider_injury: req.body?.has_rider_injury ?? source.task_details?.has_rider_injury ?? true,
      has_third_injury: req.body?.has_third_injury ?? source.task_details?.has_third_injury ?? false,
      has_vehicle_loss: req.body?.has_vehicle_loss ?? source.task_details?.has_vehicle_loss ?? false,
      has_property_loss: req.body?.has_property_loss ?? source.task_details?.has_property_loss ?? false,
    };

    const injuryTasks: TaskItem[] = [];
    if (flags.has_rider_injury) {
      injuryTasks.push({ id: `${source.id}-rider`, task_type: 'rider_injury', status: 'PENDING', loss_items: [] });
    }
    if (flags.has_third_injury) {
      injuryTasks.push({ id: `${source.id}-third-injury`, task_type: 'third_injury', status: 'PENDING', loss_items: [] });
    }
    // 车损/物损分成两个独立任务流：third_vehicle / third_property
    const propertyTasks: TaskItem[] = [];
    if (flags.has_vehicle_loss) {
      propertyTasks.push({ id: `${source.id}-third-vehicle`, task_type: 'third_vehicle', status: 'PENDING', loss_items: [] });
    }
    if (flags.has_property_loss) {
      propertyTasks.push({ id: `${source.id}-third-property`, task_type: 'third_property', status: 'PENDING', loss_items: [] });
    }

    if (!injuryTasks.length && !propertyTasks.length) {
      return res.status(400).json({ error: '请至少选择一个分流条线' });
    }

    const now = new Date().toLocaleString('zh-CN', { hour12: false });
    const baseAudit = source.audit_logs || [];

    // 复用原案件作为第一条线案件
    const primaryTasks = injuryTasks.length ? injuryTasks : propertyTasks;
    const updatedSource: ClaimCase = {
      ...source,
      status: 'PENDING',
      tasks: primaryTasks,
      audit_logs: [
        ...baseAudit,
        { id: randomUUID(), time: now, operator: '客服专员', action: '完成案件分流（主案件）' },
      ],
    };
    const savedPrimary = await saveCase(source.id, updatedSource);
    await syncCoreDbFromCase(savedPrimary);

    // 如人伤+物损同时存在，新增第二个案件（同报案号）
    let createdSecondary: ClaimCase | null = null;
    if (injuryTasks.length && propertyTasks.length) {
      const newId = randomUUID();
      const secondary: ClaimCase = {
        ...source,
        id: newId,
        status: 'PENDING',
        tasks: propertyTasks,
        attachments: cloneAttachments(source.attachments || []),
        payment_infos: JSON.parse(JSON.stringify(source.payment_infos || [])),
        audit_logs: [
          ...baseAudit,
          { id: randomUUID(), time: now, operator: '客服专员', action: '完成案件分流（副案件）' },
        ],
      };
      createdSecondary = await createCase(secondary);
      await syncCoreDbFromCase(createdSecondary);
    }

    res.json({
      success: true,
      data: createdSecondary ? [savedPrimary, createdSecondary] : [savedPrimary],
      case_no: source.case_no,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/claims/:id', async (req, res) => {
  try {
    const current = await findCase(req.params.id);
    if (!current) return res.status(404).json({ error: '案件不存在' });

    const next: ClaimCase = normalizeClaimStatuses({ ...current, ...req.body, id: current.id });
    const nextLossTotal = calcCaseLossTotal(next);
    const paymentTotal = calcPaymentTotal(next);

    if (paymentTotal > nextLossTotal) {
      return res.status(400).json({ error: '支付金额总额不能超过损失合计' });
    }

    if (next.tasks.some((task) => task.status === 'SUBMITTED_SURVEY')) {
      const agreementAmount = Number(next.agreement_amount ?? current.agreement_amount ?? 0);
      if (agreementAmount > 0 && nextLossTotal > agreementAmount) {
        return res.status(400).json({ error: '定损金额不能超过协议上报通过金额' });
      }
    }

    applyApprovalSnapshot(current, next);

    const saved = await saveCase(req.params.id, normalizeClaimStatuses(next));
    await syncCoreDbFromCase(saved);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/core-claims', async (_req, res) => {
  const claims = await listCases();
  const all = await Promise.all(claims.map(async (item) => {
    await syncCoreDbFromCase(item);
    return item.case_no;
  }));
  const unique = Array.from(new Set(all));
  const records = await Promise.all(unique.map(async (caseNo) => findCoreRecord(caseNo)));
  res.json(records.filter(Boolean));
});

app.get('/icd10/search', async (req, res) => {
  try {
    const result = await searchIcdRecords({
      keyword: String(req.query.keyword || ''),
      level1: String(req.query.level1 || ''),
      level2: String(req.query.level2 || ''),
      level3: String(req.query.level3 || ''),
      level4: String(req.query.level4 || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'ICD-10 查询失败' });
  }
});

app.get('/work-injury-standards', async (req, res) => {
  try {
    const result = await queryWorkInjuryStandard({
      province: String(req.query.province || ''),
      city: String(req.query.city || ''),
      householdType: String(req.query.householdType || ''),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '工伤标准查询失败' });
  }
});

app.get('/hospitals/search', async (req, res) => {
  try {
    const result = await searchHospitals({
      province: String(req.query.province || ''),
      city: String(req.query.city || ''),
      district: String(req.query.district || ''),
      keyword: String(req.query.keyword || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '医院检索失败' });
  }
});

app.get('/audit-logs/:entityId', async (req, res) => {
  const claims = await listCases();
  const claim = claims.find((item) => item.id === req.params.entityId || item.tasks.some((t) => t.id === req.params.entityId));
  res.json(claim?.audit_logs || []);
});

// ─── 车辆配件库（VIN 解析 + 车型 + 配件） ─────────────────────────────────────
app.get('/vehicles/search', async (req, res) => {
  try {
    const keyword = String(req.query.keyword || '');
    if (req.query.vin) {
      const model = await searchVehicleByVin(String(req.query.vin));
      return res.json({ model });
    }
    const models = await listVehicleModels(keyword);
    res.json({ items: models });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '车辆查询失败' });
  }
});

app.get('/vehicles/:modelId/categories', async (req, res) => {
  try {
    const categories = await getCategoriesByModel(req.params.modelId);
    res.json({ items: categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '配件分类查询失败' });
  }
});

app.get('/vehicles/:modelId/parts', async (req, res) => {
  try {
    const result = await searchParts({
      vehicleModelId: req.params.modelId,
      category: String(req.query.category || ''),
      keyword: String(req.query.keyword || ''),
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 20),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '配件查询失败' });
  }
});

// ─── 维修配件工单（按 case 维度独立保存） ──────────────────────────────────────
app.get('/cases/:caseId/repair-order', async (req, res) => {
  const order = await getRepairOrderByCaseId(req.params.caseId);
  res.json(order || null);
});

app.put('/cases/:caseId/repair-order', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.vehicle_model_id || !body.vin) {
      return res.status(400).json({ error: '缺少车辆信息' });
    }
    const items = Array.isArray(body.items) ? body.items : [];
    const now = new Date().toISOString();
    const totalMsrp = items.reduce((s: number, it: any) => s + (Number(it.subtotal_msrp) || 0), 0);
    const totalMarket = items.reduce((s: number, it: any) => s + (Number(it.subtotal_market) || 0), 0);
    const existing = await getRepairOrderByCaseId(req.params.caseId);
    const order: RepairOrder = {
      id: existing?.id || `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      case_id: req.params.caseId,
      task_id: body.task_id,
      vehicle_model_id: body.vehicle_model_id,
      vin: body.vin,
      brand: body.brand,
      series: body.series,
      trim: body.trim,
      total_msrp: totalMsrp,
      total_market: totalMarket,
      items,
      created_at: existing?.created_at || now,
      updated_at: now,
    };
    const saved = await upsertRepairOrder(order);
    res.json(saved);
  } catch (err: any) {
    res.status(500).json({ error: err.message || '保存工单失败' });
  }
});

app.delete('/cases/:caseId/repair-order', async (req, res) => {
  await deleteRepairOrder(req.params.caseId);
  res.json({ success: true });
});

function cloneAttachments(attachments: AttachmentCategory[] = []) {
  return JSON.parse(JSON.stringify(attachments)) as AttachmentCategory[];
}

async function resolveAttachmentScope(ref: string) {
  const claims = await listCases();
  const owner = claims.find(
    (item) => item.id === ref || item.case_no === ref || item.tasks.some((t) => t.id === ref)
  );
  if (!owner) return null;

  const scopedClaims = claims.filter((item) => item.case_no === owner.case_no);
  return {
    owner,
    caseNo: owner.case_no,
    scopedClaims,
  };
}

app.get('/claims/:ref/attachments', async (req, res) => {
  const scope = await resolveAttachmentScope(req.params.ref);
  if (!scope) return res.status(404).json({ error: '案件不存在' });

  const firstWithAttachments = scope.scopedClaims.find((item) => (item.attachments || []).length > 0);
  res.json(cloneAttachments(firstWithAttachments?.attachments || []));
});

// 添加附件到指定文件夹
app.post('/claims/:ref/attachments', async (req, res) => {
  try {
    const scope = await resolveAttachmentScope(req.params.ref);
    if (!scope) return res.status(404).json({ error: '案件不存在' });

    const { folder, files } = req.body;  // folder: 'identity', 'medical', etc.; files: AttachmentFile[]
    if (!folder || !Array.isArray(files)) {
      return res.status(400).json({ error: '缺少必要参数：folder 和 files' });
    }

    const nextAttachments = cloneAttachments(scope.owner.attachments || []);
    
    // 找到或创建对应的文件夹
    let category = nextAttachments.find(c => c.key === folder);
    if (!category) {
      category = { key: folder, title: folder, files: [] };
      nextAttachments.push(category);
    }

    // 添加文件
    category.files.push(...files);

    // 同一报案号下的所有拆分任务共享同一附件集
    await Promise.all(
      scope.scopedClaims.map((item) =>
        saveCase(item.id, {
          ...item,
          attachments: cloneAttachments(nextAttachments),
        })
      )
    );

    res.json({ success: true, data: nextAttachments, case_no: scope.caseNo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 移动附件到其他文件夹
app.post('/claims/:ref/attachments/move', async (req, res) => {
  try {
    const scope = await resolveAttachmentScope(req.params.ref);
    if (!scope) return res.status(404).json({ error: '案件不存在' });

    const { fromFolder, toFolder, fileIds } = req.body;
    if (!fromFolder || !toFolder || !Array.isArray(fileIds) || !fileIds.length) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const nextAttachments = cloneAttachments(scope.owner.attachments || []);

    const fromCategory = nextAttachments.find(c => c.key === fromFolder);
    if (!fromCategory) return res.status(404).json({ error: '源文件夹不存在' });

    const toCategory = nextAttachments.find(c => c.key === toFolder);
    if (!toCategory) return res.status(404).json({ error: '目标文件夹不存在' });

    const filesToMove = fromCategory.files.filter(f => fileIds.includes(f.id));
    if (!filesToMove.length) return res.status(404).json({ error: '未找到要移动的文件' });

    fromCategory.files = fromCategory.files.filter(f => !fileIds.includes(f.id));
    toCategory.files.push(...filesToMove);

    await Promise.all(
      scope.scopedClaims.map((item) =>
        saveCase(item.id, {
          ...item,
          attachments: cloneAttachments(nextAttachments),
        })
      )
    );

    res.json({ success: true, data: nextAttachments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除指定文件夹中的附件
app.delete('/claims/:ref/attachments/:folder/:fileId', async (req, res) => {
  try {
    const scope = await resolveAttachmentScope(req.params.ref);
    if (!scope) return res.status(404).json({ error: '案件不存在' });

    const { folder, fileId } = req.params;
    const nextAttachments = cloneAttachments(scope.owner.attachments || []);
    if (!nextAttachments.length) return res.status(404).json({ error: '没有附件' });

    const category = nextAttachments.find(c => c.key === folder);
    if (!category) return res.status(404).json({ error: '文件夹不存在' });

    const fileIndex = category.files.findIndex(f => f.id === fileId);
    if (fileIndex === -1) return res.status(404).json({ error: '文件不存在' });

    category.files.splice(fileIndex, 1);

    await Promise.all(
      scope.scopedClaims.map((item) =>
        saveCase(item.id, {
          ...item,
          attachments: cloneAttachments(nextAttachments),
        })
      )
    );

    res.json({ success: true, data: nextAttachments, case_no: scope.caseNo });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── 辅助管理：复勘 / 调查 / 诉讼 ──────────────────────────────────────
// 复勘任务
app.get('/re-inspections', async (_req, res) => {
  try {
    const items = await listReInspectionTasks();
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '复勘任务查询失败' });
  }
});

app.get('/re-inspections/:id', async (req, res) => {
  const item = await getReInspectionTask(req.params.id);
  if (!item) return res.status(404).json({ error: '复勘任务不存在' });
  res.json(item);
});

app.post('/re-inspections', async (req, res) => {
  try {
    const saved = await upsertReInspectionTask(req.body || {});
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建复勘任务失败' });
  }
});

app.put('/re-inspections/:id', async (req, res) => {
  try {
    const saved = await upsertReInspectionTask({ ...req.body, id: req.params.id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新复勘任务失败' });
  }
});

app.delete('/re-inspections/:id', async (req, res) => {
  await deleteReInspectionTask(req.params.id);
  res.json({ success: true });
});

// 调查任务
app.get('/investigations', async (_req, res) => {
  try {
    const items = await listInvestigationTasks();
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '调查任务查询失败' });
  }
});

app.get('/investigations/:id', async (req, res) => {
  const item = await getInvestigationTask(req.params.id);
  if (!item) return res.status(404).json({ error: '调查任务不存在' });
  res.json(item);
});

app.post('/investigations', async (req, res) => {
  try {
    const saved = await upsertInvestigationTask(req.body || {});
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建调查任务失败' });
  }
});

app.put('/investigations/:id', async (req, res) => {
  try {
    const saved = await upsertInvestigationTask({ ...req.body, id: req.params.id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新调查任务失败' });
  }
});

app.delete('/investigations/:id', async (req, res) => {
  await deleteInvestigationTask(req.params.id);
  res.json({ success: true });
});

// 诉讼登记
app.get('/litigations', async (_req, res) => {
  try {
    const items = await listLitigationRecords();
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message || '诉讼登记查询失败' });
  }
});

app.get('/litigations/:id', async (req, res) => {
  const item = await getLitigationRecord(req.params.id);
  if (!item) return res.status(404).json({ error: '诉讼记录不存在' });
  res.json(item);
});

app.post('/litigations', async (req, res) => {
  try {
    const saved = await upsertLitigationRecord(req.body || {});
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '创建诉讼登记失败' });
  }
});

app.put('/litigations/:id', async (req, res) => {
  try {
    const saved = await upsertLitigationRecord({ ...req.body, id: req.params.id });
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message || '更新诉讼登记失败' });
  }
});

app.delete('/litigations/:id', async (req, res) => {
  await deleteLitigationRecord(req.params.id);
  res.json({ success: true });
});

// ─── 补充任务（统一表）───────────────────────────────────────────────
app.get('/auxiliary-tasks', async (req, res) => {
  const { case_id, case_task_id, auxiliary_type, status } = req.query as Record<string, string | undefined>;
  const items = await listAuxiliaryTasks({
    case_id,
    case_task_id,
    auxiliary_type: auxiliary_type as any,
    status: status as any,
  });
  res.json(items);
});

app.get('/auxiliary-tasks/:id', async (req, res) => {
  const item = await getAuxiliaryTask(req.params.id);
  if (!item) return res.status(404).json({ error: '补充任务不存在' });
  res.json(item);
});

app.post('/auxiliary-tasks', async (req, res) => {
  try {
    const id = (req.body && req.body.id) || `aux-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const saved = await upsertAuxiliaryTask(id, req.body || {});
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.put('/auxiliary-tasks/:id', async (req, res) => {
  try {
    const saved = await upsertAuxiliaryTask(req.params.id, req.body || {});
    res.json({ success: true, data: saved });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/auxiliary-tasks/:id', async (req, res) => {
  await deleteAuxiliaryTask(req.params.id);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(Number(PORT), HOST, () => {
  console.log(`Rider Backend API running on http://${HOST}:${PORT}`);
});