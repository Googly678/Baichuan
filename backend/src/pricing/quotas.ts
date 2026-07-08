/**
 * 三层限额嵌套（per_person / per_incident / per_period）
 *
 * 场景：单人 10 万、单次事故 30 万、年度累计 50 万
 *  - 本任务自付前金额 = X
 *  - 剩余 per_person = per_person - 0
 *  - 剩余 per_incident = per_incident - 同事故他人已用
 *  - 剩余 per_period = per_period - used_in_period
 *  - 可用上限 = min(per_person, per_incident, per_period)
 *  - 超出部分 → 截断，触发"超额提示"
 *
 * 注意：本引擎是"任务级"调用，多人共用限额时由调用方累计其他人后传入
 */

import type { QuotaLimits, QuotaUsage } from './types';

export interface QuotaResult {
  /** 限额内可赔 */
  capped: number;
  /** 被限额截断的金额 */
  overflow: number;
  /** 截断原因（哪个限额先到顶） */
  bottleneck: 'PER_PERSON' | 'PER_INCIDENT' | 'PER_PERIOD' | 'NONE';
  /** 剩余限额快照 */
  remaining: QuotaLimits;
}

export function applyQuota(
  amount: number,
  limits: QuotaLimits,
  usage: QuotaUsage,
  /** 同事故其他任务的累计（不含本任务） */
  siblingIncidentUsed: number
): QuotaResult {
  // 各项"剩余"
  const personLeft = limits.per_person === null
    ? Infinity
    : Math.max(0, limits.per_person - 0);
  const incidentLeft = limits.per_incident === null
    ? Infinity
    : Math.max(0, limits.per_incident - siblingIncidentUsed);
  const periodLeft = limits.per_period === null
    ? Infinity
    : Math.max(0, limits.per_period - usage.used_in_period);

  const cap = Math.min(personLeft, incidentLeft, periodLeft);
  const capped = Math.min(amount, cap);
  const overflow = amount - capped;

  // 找到瓶颈
  let bottleneck: QuotaResult['bottleneck'] = 'NONE';
  if (overflow > 0) {
    if (cap === personLeft) bottleneck = 'PER_PERSON';
    else if (cap === incidentLeft) bottleneck = 'PER_INCIDENT';
    else if (cap === periodLeft) bottleneck = 'PER_PERIOD';
  }

  // 剩余（用于返回给调用方累积）
  const remaining: QuotaLimits = {
    per_person: limits.per_person === null ? null : Math.max(0, limits.per_person - capped),
    per_incident: limits.per_incident === null ? null : Math.max(0, limits.per_incident - siblingIncidentUsed - capped),
    per_period: limits.per_period === null ? null : Math.max(0, limits.per_period - usage.used_in_period - capped),
  };

  return { capped, overflow, bottleneck, remaining };
}
