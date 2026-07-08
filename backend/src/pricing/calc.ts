/**
 * 引擎编排层 — 顶层入口
 *
 * 调用顺序：
 *   1. 遍历 bills → 对每条 DrugLine 调 decideOneLine
 *   2. 累加 self_pay / limit_excess / off_label / reimbursable
 *   3. 应用条款免赔率
 *   4. 应用责任比例
 *   5. 应用三层限额嵌套
 *   6. 收集审计
 */

import type {
  AuditEntry,
  BillDecision,
  DrugLine,
  DrugLineDecision,
  MedicalBill,
  PricingContext,
  PricingResult,
} from './types';
import { decideOneLine } from './selfPay';
import { applyQuota } from './quotas';
import { matchRegionParam } from './snapshot';

export function priceTask(
  bills: MedicalBill[],
  ctx: PricingContext,
  /** 同事故其他任务累计（用于 per_incident 限额），单位分 */
  siblingIncidentUsed: number = 0
): PricingResult {
  const auditEntries: AuditEntry[] = [];
  const ts = new Date().toISOString();
  const op = ctx.operator;

  // ─── 1. 逐发票处理 ─────────────────────────
  const billDecisions: BillDecision[] = bills.map((bill) => {
    const drugDecisions = bill.drug_lines.map((line) =>
      decideOneLineWithContext(bill, line, ctx, auditEntries, ts, op)
    );

    const grossTotal = drugDecisions.reduce((s, d) => s + d.gross_amount, 0);
    const selfPayTotal = drugDecisions.reduce((s, d) => s + d.self_pay_amount, 0);
    const limitExcessTotal = drugDecisions.reduce((s, d) => s + d.limit_excess, 0);
    const offLabelTotal = drugDecisions.reduce((s, d) => s + d.off_label_excluded, 0);
    const reimbursableTotal = drugDecisions.reduce((s, d) => s + d.reimbursable_amount, 0);

    // 匹配地区参数（按就医地）
    const regionMatch = matchRegionParam(bill.region_code, ctx);

    return {
      bill_no: bill.bill_no,
      drug_decisions: drugDecisions,
      gross_total: grossTotal,
      self_pay_total: selfPayTotal,
      limit_excess_total: limitExcessTotal,
      off_label_total: offLabelTotal,
      reimbursable_total: reimbursableTotal,
      region_matched: regionMatch !== null,
      matched_region: regionMatch?.param ?? null,
      matched_region_level: regionMatch?.level ?? 'NONE',
    };
  });

  // ─── 2. 累计（不含非药品费用场景下只有医疗费） ───
  const grossTotal = billDecisions.reduce((s, b) => s + b.gross_total, 0);
  const reimbursableTotal = billDecisions.reduce((s, b) => s + b.reimbursable_total, 0);

  // ─── 3. 条款免赔率（按比例从可赔金额扣） ───
  const deductibleRatio = ctx.clause.deductible_ratio;
  const deductibleAmount = Math.round(reimbursableTotal * deductibleRatio);
  const afterDeductible = reimbursableTotal - deductibleAmount;
  auditEntries.push({
    step: 'DEDUCTIBLE',
    before: reimbursableTotal,
    after: afterDeductible,
    rule: `条款免赔率 ${(deductibleRatio * 100).toFixed(1)}%`,
    detail: `扣减 ${deductibleAmount} 分`,
    operator: op,
    ts,
  });

  // ─── 4. 责任比例（按事故责任认定） ───
  const liabilityRatio = ctx.clause.liability_ratio;
  const liabilityCut = Math.round(afterDeductible * (1 - liabilityRatio));
  const afterLiability = afterDeductible - liabilityCut;
  auditEntries.push({
    step: 'LIABILITY',
    before: afterDeductible,
    after: afterLiability,
    rule: `责任比例 ${(liabilityRatio * 100).toFixed(0)}%`,
    detail: `扣减 ${liabilityCut} 分`,
    operator: op,
    ts,
  });

  // ─── 5. 三层限额嵌套 ───
  const quotaRes = applyQuota(afterLiability, ctx.clause.limits, ctx.quota_usage, siblingIncidentUsed);
  auditEntries.push({
    step: 'QUOTA',
    before: afterLiability,
    after: quotaRes.capped,
    rule: `限额嵌套（瓶颈：${quotaRes.bottleneck}）`,
    detail: quotaRes.overflow > 0 ? `截断 ${quotaRes.overflow} 分` : '未超限',
    operator: op,
    ts,
  });

  // ─── 6. 汇总 ───
  const reviewReasons: string[] = [];
  for (const b of billDecisions) {
    for (const d of b.drug_decisions) {
      if (d.needs_manual_review) {
        reviewReasons.push(`${b.bill_no} - ${d.line_no}: ${d.generic_name} 需人工复核`);
      }
    }
  }
  if (quotaRes.overflow > 0) {
    reviewReasons.push(`限额截断：超额 ${quotaRes.overflow} 分（瓶颈 ${quotaRes.bottleneck}），需上级审批`);
  }

  return {
    case_id: ctx.case_id,
    task_id: ctx.task_id,
    filing_time: ctx.filing_time,
    operator: op,
    bills: billDecisions,
    gross_total: grossTotal,
    reimbursable_total: reimbursableTotal,
    after_deductible: afterDeductible,
    after_liability: afterLiability,
    after_quota: quotaRes.capped,
    final_payout: quotaRes.capped,
    quota_remaining: quotaRes.remaining,
    audit_entries: auditEntries,
    needs_manual_review: reviewReasons.length > 0,
    review_reasons: reviewReasons,
  };
}

/**
 * 包装 decideOneLine：把 bill 的 region_code 注入进去，
 * 解决 selfPay.ts 里的占位问题。
 */
function decideOneLineWithContext(
  bill: MedicalBill,
  line: DrugLine,
  ctx: PricingContext,
  auditEntries: AuditEntry[],
  ts: string,
  op: string
): DrugLineDecision {
  // 把 bill 的 region_code 直接传给 selfPay 层（修掉旧版的占位符）
  const before = line.qty * line.unit_price;
  const decision = decideOneLine(line, bill.region_code, ctx);
  const after = decision.reimbursable_amount;

  auditEntries.push({
    step: 'EXCLUDE',
    line_no: line.line_no,
    bill_no: bill.bill_no,
    before,
    after,
    rule: `自费药剔除（${decision.matched_level}）`,
    detail: decision.reasons.map((r: { kind: string; detail: string }) => `[${r.kind}] ${r.detail}`).join('；'),
    operator: op,
    ts,
  });

  return decision;
}
