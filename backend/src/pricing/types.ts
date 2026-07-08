/**
 * 自助定价引擎 — 纯领域类型
 *
 * 设计原则：
 *  - 引擎只依赖这些类型，不依赖 ORM、不依赖 Express
 *  - 所有金额用「分」整数存储（避免浮点误差），对外 API 才转元
 *  - 快照时间（filing_time）一旦确定，所有地区参数/药品属性以此为准
 *
 * 关键概念：
 *  - DrugLine: 一行药（一支/一盒/一组）
 *  - MedicalBill: 一张发票的多个 DrugLine
 *  - 排除结果用 ExcludeReason 描述（合规留痕）
 *  - QuotaLimit 三层（per_person / per_incident / per_period）
 */

// ─── 行政区划 ────────────────────────────────────────────
/** GB/T 2260 行政区划码，6 位字符串（不足左补 0） */
export type RegionCode = string; // e.g. "510104" "320100" "000000"=国家

export type RegionLevel = 'NATIONAL' | 'PROVINCE' | 'CITY' | 'DISTRICT';

// ─── 药品目录 ────────────────────────────────────────────
export type DrugCategory = 'A' | 'B' | 'C' | 'OUT';

export interface MedicineBase {
  /** 药品本位码（药监码），最稳定的 ID */
  drug_code: string;
  generic_name: string;
  dosage_form?: string;
  spec?: string;
  manufacturer?: string;
}

/**
 * 药品在某地区的属性 — 跨地区差异的根源
 *  - 同一药监码在不同省/市可有不同 category / self_pay_ratio / limit_price
 *  - 必须带 effective_date，引擎会按快照时间筛选
 */
export interface MedicineRegionAttr {
  medicine_id: string;
  region_code: RegionCode;
  region_level: RegionLevel;
  category: DrugCategory;
  /** 乙类自付比例，0~1；甲类为 0 */
  self_pay_ratio: number;
  /** 医保支付标准（限价），单位「分」；null 表示无限价 */
  limit_price: number | null;
  /** 限适应症（ICD-10 范围，逗号分隔前缀匹配），null=不限 */
  scope_limit: string | null;
  /** 谈判药标记 */
  is_negotiated: boolean;
  effective_date: string; // ISO date
  expire_date: string | null;
  source: 'NATIONAL' | 'PROVINCE' | 'CITY';
}

/**
 * 地区结算参数 — 起付线、报销比例、限额、跨省折扣
 *  - 三级医院分别配（实际系统中可能更细，但 demo 简化）
 */
export interface RegionParam {
  region_code: RegionCode;
  region_level: RegionLevel;

  // 起付线（分）
  deductible_tier1: number; // 社区
  deductible_tier2: number; // 二级
  deductible_tier3: number; // 三甲

  // 报销比例（0~1）
  reimburse_rate_tier1: number;
  reimburse_rate_tier2: number;
  reimburse_rate_tier3: number;

  // 年封顶（分）
  annual_cap: number | null;

  // 跨省异地折扣（0~1，扣减报销比例）
  cross_province_discount: number;

  effective_date: string;
  expire_date: string | null;
  source: 'NATIONAL' | 'PROVINCE' | 'CITY';
}

// ─── 条款级口径配置（per 产品/险种） ─────────────────────
/**
 * 剔除口径 — 决定 "自费药怎么算"
 *  - INSURANCE_CATALOG: 走保险条款自定义口径（可与医保不同）
 *  - LOCAL_MEDICAL:     以就医地医保口径为准（推荐）
 *  - MEDICAL_SETTLEMENT: 客户已提供医保结算单，按结算单为准（金标准）
 */
export type ExclusionSource = 'INSURANCE_CATALOG' | 'LOCAL_MEDICAL' | 'MEDICAL_SETTLEMENT';

export interface ClauseConfig {
  product_id: string;
  coverage_code: string;

  /** 剔除依据（默认 LOCAL_MEDICAL） */
  exclusion_source: ExclusionSource;

  /** 乙类自付处理：true=自付部分也剔除 / false=自付部分纳入可赔 */
  exclude_b_class_self_pay: boolean;

  /** 进口药处理 */
  imported_drug_policy: 'EXCLUDE' | 'LIMIT_PRICE' | 'INCLUDE';

  /** 超适应症处理 */
  off_label_policy: 'EXCLUDE' | 'MANUAL' | 'INCLUDE';

  /** 找不到药品属性时（默认人工复核+金额归零） */
  unknown_drug_policy: 'MANUAL_REVIEW' | 'INCLUDE_DEFAULT';

  /** 条款免赔率（0~1，整体再扣） */
  deductible_ratio: number;

  /** 责任比例（0~1，按责任认定） */
  liability_ratio: number;

  /** 限额（分） */
  limits: QuotaLimits;
}

// ─── 三层限额 ────────────────────────────────────────────
export interface QuotaLimits {
  /** 单人单次限额 */
  per_person: number | null;
  /** 单次事故限额（多人共享） */
  per_incident: number | null;
  /** 保单年度累计限额 */
  per_period: number | null;
}

export interface QuotaUsage {
  /** 同一保单下，本案件之前已用掉的金额（分） */
  used_in_period: number;
}

