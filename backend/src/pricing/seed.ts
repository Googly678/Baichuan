/**
 * 5 条真实乙类药样例 + 1 个跨省案例
 *
 * 数据基于 2024 国家医保药品目录（公开数据），匹配规则：
 *  - 国家目录 320000011744-3 / 320000011744-3 / 320000001234 等占位
 *  - 真实通用名 + 真实适应症 + 真实限价
 *  - 跨省调整通过 region_code 模拟
 */

import type {
  ClauseConfig,
  MedicineBase,
  MedicineRegionAttr,
  PricingContext,
  RegionParam,
} from './types';

// ─── 药品基础（5 条真实样例） ───────────────────────
export const SAMPLE_MEDICINES: MedicineBase[] = [
  {
    drug_code: '86979271000010',  // 头孢呋辛酯片（达力先）通用名：头孢呋辛酯
    generic_name: '头孢呋辛酯',
    dosage_form: '片剂',
    spec: '0.25g*12片',
    manufacturer: '国药集团工业',
  },
  {
    drug_code: '86901482000013',  // 阿莫西林克拉维酸钾
    generic_name: '阿莫西林克拉维酸钾',
    dosage_form: '注射剂',
    spec: '1.2g*1支',
    manufacturer: '华北制药',
  },
  {
    drug_code: '86978049000015',  // 注射用头孢曲松钠（罗氏芬仿制）
    generic_name: '头孢曲松钠',
    dosage_form: '注射剂',
    spec: '1.0g*1支',
    manufacturer: '上海新亚',
  },
  {
    drug_code: '86978860000011',  // 进口原研 — 阿斯利康 普米克令舒
    generic_name: '布地奈德',
    dosage_form: '吸入用混悬液',
    spec: '1mg*5支',
    manufacturer: 'AstraZeneca',
  },
  {
    drug_code: '86979599000019',  // 目录外药 — 某中药制剂
    generic_name: '复方斑蝥胶囊',
    dosage_form: '胶囊剂',
    spec: '0.25g*24粒',
    manufacturer: '贵州益佰',
  },
  {
    drug_code: '86901024000017',  // 进口药 — 来得时 甘精胰岛素
    generic_name: '甘精胰岛素',
    dosage_form: '注射剂',
    spec: '300单位/支',
    manufacturer: 'Sanofi',
  },
];

// ─── 地区属性（按国家/省/市三级） ──────────────────
export const SAMPLE_ATTRS: MedicineRegionAttr[] = [
  // 头孢呋辛酯 — 国家乙类 10%
  {
    medicine_id: '86979271000010',
    region_code: '000000',
    region_level: 'NATIONAL',
    category: 'B',
    self_pay_ratio: 0.1,
    limit_price: null,
    scope_limit: null,
    is_negotiated: false,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
  // 阿莫西林克拉维酸钾 — 国家甲类
  {
    medicine_id: '86901482000013',
    region_code: '000000',
    region_level: 'NATIONAL',
    category: 'A',
    self_pay_ratio: 0,
    limit_price: null,
    scope_limit: null,
    is_negotiated: false,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
  // 头孢曲松钠 — 国家乙类 5%
  {
    medicine_id: '86978049000015',
    region_code: '000000',
    region_level: 'NATIONAL',
    category: 'B',
    self_pay_ratio: 0.05,
    limit_price: 4500, // 限价 45 元
    scope_limit: null,
    is_negotiated: false,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
  // 头孢曲松钠 — 浙江提升到乙类 10%（省级调整）
  {
    medicine_id: '86978049000015',
    region_code: '330000',
    region_level: 'PROVINCE',
    category: 'B',
    self_pay_ratio: 0.1,
    limit_price: 4800,
    scope_limit: null,
    is_negotiated: false,
    effective_date: '2024-03-01',
    expire_date: null,
    source: 'PROVINCE',
  },
  // 布地奈德 — 国家乙类 20%，限适应症（哮喘）
  {
    medicine_id: '86978860000011',
    region_code: '000000',
    region_level: 'NATIONAL',
    category: 'B',
    self_pay_ratio: 0.2,
    limit_price: 8800,
    scope_limit: 'J45,J44',
    is_negotiated: false,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
  // 复方斑蝥胶囊 — 目录外
  {
    medicine_id: '86979599000019',
    region_code: '000000',
    region_level: 'NATIONAL',
    category: 'OUT',
    self_pay_ratio: 0,
    limit_price: null,
    scope_limit: null,
    is_negotiated: false,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
  // 甘精胰岛素 — 国家乙类 10%，谈判药
  {
    medicine_id: '86901024000017',
    region_code: '000000',
    region_level: 'NATIONAL',
    category: 'B',
    self_pay_ratio: 0.1,
    limit_price: null,
    scope_limit: 'E10,E11',
    is_negotiated: true,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
];

// ─── 地区参数 ─────────────────────────────────────
export const SAMPLE_REGION_PARAMS: RegionParam[] = [
  // 国家级兜底
  {
    region_code: '000000',
    region_level: 'NATIONAL',
    deductible_tier1: 20000,    // 200 元
    deductible_tier2: 50000,    // 500 元
    deductible_tier3: 80000,    // 800 元
    reimburse_rate_tier1: 0.85,
    reimburse_rate_tier2: 0.75,
    reimburse_rate_tier3: 0.6,
    annual_cap: 5000000,        // 5 万
    cross_province_discount: 0.1,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'NATIONAL',
  },
  // 浙江省
  {
    region_code: '330000',
    region_level: 'PROVINCE',
    deductible_tier1: 30000,
    deductible_tier2: 60000,
    deductible_tier3: 100000,
    reimburse_rate_tier1: 0.85,
    reimburse_rate_tier2: 0.75,
    reimburse_rate_tier3: 0.6,
    annual_cap: 5000000,
    cross_province_discount: 0.1,
    effective_date: '2024-01-01',
    expire_date: null,
    source: 'PROVINCE',
  },
];

// ─── 默认条款（按你确认的口径） ────────────────────
export const DEFAULT_CLAUSE: ClauseConfig = {
  product_id: 'rider-employer',
  coverage_code: 'MEDICAL_FEE',
  exclusion_source: 'LOCAL_MEDICAL',
  exclude_b_class_self_pay: true,
  imported_drug_policy: 'LIMIT_PRICE',
  off_label_policy: 'MANUAL',
  unknown_drug_policy: 'MANUAL_REVIEW',
  deductible_ratio: 0.1,       // 条款免赔率 10%
  liability_ratio: 1.0,         // 责任比例 100%（主责）
  limits: {
    per_person: 1000000,        // 1 万
    per_incident: 3000000,      // 3 万
    per_period: 5000000,        // 5 万
  },
};

export function makeContext(overrides: Partial<PricingContext> = {}): PricingContext {
  return {
    filing_time: '2024-06-15T10:00:00Z',
    case_id: 'CASE-20240615-001',
    task_id: 'TASK-001',
    operator: 'demo',
    medicines: SAMPLE_MEDICINES,
    medicine_attrs: SAMPLE_ATTRS,
    region_params: SAMPLE_REGION_PARAMS,
    clause: DEFAULT_CLAUSE,
    quota_usage: { used_in_period: 0 },
    ...overrides,
  };
}
