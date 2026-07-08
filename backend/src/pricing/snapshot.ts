/**
 * 快照机制：按立案时间筛选有效属性
 *
 * 真实系统：医保目录每年调整，所有 "地区参数/药品属性" 必须带 effective_date
 * 引擎在收到 PricingContext 时已经冻结了时间锚点，这里负责：
 *   1. 过滤掉 effective_date > filing_time 的属性（未来才生效）
 *   2. 过滤掉 expire_date <= filing_time 的属性（已失效）
 *   3. 同药监码+同地区多版本时，取 effective_date 最新且 <= filing_time 的那条
 *
 * 设计为纯函数，便于单测。
 */

import type { MedicineRegionAttr, RegionParam, PricingContext, RegionCode } from './types';

const isoDate = (d: string) => new Date(d).getTime();

/** 返回 attr 是否在快照时间点有效 */
export function isAttrActive<T extends { effective_date: string; expire_date: string | null }>(
  attr: T,
  filingTime: string
): boolean {
  const ft = isoDate(filingTime);
  if (isoDate(attr.effective_date) > ft) return false;
  if (attr.expire_date && isoDate(attr.expire_date) <= ft) return false;
  return true;
}

/**
 * 三级回溯匹配：就医地 → 就医省 → 国家
 *  - 输入：药监码 + 地区码 + 快照时间
 *  - 输出：最匹配的 MedicineRegionAttr，未找到返 null
 */
export function matchMedicineAttr(
  drugCode: string,
  regionCode: RegionCode,
  ctx: PricingContext
): { attr: MedicineRegionAttr; level: 'CITY' | 'PROVINCE' | 'NATIONAL' } | null {
  const candidates = ctx.medicine_attrs
    .filter((a) => a.medicine_id === drugCode)
    .filter((a) => isAttrActive(a, ctx.filing_time));

  if (!candidates.length) return null;

  // 构造回溯顺序：根据 regionCode 自身粒度
  //   '000000' → 直接走 NATIONAL（slice 会把它当省，无意义）
  //   '330000' → 省级，无 city/district 可回溯
  //   '330100' → city → 省 → 国家
  const order: Array<{ code: RegionCode; level: 'CITY' | 'PROVINCE' | 'NATIONAL' }> = [];

  if (regionCode === '000000') {
    order.push({ code: '000000', level: 'NATIONAL' });
  } else {
    // 判断是 city 还是 province：区号后 4 位为 0 即省级
    const isProvince = regionCode.endsWith('0000');
    if (isProvince) {
      order.push({ code: regionCode, level: 'PROVINCE' });
    } else {
      order.push({ code: regionCode, level: 'CITY' });
    }
    // 省级回溯
    order.push({ code: regionCode.slice(0, 2) + '0000', level: 'PROVINCE' });
    // 国家兜底
    order.push({ code: '000000', level: 'NATIONAL' });
  }

  for (const { code, level } of order) {
    const found = candidates.find((a) => a.region_code === code);
    if (found) return { attr: found, level };
  }
  return null;
}

/** 同上，但只匹配通用名（无药监码时使用） */
export function matchMedicineAttrByName(
  genericName: string,
  dosageForm: string | undefined,
  regionCode: RegionCode,
  ctx: PricingContext
): { attr: MedicineRegionAttr; level: 'CITY' | 'PROVINCE' | 'NATIONAL' } | null {
  // 通过 medicines 表反查 drug_code
  const med = ctx.medicines.find(
    (m) => m.generic_name === genericName && (!dosageForm || m.dosage_form === dosageForm)
  );
  if (!med) return null;
  return matchMedicineAttr(med.drug_code, regionCode, ctx);
}

/** 地区参数三级回溯（与药品属性同构） */
export function matchRegionParam(
  regionCode: RegionCode,
  ctx: PricingContext
): { param: RegionParam; level: 'CITY' | 'PROVINCE' | 'NATIONAL' } | null {
  const candidates = ctx.region_params.filter((p) => isAttrActive(p, ctx.filing_time));

  const order: Array<{ code: RegionCode; level: 'CITY' | 'PROVINCE' | 'NATIONAL' }> = [];

  if (regionCode === '000000') {
    order.push({ code: '000000', level: 'NATIONAL' });
  } else {
    const isProvince = regionCode.endsWith('0000');
    if (isProvince) {
      order.push({ code: regionCode, level: 'PROVINCE' });
    } else {
      order.push({ code: regionCode, level: 'CITY' });
    }
    order.push({ code: regionCode.slice(0, 2) + '0000', level: 'PROVINCE' });
    order.push({ code: '000000', level: 'NATIONAL' });
  }

  for (const { code, level } of order) {
    const found = candidates.find((p) => p.region_code === code);
    if (found) return { param: found, level };
  }
  return null;
}
