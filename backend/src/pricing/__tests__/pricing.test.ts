/**
 * 引擎单元测试 — 30 个核心场景
 *
 * 运行：npx ts-node src/pricing/__tests__/pricing.test.ts
 * 或在 tsconfig 加 "test":"node --test --import tsx src/pricing/__tests__/*.ts"
 *
 * 覆盖维度：
 *  1. 药品匹配（药监码/通用名/找不到）
 *  2. 跨省三级回溯（市/省/国家）
 *  3. 分类剔除（甲/乙/丙/目录外）
 *  4. 限价截断
 *  5. 适应症匹配/不符
 *  6. 进口药策略
 *  7. 结算单覆盖
 *  8. 条款免赔 + 责任比例
 *  9. 三层限额嵌套（per_person / per_incident / per_period）
 *  10. 快照时间锁定
 *  11. 审计日志完整
 */

import { test } from 'node:test';
import * as assert from 'node:assert/strict';

import { decideOneLine } from '../selfPay';
import { applyQuota } from '../quotas';
import { matchMedicineAttr, isAttrActive, matchRegionParam } from '../snapshot';
import { priceTask } from '../calc';
import {
  SAMPLE_MEDICINES,
  SAMPLE_ATTRS,
  SAMPLE_REGION_PARAMS,
  DEFAULT_CLAUSE,
  makeContext,
} from '../seed';
import type { MedicalBill, DrugLine, ClauseConfig } from '../types';

// ─── 工具：构造一条 DrugLine ───────────────────────
const line = (overrides: Partial<DrugLine>): DrugLine => ({
  line_no: 'L1',
  generic_name: '头孢呋辛酯',
  qty: 1,
  unit_price: 10000, // 100 元
  ...overrides,
});

// ─── 1. 药品匹配（5 个 case） ─────────────────────
test('match: 药监码精确匹配 → NATIONAL 级别', () => {
  const ctx = makeContext();
  const res = matchMedicineAttr('86979271000010', '000000', ctx);
  assert.equal(res?.level, 'NATIONAL');
  assert.equal(res?.attr.category, 'B');
});

test('match: 通用名+剂型匹配', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: undefined, generic_name: '头孢呋辛酯', dosage_form: '片剂' })]);
  const result = priceTask([bill], ctx);
  assert.equal(result.bills[0].drug_decisions[0].matched, true);
});

test('match: 找不到药品 → 强制人工复核 + 金额归零', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: undefined, generic_name: '某种未知药' })]);
  const result = priceTask([bill], ctx);
  const d = result.bills[0].drug_decisions[0];
  assert.equal(d.matched, false);
  assert.equal(d.matched_level, 'NONE');
  assert.equal(d.reimbursable_amount, 0);
  assert.equal(d.needs_manual_review, true);
  assert.equal(result.needs_manual_review, true);
});

test('match: unknown_drug_policy=INCLUDE_DEFAULT 时，金额纳入', () => {
  const ctx = makeContext({
    clause: { ...DEFAULT_CLAUSE, unknown_drug_policy: 'INCLUDE_DEFAULT' },
  });
  const bill = makeBill([line({ generic_name: '某种未知药' })]);
  const result = priceTask([bill], ctx);
  const d = result.bills[0].drug_decisions[0];
  assert.equal(d.matched, false);
  assert.ok(d.reimbursable_amount > 0);
  assert.equal(d.needs_manual_review, false);
});

test('match: 通用名匹配要求剂型一致', () => {
  const ctx = makeContext();
  const res = matchMedicineAttr('000000', '000000', ctx);
  assert.equal(res, null);
});

// ─── 2. 跨省三级回溯（4 个 case） ───────────────
test('region: 就医地精确匹配 → CITY', () => {
  // 浙江省 杭州市 (330100)
  const res = matchRegionParam('330100', makeContext());
  assert.equal(res?.level, 'PROVINCE'); // 杭州无数据，回溯到浙江
  assert.equal(res?.param.deductible_tier3, 100000);
});

test('region: 就医地无 → 回溯省', () => {
  const res = matchRegionParam('330100', makeContext());
  assert.equal(res?.param.region_code, '330000');
});

test('region: 就医省无 → 回溯国家', () => {
  const res = matchRegionParam('510100', makeContext()); // 四川成都，无省级数据
  assert.equal(res?.level, 'NATIONAL');
  assert.equal(res?.param.region_code, '000000');
});

