import fs from 'fs/promises';
import path from 'path';
import { kvGet, kvSet } from './kvStorage';

export interface RepairOrderItem {
  id: string;
  part_id: string;
  oem_code: string;
  name: string;
  original_name: string;
  category: string;
  price_msrp: number;
  price_market: number;
  quantity: number;
  subtotal_msrp: number;     // price_msrp * quantity
  subtotal_market: number;   // price_market * quantity
}

export interface RepairOrder {
  id: string;
  case_id: string;            // 案件主单 id
  task_id?: string;           // 任务 id（物损任务）
  vehicle_model_id: string;   // 关联车型
  vin: string;
  brand: string;
  series: string;
  trim: string;
  total_msrp: number;
  total_market: number;
  items: RepairOrderItem[];
  created_at: string;
  updated_at: string;
}

const REPAIR_NAMESPACE = 'repair_orders';
let kvEnabled = true;
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

// 内存索引：case_id -> order
const orderIndex: Map<string, RepairOrder> = new Map();
let loaded = false;

async function loadIndexFromKv() {
  if (loaded) return;
  try {
    const all = await kvGet<RepairOrder[]>(REPAIR_NAMESPACE, 'all');
    if (Array.isArray(all)) {
      for (const order of all) {
        orderIndex.set(order.case_id, order);
      }
    }
  } catch {
    if (!allowJsonFallback) {
      // 静默降级
    }
    kvEnabled = false;
  } finally {
    loaded = true;
  }
}

async function persistIndex() {
  if (!kvEnabled) return;
  try {
    const all = Array.from(orderIndex.values());
    await kvSet(REPAIR_NAMESPACE, 'all', all);
  } catch (error) {
    console.warn('[RepairOrder] 持久化失败:', (error as Error).message);
  }
}

export async function getRepairOrderByCaseId(caseId: string) {
  await loadIndexFromKv();
  return orderIndex.get(caseId) || null;
}

export async function upsertRepairOrder(order: RepairOrder) {
  await loadIndexFromKv();
  orderIndex.set(order.case_id, order);
  await persistIndex();
  return order;
}

export async function deleteRepairOrder(caseId: string) {
  await loadIndexFromKv();
  orderIndex.delete(caseId);
  await persistIndex();
  return { success: true };
}