// ─── 输入：明细 ─────────────────────────────────────────
/**
 * 药品明细（一行）
 *  - unit_price 单位「分」
 *  - qty 单位「支/盒」，必须是正整数
 *  - 若提供 drug_code，按药监码匹配；否则按 generic_name 模糊
 *  - 若医院已提供结算单自付金额（hospital_self_pay），引擎可优先用
 */
export interface DrugLine {
  line_no: string;
  drug_code?: string;
  generic_name: string;
  dosage_form?: string;
  spec?: string;
  qty: number;
  unit_price: number; // 分
  /** 医院结算单上的"医院认定自费"金额（分），可选 */
  hospital_self_pay?: number;
  /** 临床诊断（ICD-10），用于适应症匹配 */
  diagnosis_icd10?: string;
  /** 是否进口药 */
  is_imported?: boolean;
  /** 是否谈判药（高价药） */
  is_negotiated?: boolean;
}

export interface MedicalBill {
  bill_no: string;
  region_code: RegionCode;          // 就医地（按此查地区参数）
  insured_region_code: RegionCode;  // 参保地（按此查部分参数）
  hospital_tier: 'TIER_1' | 'TIER_2' | 'TIER_3';
  is_cross_province: boolean;
  bill_date: string;                // ISO date
  drug_lines: DrugLine[];
  /** 若客户提供医保结算单（结算单模式），整张发票级自费合计（分） */
  settlement_self_pay_total?: number;
}

// ─── 引擎上下文（计算时的"环境"） ─────────────────────
export interface PricingContext {
  /** 立案时间（快照锚点） */
  filing_time: string; // ISO datetime
  /** 案件/任务 ID（审计用） */
  case_id: string;
  task_id: string;
  /** 操作员（人工调整留痕） */
  operator: string;

  medicines: MedicineBase[];
  medicine_attrs: MedicineRegionAttr[];
  region_params: RegionParam[];

  clause: ClauseConfig;
  quota_usage: QuotaUsage;
}

// ─── 输出：单条药品的处理结果 ─────────────────────────
export interface DrugLineDecision {
  line_no: string;
  generic_name: string;

  /** 原始金额 = qty * unit_price */
  gross_amount: number;

  /** 医保属性匹配结果 */
  matched: boolean;
  matched_attr: MedicineRegionAttr | null;
  /** 匹配用到的级别（就医地/省/国家/未匹配） */
  matched_level: 'CITY' | 'PROVINCE' | 'NATIONAL' | 'NONE';

  /** 自费剔除金额 */
  self_pay_amount: number;
  /** 限价截断金额（实际单价>限价时的差额） */
  limit_excess: number;
  /** 适应症不符剔除 */
  off_label_excluded: number;

  /** 纳入可赔范围金额（gross - 各项剔除） */
  reimbursable_amount: number;

  /** 排除原因（多选） */
  reasons: ExcludeReason[];

  /** 是否需要人工复核 */
  needs_manual_review: boolean;
}

export type ExcludeReason =
  | { kind: 'OUT_OF_CATALOG'; detail: string }
  | { kind: 'C_CLASS_FULL_SELF_PAY'; detail: string }
  | { kind: 'B_CLASS_SELF_PAY'; detail: string; ratio: number }
  | { kind: 'LIMIT_PRICE_EXCESS'; detail: string; limit: number; actual: number }
  | { kind: 'OFF_LABEL'; detail: string; icd10: string }
  | { kind: 'IMPORTED_EXCLUDED'; detail: string }
  | { kind: 'NOT_MATCHED'; detail: string }
  | { kind: 'SETTLEMENT_OVERRIDE'; detail: string };

// ─── 输出：发票级 + 任务级结果 ─────────────────────────
export interface BillDecision {
  bill_no: string;
  drug_decisions: DrugLineDecision[];

  gross_total: number;
  self_pay_total: number;
  limit_excess_total: number;
  off_label_total: number;
  reimbursable_total: number;

  /** 地区参数匹配结果 */
  region_matched: boolean;
  matched_region: RegionParam | null;
  matched_region_level: 'CITY' | 'PROVINCE' | 'NATIONAL' | 'NONE';
}

export interface PricingResult {
  case_id: string;
  task_id: string;
  filing_time: string;
  operator: string;

  bills: BillDecision[];

  // 累计
  gross_total: number;
  reimbursable_total: number;     // 剔除后
  after_deductible: number;       // 扣免赔率
  after_liability: number;        // 扣责任比例
  after_quota: number;            // 扣限额嵌套
  final_payout: number;           // 最终赔付

  /** 限额使用情况（用于下次计算） */
  quota_remaining: QuotaLimits;

  /** 审计日志 — 每一步可回放 */
  audit_entries: AuditEntry[];

  /** 是否触发人工复核 */
  needs_manual_review: boolean;
  review_reasons: string[];
}

export interface AuditEntry {
  step: 'MATCH' | 'EXCLUDE' | 'QUOTA' | 'DEDUCTIBLE' | 'LIABILITY' | 'OVERRIDE';
  line_no?: string;
  bill_no?: string;
  before: number;
  after: number;
  rule: string;
  detail?: string;
  operator: string;
  ts: string;
}