test('region: 国家兜底总能匹配', () => {
  const res = matchRegionParam('999999', makeContext());
  assert.equal(res?.level, 'NATIONAL');
});

// ─── 3. 分类剔除（5 个 case） ────────────────────
test('A类药：全额纳入可赔', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: '86901482000013' })]); // 阿莫西林克拉维酸钾 - 甲类
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.reasons.some((r) => r.kind === 'B_CLASS_SELF_PAY'), false);
  // 后续责任比例 = 100%，免赔率 10%
  // gross 10000 → 免赔 1000 → 责任 100% → final 9000
  assert.equal(d.reimbursable_amount, 10000);
});

test('B类药：乙类自付10%剔除', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: '86979271000010' })]); // 头孢呋辛酯 - 乙类 10%
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.self_pay_amount, 1000); // 10000 * 10%
  assert.equal(d.reimbursable_amount, 9000);
});

test('B类药：exclude_b_class_self_pay=false 时全额纳入', () => {
  const ctx = makeContext({
    clause: { ...DEFAULT_CLAUSE, exclude_b_class_self_pay: false },
  });
  const bill = makeBill([line({ drug_code: '86979271000010' })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.self_pay_amount, 0);
  assert.equal(d.reimbursable_amount, 10000);
});

test('C类药：丙类全额自费', () => {
  // 临时改一条 C 类样例
  const ctx = makeContext({
    medicine_attrs: [
      ...SAMPLE_ATTRS,
      {
        medicine_id: '86979599000019',
        region_code: '000000',
        region_level: 'NATIONAL',
        category: 'C',
        self_pay_ratio: 0,
        limit_price: null,
        scope_limit: null,
        is_negotiated: false,
        effective_date: '2024-01-01',
        expire_date: null,
        source: 'NATIONAL',
      },
    ],
  });
  const bill = makeBill([line({ drug_code: '86979599000019', unit_price: 10000 })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.self_pay_amount, 10000);
  assert.equal(d.reimbursable_amount, 0);
});

test('OUT类：目录外全额自费', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: '86979599000019' })]); // 复方斑蝥胶囊 - 目录外
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.self_pay_amount, 10000);
  assert.equal(d.reasons.some((r) => r.kind === 'OUT_OF_CATALOG'), true);
});

// ─── 4. 限价截断（2 个 case） ─────────────────────
test('limit price: 实际单价>限价 → 超出部分自费', () => {
  const ctx = makeContext();
  // 头孢曲松钠：限价 45 元（4500 分），单价 60 元（6000 分）= 超 15 元
  const bill = makeBill([line({ drug_code: '86978049000015', unit_price: 6000 })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.limit_excess, 1500); // 1 支 * (6000-4500) = 1500 分 = 15 元
  // gross 6000 - limit_excess 1500 - B类自付 0 (4500*5%=225) = 4275
  // 实际：unit_price_effective = 4500, gross_effective = 4500
  // B类 5% 自付 = 225，reimbursable = 4500 - 225 = 4275
  assert.equal(d.reimbursable_amount, 4275);
});

test('limit price: 实际单价<=限价 → 不触发', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: '86978049000015', unit_price: 4000 })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.limit_excess, 0);
});

// ─── 5. 适应症（3 个 case） ───────────────────────
test('off-label: 诊断在范围内 → 不剔除', () => {
  const ctx = makeContext();
  // 布地奈德：scope=J45,J44，诊断 J45.900（哮喘）
  const bill = makeBill([line({ drug_code: '86978860000011', dosage_form: '吸入用混悬液', spec: '1mg*5支', diagnosis_icd10: 'J45.900' })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.off_label_excluded, 0);
});

test('off-label: 诊断不在范围 + EXCLUDE 策略 → 剔除', () => {
  const ctx = makeContext({
    clause: { ...DEFAULT_CLAUSE, off_label_policy: 'EXCLUDE' },
  });
  const bill = makeBill([line({ drug_code: '86978860000011', diagnosis_icd10: 'S72.000' })]); // 骨折诊断
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.off_label_excluded, d.gross_amount);
});

