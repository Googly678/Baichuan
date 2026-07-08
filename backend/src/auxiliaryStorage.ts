import fs from 'fs/promises';
import path from 'path';
import { kvGet, kvSet } from './kvStorage';

/**
 * 辅助管理模块的键值存储
 *
 * - 复勘管理 (re_inspection_tasks)
 * - 调查任务管理 (investigation_tasks)
 * - 诉讼登记管理 (litigation_records)
 *
 * 与项目其它 storage 行为对齐：
 * 优先 KV（PostgreSQL），失败时回退到本地 JSON 文件（仅当 ALLOW_JSON_FALLBACK=true）。
 * KV 不可用且未开启回退时，写入会向上抛错，与 claims/core_claims 等模块保持一致。
 */

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.resolve(dataDir, 'auxiliary-data.json');
const tempDataFile = path.resolve(dataDir, 'auxiliary-data.json.tmp');
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

async function ensureAuxFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, '{}', 'utf-8');
  }
}

async function readAuxFile(): Promise<Record<string, unknown[]>> {
  await ensureAuxFile();
  try {
    const raw = await fs.readFile(dataFile, 'utf-8');
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
}

async function writeAuxFile(payload: Record<string, unknown[]>) {
  if (!allowJsonFallback) {
    throw new Error('数据库不可用，且未开启 JSON 回退');
  }
  const content = JSON.stringify(payload, null, 2);
  await fs.writeFile(tempDataFile, content, 'utf-8');
  await fs.rename(tempDataFile, dataFile);
}

/** 通用辅助：尝试持久化到 KV，失败且允许时回退到 JSON。回退成功后将后续读写都切到 JSON 模式。 */
function makePersistor<T extends { id: string }>(
  namespace: string,
  fileBucket: string,
  index: Map<string, T>,
  kvEnabledRef: { value: boolean }
) {
  return async function persist() {
    if (kvEnabledRef.value) {
      try {
        const all = Array.from(index.values());
        await kvSet(namespace, 'all', all);
        return;
      } catch (err) {
        if (!allowJsonFallback) throw err;
        kvEnabledRef.value = false;
      }
    }
    // JSON 回退
    const file = await readAuxFile();
    file[fileBucket] = Array.from(index.values());
    await writeAuxFile(file);
  };
}

function makeLoader<T>(
  namespace: string,
  fileBucket: string,
  index: Map<string, T>,
  loadedRef: { value: boolean },
  kvEnabledRef: { value: boolean }
) {
  return async function load() {
    if (loadedRef.value) return;
    if (kvEnabledRef.value) {
      try {
        const all = await kvGet<T[]>(namespace, 'all');
        if (Array.isArray(all)) {
          for (const item of all) (index as Map<string, T>).set((item as any).id, item);
        }
        loadedRef.value = true;
        return;
      } catch {
        if (!allowJsonFallback) {
          loadedRef.value = true;
          return;
        }
        kvEnabledRef.value = false;
      }
    }
    // JSON 回退加载
    try {
      const file = await readAuxFile();
      const items = file[fileBucket];
      if (Array.isArray(items)) {
        for (const item of items) (index as Map<string, T>).set((item as any).id, item as T);
      }
    } finally {
      loadedRef.value = true;
    }
  };
}

function nowText() {
  return new Date().toISOString();
}

// ─── 复勘任务 ────────────────────────────────────────────────────────
export type ReInspectionStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ReInspectionTask {
  id: string;
  case_no: string;             // 关联报案号
  case_id?: string;            // 关联案件 id（可选）
  rider_name?: string;         // 冗余，便于列表展示
  trigger_reason: string;      // 复勘触发原因
  inspector: string;           // 复勘员
  scheduled_at?: string;       // 计划复勘时间
  completed_at?: string;       // 实际完成时间
  location?: string;           // 复勘地点
  conclusion?: string;         // 复勘结论
  blocking: boolean;           // 是否阻塞结案
  status: ReInspectionStatus;
  created_at: string;
  updated_at: string;
  remark?: string;
}

const RE_INSPECTION_NAMESPACE = 're_inspection_tasks';
const RE_INSPECTION_FILE_BUCKET = 're_inspection_tasks';
const reInspectionIndex: Map<string, ReInspectionTask> = new Map();
const reInspectionState = { value: false };
const reInspectionKvEnabled = { value: true };
const loadReInspection = makeLoader<ReInspectionTask>(
  RE_INSPECTION_NAMESPACE,
  RE_INSPECTION_FILE_BUCKET,
  reInspectionIndex,
  reInspectionState,
  reInspectionKvEnabled
);
const persistReInspection = makePersistor(
  RE_INSPECTION_NAMESPACE,
  RE_INSPECTION_FILE_BUCKET,
  reInspectionIndex,
  reInspectionKvEnabled
);

export async function listReInspectionTasks(): Promise<ReInspectionTask[]> {
  await loadReInspection();
  return Array.from(reInspectionIndex.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getReInspectionTask(id: string) {
  await loadReInspection();
  return reInspectionIndex.get(id) || null;
}

export async function upsertReInspectionTask(payload: Partial<ReInspectionTask> & { id?: string }) {
  await loadReInspection();
  const now = nowText();
  const id = payload.id || `reinspect-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const existing = reInspectionIndex.get(id);
  const merged: ReInspectionTask = {
    id,
    case_no: payload.case_no ?? existing?.case_no ?? '',
    case_id: payload.case_id ?? existing?.case_id,
    rider_name: payload.rider_name ?? existing?.rider_name,
    trigger_reason: payload.trigger_reason ?? existing?.trigger_reason ?? '',
    inspector: payload.inspector ?? existing?.inspector ?? '',
    scheduled_at: payload.scheduled_at ?? existing?.scheduled_at,
    completed_at: payload.completed_at ?? existing?.completed_at,
    location: payload.location ?? existing?.location,
    conclusion: payload.conclusion ?? existing?.conclusion,
    blocking: payload.blocking ?? existing?.blocking ?? false,
    status: payload.status ?? existing?.status ?? 'PENDING',
    created_at: existing?.created_at ?? now,
    updated_at: now,
    remark: payload.remark ?? existing?.remark,
  };
  // 写前快照：持久化失败时回滚到写入前的状态
  const hadEntry = reInspectionIndex.has(id);
  const prevEntry = hadEntry ? reInspectionIndex.get(id) : undefined;
  reInspectionIndex.set(id, merged);
  try {
    await persistReInspection();
  } catch (err) {
    // 回滚内存，避免 GET 到未持久化的脏数据
    if (hadEntry && prevEntry) reInspectionIndex.set(id, prevEntry);
    else reInspectionIndex.delete(id);
    throw err;
  }
  return merged;
}

export async function deleteReInspectionTask(id: string) {
  await loadReInspection();
  const hadEntry = reInspectionIndex.has(id);
  const prevEntry = hadEntry ? reInspectionIndex.get(id) : undefined;
  if (!hadEntry) return { success: true };
  reInspectionIndex.delete(id);
  try {
    await persistReInspection();
  } catch (err) {
    if (prevEntry) reInspectionIndex.set(id, prevEntry);
    throw err;
  }
  return { success: true };
}

// ─── 调查任务 ────────────────────────────────────────────────────────
export type InvestigationType = 'FIELD' | 'INTERVIEW' | 'EVIDENCE' | 'PUBLIC_SECURITY' | 'OTHER';
export type InvestigationStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface InvestigationTask {
  id: string;
  case_no: string;
  case_id?: string;
  rider_name?: string;
  investigation_type: InvestigationType;   // 调查类型
  investigator: string;                    // 调查员
  target: string;                          // 调查对象 / 调查目的
  scheduled_at?: string;
  completed_at?: string;
  finding?: string;                        // 调查发现
  status: InvestigationStatus;
  blocking: boolean;                       // 是否阻塞结案
  created_at: string;
  updated_at: string;
  remark?: string;
}

const INVESTIGATION_NAMESPACE = 'investigation_tasks';
const INVESTIGATION_FILE_BUCKET = 'investigation_tasks';
const investigationIndex: Map<string, InvestigationTask> = new Map();
const investigationState = { value: false };
const investigationKvEnabled = { value: true };
const loadInvestigation = makeLoader<InvestigationTask>(
  INVESTIGATION_NAMESPACE,
  INVESTIGATION_FILE_BUCKET,
  investigationIndex,
  investigationState,
  investigationKvEnabled
);
const persistInvestigation = makePersistor(
  INVESTIGATION_NAMESPACE,
  INVESTIGATION_FILE_BUCKET,
  investigationIndex,
  investigationKvEnabled
);

export async function listInvestigationTasks(): Promise<InvestigationTask[]> {
  await loadInvestigation();
  return Array.from(investigationIndex.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getInvestigationTask(id: string) {
  await loadInvestigation();
  return investigationIndex.get(id) || null;
}

export async function upsertInvestigationTask(payload: Partial<InvestigationTask> & { id?: string }) {
  await loadInvestigation();
  const now = nowText();
  const id = payload.id || `investigate-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const existing = investigationIndex.get(id);
  const merged: InvestigationTask = {
    id,
    case_no: payload.case_no ?? existing?.case_no ?? '',
    case_id: payload.case_id ?? existing?.case_id,
    rider_name: payload.rider_name ?? existing?.rider_name,
    investigation_type: payload.investigation_type ?? existing?.investigation_type ?? 'FIELD',
    investigator: payload.investigator ?? existing?.investigator ?? '',
    target: payload.target ?? existing?.target ?? '',
    scheduled_at: payload.scheduled_at ?? existing?.scheduled_at,
    completed_at: payload.completed_at ?? existing?.completed_at,
    finding: payload.finding ?? existing?.finding,
    status: payload.status ?? existing?.status ?? 'PENDING',
    blocking: payload.blocking ?? existing?.blocking ?? false,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    remark: payload.remark ?? existing?.remark,
  };
  const hadEntry = investigationIndex.has(id);
  const prevEntry = hadEntry ? investigationIndex.get(id) : undefined;
  investigationIndex.set(id, merged);
  try {
    await persistInvestigation();
  } catch (err) {
    if (hadEntry && prevEntry) investigationIndex.set(id, prevEntry);
    else investigationIndex.delete(id);
    throw err;
  }
  return merged;
}

export async function deleteInvestigationTask(id: string) {
  await loadInvestigation();
  const hadEntry = investigationIndex.has(id);
  const prevEntry = hadEntry ? investigationIndex.get(id) : undefined;
  if (!hadEntry) return { success: true };
  investigationIndex.delete(id);
  try {
    await persistInvestigation();
  } catch (err) {
    if (prevEntry) investigationIndex.set(id, prevEntry);
    throw err;
  }
  return { success: true };
}

// ─── 诉讼登记 ────────────────────────────────────────────────────────
export type LitigationRole = 'PLAINTIFF' | 'DEFENDANT' | 'THIRD_PARTY';
export type LitigationStatus = 'ACCEPTED' | 'IN_TRIAL' | 'JUDGMENT' | 'CLOSED' | 'WITHDRAWN';
/** 代理形式：员工（公司内部）代理 / 律师代理 */
export type LitigationAgentType = 'STAFF' | 'LAWYER';

export interface LitigationRecord {
  id: string;
  case_no: string;
  case_id?: string;
  rider_name?: string;
  court: string;                       // 受诉法院
  case_court_no?: string;              // 法院案号
  accepted_at?: string;                // 立案日期
  role: LitigationRole;                // 我方诉讼地位
  counterparty?: string;               // 对方当事人
  claim_amount?: number;               // 诉请金额
  judgment_at?: string;                // 判决日期
  judgment_summary?: string;           // 判决结果概述
  judgment_amount?: number;            // 判决金额（实际赔付给对方/对方的金额）
  court_fee?: number;                  // 诉讼费（法院收取）
  agent_type?: LitigationAgentType;    // 代理形式：员工 / 律师
  lawyer_name?: string;                // 代理律师姓名（agent_type=LAWYER 时填）
  lawyer_fee?: number;                 // 律师代理费（agent_type=LAWYER 时填）
  status: LitigationStatus;            // 当前诉讼状态
  created_at: string;
  updated_at: string;
  remark?: string;
}

const LITIGATION_NAMESPACE = 'litigation_records';
const LITIGATION_FILE_BUCKET = 'litigation_records';
const litigationIndex: Map<string, LitigationRecord> = new Map();
const litigationState = { value: false };
const litigationKvEnabled = { value: true };
const loadLitigation = makeLoader<LitigationRecord>(
  LITIGATION_NAMESPACE,
  LITIGATION_FILE_BUCKET,
  litigationIndex,
  litigationState,
  litigationKvEnabled
);
const persistLitigation = makePersistor(
  LITIGATION_NAMESPACE,
  LITIGATION_FILE_BUCKET,
  litigationIndex,
  litigationKvEnabled
);

export async function listLitigationRecords(): Promise<LitigationRecord[]> {
  await loadLitigation();
  return Array.from(litigationIndex.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export async function getLitigationRecord(id: string) {
  await loadLitigation();
  return litigationIndex.get(id) || null;
}

export async function upsertLitigationRecord(payload: Partial<LitigationRecord> & { id?: string }) {
  await loadLitigation();
  const now = nowText();
  const id = payload.id || `litigation-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const existing = litigationIndex.get(id);
  const merged: LitigationRecord = {
    id,
    case_no: payload.case_no ?? existing?.case_no ?? '',
    case_id: payload.case_id ?? existing?.case_id,
    rider_name: payload.rider_name ?? existing?.rider_name,
    court: payload.court ?? existing?.court ?? '',
    case_court_no: payload.case_court_no ?? existing?.case_court_no,
    accepted_at: payload.accepted_at ?? existing?.accepted_at,
    role: payload.role ?? existing?.role ?? 'DEFENDANT',
    counterparty: payload.counterparty ?? existing?.counterparty,
    claim_amount: payload.claim_amount ?? existing?.claim_amount,
    judgment_at: payload.judgment_at ?? existing?.judgment_at,
    judgment_summary: payload.judgment_summary ?? existing?.judgment_summary,
    judgment_amount: payload.judgment_amount ?? existing?.judgment_amount,
    court_fee: payload.court_fee ?? existing?.court_fee,
    agent_type: payload.agent_type ?? existing?.agent_type,
    lawyer_name: payload.lawyer_name ?? existing?.lawyer_name,
    lawyer_fee: payload.lawyer_fee ?? existing?.lawyer_fee,
    status: payload.status ?? existing?.status ?? 'ACCEPTED',
    created_at: existing?.created_at ?? now,
    updated_at: now,
    remark: payload.remark ?? existing?.remark,
  };
  const hadEntry = litigationIndex.has(id);
  const prevEntry = hadEntry ? litigationIndex.get(id) : undefined;
  litigationIndex.set(id, merged);
  try {
    await persistLitigation();
  } catch (err) {
    if (hadEntry && prevEntry) litigationIndex.set(id, prevEntry);
    else litigationIndex.delete(id);
    throw err;
  }
  return merged;
}

export async function deleteLitigationRecord(id: string) {
  await loadLitigation();
  const hadEntry = litigationIndex.has(id);
  const prevEntry = hadEntry ? litigationIndex.get(id) : undefined;
  if (!hadEntry) return { success: true };
  litigationIndex.delete(id);
  try {
    await persistLitigation();
  } catch (err) {
    if (prevEntry) litigationIndex.set(id, prevEntry);
    throw err;
  }
  return { success: true };
}

// ─── 补充任务（统一表）───────────────────────────────────────────────
// 业务说明：
// - 复勘 / 调查统一写入本表（与旧 re_inspection_tasks / investigation_tasks 并存但标记 deprecated）
// - 通过 case_task_id 与案件主任务软引用（不修改 case.tasks[]）
// - 状态机：PENDING → UNDER_REVIEW → COMPLETED / REJECTED（与主流程 9 状态完全独立）
// - blocking=true 时案件 investigation_blocking=true，COMPLETED 时回写解锁
export type AuxiliaryType = 'RE_INSPECTION' | 'INVESTIGATION';
export type AuxiliaryStatus = 'PENDING' | 'UNDER_REVIEW' | 'COMPLETED' | 'REJECTED';

export interface AuxiliaryTask {
  id: string;
  case_id: string;                  // 案件 ID（必填）
  case_no: string;                  // 案件号（冗余，便于列表）
  case_task_id?: string;            // 关联的主任务 ID（软引用；空表示"案件级"补充任务）
  auxiliary_type: AuxiliaryType;    // 复勘 / 调查
  status: AuxiliaryStatus;          // 当前状态
  blocking: boolean;                // 是否阻塞主任务推进
  title: string;                    // 简述（如"调查伤情真实性"）
  reason: string;                   // 发起原因
  operator: string;                 // 发起人（角色+姓名）
  reviewer?: string;                // 审核人
  conclusion?: string;              // 完成/审核结论
  completed_at?: string;            // 完成时间
  created_at: string;
  updated_at: string;
  remark?: string;
}

const AUX_NAMESPACE = 'auxiliary_tasks';
const AUX_FILE_BUCKET = 'auxiliary_tasks';
const auxiliaryIndex: Map<string, AuxiliaryTask> = new Map();
const auxKvEnabledRef = { value: true };
const auxLoadedRef = { value: false };
const persistAuxiliary = makePersistor<AuxiliaryTask>(AUX_NAMESPACE, AUX_FILE_BUCKET, auxiliaryIndex, auxKvEnabledRef);
const loadAuxiliary = makeLoader<AuxiliaryTask>(AUX_NAMESPACE, AUX_FILE_BUCKET, auxiliaryIndex, auxLoadedRef, auxKvEnabledRef);

export async function listAuxiliaryTasks(filter?: { case_id?: string; case_task_id?: string; auxiliary_type?: AuxiliaryType; status?: AuxiliaryStatus }): Promise<AuxiliaryTask[]> {
  await loadAuxiliary();
  let items = Array.from(auxiliaryIndex.values());
  if (filter?.case_id) items = items.filter((t) => t.case_id === filter.case_id);
  if (filter?.case_task_id) items = items.filter((t) => t.case_task_id === filter.case_task_id);
  if (filter?.auxiliary_type) items = items.filter((t) => t.auxiliary_type === filter.auxiliary_type);
  if (filter?.status) items = items.filter((t) => t.status === filter.status);
  return items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

export async function getAuxiliaryTask(id: string): Promise<AuxiliaryTask | undefined> {
  await loadAuxiliary();
  return auxiliaryIndex.get(id);
}

export async function upsertAuxiliaryTask(id: string, payload: Partial<AuxiliaryTask>): Promise<AuxiliaryTask> {
  await loadAuxiliary();
  const now = nowText();
  const existing = auxiliaryIndex.get(id);
  const merged: AuxiliaryTask = {
    id,
    case_id: payload.case_id ?? existing?.case_id ?? '',
    case_no: payload.case_no ?? existing?.case_no ?? '',
    case_task_id: payload.case_task_id ?? existing?.case_task_id,
    auxiliary_type: payload.auxiliary_type ?? existing?.auxiliary_type ?? 'INVESTIGATION',
    status: payload.status ?? existing?.status ?? 'PENDING',
    blocking: payload.blocking ?? existing?.blocking ?? false,
    title: payload.title ?? existing?.title ?? '',
    reason: payload.reason ?? existing?.reason ?? '',
    operator: payload.operator ?? existing?.operator ?? '',
    reviewer: payload.reviewer ?? existing?.reviewer,
    conclusion: payload.conclusion ?? existing?.conclusion,
    completed_at: payload.completed_at ?? existing?.completed_at,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    remark: payload.remark ?? existing?.remark,
  };
  const hadEntry = auxiliaryIndex.has(id);
  const prevEntry = hadEntry ? auxiliaryIndex.get(id) : undefined;
  auxiliaryIndex.set(id, merged);
  try {
    await persistAuxiliary();
  } catch (err) {
    if (hadEntry && prevEntry) auxiliaryIndex.set(id, prevEntry);
    else auxiliaryIndex.delete(id);
    throw err;
  }
  return merged;
}

export async function deleteAuxiliaryTask(id: string): Promise<{ success: true }> {
  await loadAuxiliary();
  const hadEntry = auxiliaryIndex.has(id);
  const prevEntry = hadEntry ? auxiliaryIndex.get(id) : undefined;
  if (!hadEntry) return { success: true };
  auxiliaryIndex.delete(id);
  try {
    await persistAuxiliary();
  } catch (err) {
    if (prevEntry) auxiliaryIndex.set(id, prevEntry);
    throw err;
  }
  return { success: true };
}
