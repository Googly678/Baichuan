/**
 * 自费药剔除核心 — 单条 DrugLine 决策
 *
 * 这是专家最常拷问的部分。规则按你确认的口径：
 *  - 找不到药品属性 → 强制人工复核，金额归零
 *  - 限价 → 全额按限价（实际单价>限价时，超出部分自费）
 *  - 甲类 → 全额纳入
 *  - 乙类 → 按自付比例自付；exclude_b_class_self_pay=true 时自付部分也剔除
 *  - 丙类 → 全额自费
 *  - 目录外 → 全额自费
 *  - 进口药 / 适应症不符 / 谈判药 / 结算单覆盖 → 按 clause 策略
 */

import type {
  DrugLine,
  DrugLineDecision,
  ExcludeReason,
  MedicineRegionAttr,
  PricingContext,
  RegionCode,
} from './types';
import { matchMedicineAttr, matchMedicineAttrByName } from './snapshot';

/**
 * 决策单条 DrugLine
 * @param regionCode  该账单的就医地区（由编排层传入，不用 ctx 反查）
 */
export function decideOneLine(
  line: DrugLine,
  regionCode: RegionCode,
  ctx: PricingContext
): DrugLineDecision {
  const reasons: ExcludeReason[] = [];
  const gross = line.qty * line.unit_price;

  // ─── 1. 匹配：药监码 → 通用名+剂型 ──────────────
  let match: { attr: MedicineRegionAttr; level: 'CITY' | 'PROVINCE' | 'NATIONAL' } | null = null;
  if (line.drug_code) {
    match = matchMedicineAttr(line.drug_code, regionCode, ctx);
  } else {
    match = matchMedicineAttrByName(line.generic_name, line.dosage_form, regionCode, ctx);
  }

  // ─── 2. 找不到 → 按条款策略处理 ─────────────────
  if (!match) {
    if (ctx.clause.unknown_drug_policy === 'INCLUDE_DEFAULT') {
      // 默认纳入：把行视为"目录外全额自费"再纳入
      reasons.push({
        kind: 'NOT_MATCHED',
        detail: `药品未匹配（${line.generic_name}），按条款默认全额纳入`,
      });
      return {
        line_no: line.line_no,
        generic_name: line.generic_name,
        gross_amount: gross,
        matched: false,
        matched_attr: null,
        matched_level: 'NONE',
        self_pay_amount: 0,
        limit_excess: 0,
        off_label_excluded: 0,
        reimbursable_amount: gross,
        reasons,
        needs_manual_review: false,
      };
    }
    // 默认：强制人工复核，金额归零
    reasons.push({
      kind: 'NOT_MATCHED',
      detail: `药品未匹配（${line.generic_name}），需人工复核`,
    });
    return {
      line_no: line.line_no,
      generic_name: line.generic_name,
      gross_amount: gross,
      matched: false,
      matched_attr: null,
      matched_level: 'NONE',
      self_pay_amount: gross,
      limit_excess: 0,
      off_label_excluded: 0,
      reimbursable_amount: 0,
      reasons,
      needs_manual_review: true,
    };
  }

  const attr = match.attr;
  const matchedLevel = match.level;

  // ─── 3. 进口药处理 ─────────────────────────────
  if (line.is_imported && ctx.clause.imported_drug_policy === 'EXCLUDE') {
    reasons.push({ kind: 'IMPORTED_EXCLUDED', detail: '条款规定进口药不予赔付' });
    return {
      line_no: line.line_no,
      generic_name: line.generic_name,
      gross_amount: gross,
      matched: true,
      matched_attr: attr,
      matched_level: matchedLevel,
      self_pay_amount: gross,
      limit_excess: 0,
      off_label_excluded: 0,
      reimbursable_amount: 0,
      reasons,
      needs_manual_review: false,
    };
  }

  // ─── 4. 限价截断（先算） ───────────────────────
  let limitExcess = 0;
  let unitPriceEffective = line.unit_price;
  if (attr.limit_price !== null && line.unit_price > attr.limit_price) {
    limitExcess = (line.unit_price - attr.limit_price) * line.qty;
    unitPriceEffective = attr.limit_price;
    reasons.push({
      kind: 'LIMIT_PRICE_EXCESS',
      detail: `医保限价 ${(attr.limit_price / 100).toFixed(2)} 元，发票单价 ${(line.unit_price / 100).toFixed(2)} 元`,
      limit: attr.limit_price,
      actual: line.unit_price,
    });
  }

  // ─── 5. 适应症检查 ─────────────────────────────
  let offLabelExcluded = 0;
  if (attr.scope_limit && line.diagnosis_icd10) {
    if (!icdMatchesScope(line.diagnosis_icd10, attr.scope_limit)) {
      if (ctx.clause.off_label_policy === 'EXCLUDE') {
        offLabelExcluded = gross;
        reasons.push({
          kind: 'OFF_LABEL',
          detail: `诊断 ${line.diagnosis_icd10} 不在药品限适应症范围 [${attr.scope_limit}]`,
          icd10: line.diagnosis_icd10,
        });
      } else if (ctx.clause.off_label_policy === 'MANUAL') {
        reasons.push({
          kind: 'OFF_LABEL',
          detail: `适应症待人工复核 [${attr.scope_limit}]`,
          icd10: line.diagnosis_icd10,
        });
      }
    }
  }

  // ─── 6. 分类剔除 ───────────────────────────────
  const effectiveGross = unitPriceEffective * line.qty;
  let selfPay = 0;
  if (attr.category === 'OUT') {
    selfPay = effectiveGross;
    reasons.push({ kind: 'OUT_OF_CATALOG', detail: '药品在医保目录外' });
  } else if (attr.category === 'C') {
    selfPay = effectiveGross;
    reasons.push({ kind: 'C_CLASS_FULL_SELF_PAY', detail: '丙类药全额自费' });
  } else if (attr.category === 'B') {
    const ratio = attr.self_pay_ratio;
    const selfPayByB = Math.round(effectiveGross * ratio);
    if (ctx.clause.exclude_b_class_self_pay) {
      selfPay = selfPayByB;
      reasons.push({
        kind: 'B_CLASS_SELF_PAY',
        detail: `乙类自付 ${(ratio * 100).toFixed(0)}%`,
        ratio,
      });
    } else {
      reasons.push({
        kind: 'B_CLASS_SELF_PAY',
        detail: `乙类自付 ${(ratio * 100).toFixed(0)}%（条款纳入可赔）`,
        ratio,
      });
      // 不剔除，selfPay 保持 0
    }
  } else if (attr.category === 'A') {
    // 全额纳入
  }

  // ─── 7. 结算单覆盖：若医院已认定自费，以高者为准 ─
  if (line.hospital_self_pay !== undefined && line.hospital_self_pay > selfPay) {
    selfPay = line.hospital_self_pay;
    reasons.push({
      kind: 'SETTLEMENT_OVERRIDE',
      detail: `医院结算单认定自费 ${(line.hospital_self_pay / 100).toFixed(2)} 元，高于引擎测算`,
    });
  }

  const reimbursable = Math.max(0, gross - selfPay - limitExcess - offLabelExcluded);
  const needsReview =
    (!match && ctx.clause.unknown_drug_policy !== 'INCLUDE_DEFAULT') ||
    reasons.some(
      (r) =>
        r.kind === 'NOT_MATCHED' ||
        (r.kind === 'OFF_LABEL' && ctx.clause.off_label_policy === 'MANUAL')
    );

  return {
    line_no: line.line_no,
    generic_name: line.generic_name,
    gross_amount: gross,
    matched: true,
    matched_attr: attr,
    matched_level: matchedLevel,
    self_pay_amount: selfPay,
    limit_excess: limitExcess,
    off_label_excluded: offLabelExcluded,
    reimbursable_amount: reimbursable,
    reasons,
    needs_manual_review: needsReview,
  };
}

// ─── 工具 ────────────────────────────────────────────
/** ICD 前缀匹配：scope "S72" 匹配 "S72.000" / "S72.100" */
function icdMatchesScope(icd10: string, scope: string): boolean {
  const codes = scope.split(',').map((s) => s.trim());
  return codes.some((c) => icd10.toUpperCase().startsWith(c.toUpperCase()));
}