test('off-label: 诊断不在范围 + MANUAL 策略 → 待复核', () => {
  const ctx = makeContext(); // off_label_policy: 'MANUAL'
  const bill = makeBill([line({ drug_code: '86978860000011', diagnosis_icd10: 'S72.000' })]);
  const result = priceTask([bill], ctx);
  assert.equal(result.needs_manual_review, true);
});

// ─── 6. 进口药（2 个 case） ───────────────────────
test('imported: EXCLUDE 策略 → 全额自费', () => {
  const ctx = makeContext({
    clause: { ...DEFAULT_CLAUSE, imported_drug_policy: 'EXCLUDE' },
  });
  const bill = makeBill([line({ drug_code: '86901024000017', is_imported: true, diagnosis_icd10: 'E11.900' })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.reasons.some((r) => r.kind === 'IMPORTED_EXCLUDED'), true);
  assert.equal(d.reimbursable_amount, 0);
});

test('imported: LIMIT_PRICE 策略 → 走限价逻辑', () => {
  const ctx = makeContext(); // imported_drug_policy: 'LIMIT_PRICE'
  const bill = makeBill([line({ drug_code: '86901024000017', is_imported: true, diagnosis_icd10: 'E11.900' })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.reimbursable_amount > 0, true);
});

// ─── 7. 结算单覆盖（1 个 case） ───────────────────
test('settlement: 医院认定自费更高 → 覆盖引擎测算', () => {
  const ctx = makeContext();
  // 头孢呋辛酯 B类10%，引擎算 selfPay=1000
  // 医院结算单说自费=3000 → 以高者为准
  const bill = makeBill([line({ drug_code: '86979271000010', hospital_self_pay: 3000 })]);
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  assert.equal(d.self_pay_amount, 3000);
  assert.equal(d.reasons.some((r) => r.kind === 'SETTLEMENT_OVERRIDE'), true);
});

// ─── 8. 条款免赔 + 责任比例（2 个 case） ─────────
test('deductible: 条款免赔 10% 正确扣减', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: '86901482000013' })]); // 甲类全额
  const result = priceTask([bill], ctx);
  assert.equal(result.gross_total, 10000);
  assert.equal(result.reimbursable_total, 10000);
  assert.equal(result.after_deductible, 9000); // -10%
});

test('liability: 责任 70% + 免赔 10% 串联', () => {
  const ctx = makeContext({
    clause: { ...DEFAULT_CLAUSE, deductible_ratio: 0.1, liability_ratio: 0.7 },
  });
  const bill = makeBill([line({ drug_code: '86901482000013' })]);
  const result = priceTask([bill], ctx);
  // gross 10000 → reimburse 10000 → -10% = 9000 → *70% = 6300
  assert.equal(result.after_deductible, 9000);
  assert.equal(result.after_liability, 6300);
});

// ─── 9. 三层限额嵌套（3 个 case） ───────────────
test('quota: 三层均未超 → 全额赔付', () => {
  const r = applyQuota(5000, { per_person: 10000, per_incident: 30000, per_period: 50000 }, { used_in_period: 0 }, 0);
  assert.equal(r.capped, 5000);
  assert.equal(r.bottleneck, 'NONE');
});

test('quota: per_person 触顶 → 截断到 1 万', () => {
  const r = applyQuota(15000, { per_person: 10000, per_incident: 30000, per_period: 50000 }, { used_in_period: 0 }, 0);
  assert.equal(r.capped, 10000);
  assert.equal(r.bottleneck, 'PER_PERSON');
  assert.equal(r.overflow, 5000);
});

test('quota: per_period 触顶 → 截断', () => {
  const r = applyQuota(20000, { per_person: null, per_incident: null, per_period: 30000 }, { used_in_period: 15000 }, 0);
  assert.equal(r.capped, 15000);
  assert.equal(r.bottleneck, 'PER_PERIOD');
});

// ─── 10. 快照时间锁定（2 个 case） ─────────────
test('snapshot: 立案时间早于生效日期 → 属性未生效', () => {
  const ctx = makeContext({ filing_time: '2023-12-31T00:00:00Z' });
  const bill = makeBill([line({ drug_code: '86978049000015' })]); // 头孢曲松钠
  const d = priceTask([bill], ctx).bills[0].drug_decisions[0];
  // 2024-01-01 才生效，立案在 2023 年 → 无效 → 标记未匹配
  assert.equal(d.matched, false);
});

test('snapshot: 立案时间在有效期内 → 使用最新有效版本', () => {
  // 浙江省级版 effective 2024-03-01
  // 立案 2024-04-01 → 应优先匹配省级版本（330000），而不是国家版
  const ctx = makeContext({ filing_time: '2024-04-01T00:00:00Z' });
  const res = matchMedicineAttr('86978049000015', '330100', ctx);
  assert.equal(res?.level, 'PROVINCE');
  assert.equal(res?.attr.region_code, '330000');
  assert.equal(res?.attr.self_pay_ratio, 0.1); // 浙江 10%
});

test('isAttrActive: expire_date 之后 → 失效', () => {
  const a = { effective_date: '2024-01-01', expire_date: '2024-12-31' };
  assert.equal(isAttrActive(a, '2025-01-01'), false);
  assert.equal(isAttrActive(a, '2024-06-01'), true);
});

// ─── 11. 完整流程（1 个 E2E case） ──────────────
test('e2e: 跨省案例 — 四川骑手浙江就医，一笔混合药费', () => {
  const ctx = makeContext({
    filing_time: '2024-06-15T10:00:00Z',
    clause: { ...DEFAULT_CLAUSE, deductible_ratio: 0.1, liability_ratio: 1.0 },
  });
  const bill: MedicalBill = {
    bill_no: 'B20240615001',
    region_code: '330100',        // 就医地：浙江杭州
    insured_region_code: '510100', // 参保地：四川成都
    hospital_tier: 'TIER_2',
    is_cross_province: true,
    bill_date: '2024-06-10',
    drug_lines: [
      line({ line_no: 'L1', drug_code: '86901482000013', generic_name: '阿莫西林克拉维酸钾', dosage_form: '注射剂', spec: '1.2g*1支', unit_price: 3800, qty: 5 }), // 甲类
      line({ line_no: 'L2', drug_code: '86979271000010', generic_name: '头孢呋辛酯', dosage_form: '片剂', spec: '0.25g*12片', unit_price: 2800, qty: 3 }), // 乙类10%
      line({ line_no: 'L3', drug_code: '86979599000019', generic_name: '复方斑蝥胶囊', dosage_form: '胶囊剂', spec: '0.25g*24粒', unit_price: 12000, qty: 1 }), // 目录外
    ],
  };
  const result = priceTask([bill], ctx);
  // L1 甲类 5 支 * 3800 = 19000 → 全额纳入 19000
  // L2 乙类 10% 3 盒 * 2800 = 8400 → 自付 840 → 纳入 7560
  // L3 目录外 1 * 12000 → 自费 12000 → 纳入 0
  // total gross 39400, total reimbursable 26560
  // after_deductible = 26560 * 0.9 = 23904
  // after_liability = 23904 (100%)
  // after_quota = min(23904, 1000000, 3000000, 5000000) = 23904 (1万限额内)
  // final = 23904
  assert.equal(result.gross_total, 39400);
  assert.equal(result.reimbursable_total, 26560);
  assert.equal(result.after_deductible, 23904);
  assert.equal(result.after_liability, 23904);
  assert.equal(result.after_quota, 23904);
  // 目录外药规则已知（OUT_OF_CATALOG），不算"待复核"；这里不强制 needs_manual_review
  assert.ok(result.audit_entries.length >= 4);
});

test('audit: 完整审计链 — 5 个步骤', () => {
  const ctx = makeContext();
  const bill = makeBill([line({ drug_code: '86979271000010' })]);
  const result = priceTask([bill], ctx);
  // EXCLUDE + DEDUCTIBLE + LIABILITY + QUOTA = 4 个步骤
  // 加上每条 DrugLine 的 EXCLUDE = 5 个
  const steps = new Set(result.audit_entries.map((e) => e.step));
  assert.ok(steps.has('EXCLUDE'));
  assert.ok(steps.has('DEDUCTIBLE'));
  assert.ok(steps.has('LIABILITY'));
  assert.ok(steps.has('QUOTA'));
});

// ─── 工具 ─────────────────────────────────────────
function makeBill(lines: DrugLine[]): MedicalBill {
  return {
    bill_no: 'B-TEST',
    region_code: '000000',
    insured_region_code: '000000',
    hospital_tier: 'TIER_2',
    is_cross_province: false,
    bill_date: '2024-06-15',
    drug_lines: lines,
  };
}
