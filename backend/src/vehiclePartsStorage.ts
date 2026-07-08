import fs from 'fs/promises';
import path from 'path';
import { kvGet, kvSet } from './kvStorage';

export interface PartRecord {
  id: string;
  oem_code: string;            // 零件号
  name: string;                // 零件名称
  original_name: string;       // 原厂零件名称
  category: string;            // 配件一级分类 key
  subcategory: string;         // 配件子分类（车系内部小类，例如：前保险杠-牌照板）
  price_msrp: number;          // 厂商指导价（元）
  price_market: number;        // 4S 渠道市场价（元）
  vehicle_model_id: string;    // 关联车型 id
  image?: string;              // 占位图（演示用）
}

export interface PartCategory {
  key: string;
  name: string;
}

export interface VehicleModel {
  id: string;
  brand: string;                // 品牌：东风日产
  series: string;               // 车系：轩逸
  year: number;                 // 年款
  displacement: string;         // 排量
  transmission: string;         // 变速箱
  trim: string;                 // 销售车型名称
  drive_form: string;           // 驱动形式
  vin: string;                  // 演示用 VIN
  category_l1: string;          // 一级分类
  category_l2: string;          // 二级分类
  category_l3: string;          // 三级分类
  category_l4: string;          // 四级分类
  manufacturer: string;         // 厂商类型
  origin: string;               // 国别
  msrp_total: number;           // 厂商指导价（车型级，用于卡片展示）
  categories: PartCategory[];   // 该车型支持的配件分类
}

interface PartsDatabase {
  models: VehicleModel[];
  parts: PartRecord[];
}

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.resolve(dataDir, 'parts-db.json');
const PARTS_NAMESPACE = 'vehicle_parts';
const PARTS_KEY = 'primary';
let kvEnabled = true;
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

const seedDatabase: PartsDatabase = {
  models: [
    {
      id: 'vm-lgbh12e20hy420076',
      vin: 'LGBH12E20HY420076',
      brand: '东风日产',
      series: '轩逸',
      year: 2017,
      trim: '2016款 经典 1.6L 手动 XE+ 领先版',
      displacement: '1.6L',
      transmission: '手动挡',
      drive_form: '前置前驱',
      category_l1: '轿车',
      category_l2: '紧凑型轿车(A)',
      category_l3: '紧凑型轿车',
      category_l4: '三厢轿车',
      manufacturer: '合资',
      origin: '日本',
      msrp_total: 102300,
      categories: [
        { key: 'left_side_panel', name: '左车身侧面结构件-外饰' },
        { key: 'left_side_panel_metal', name: '左车身侧面结构件-钣金' },
        { key: 'roof_window', name: '车顶-天窗系统' },
        { key: 'rear_door', name: '后门及其构件' },
        { key: 'rear_door_trim', name: '左后门内饰' },
        { key: 'rear_door_outer_trim', name: '左后门外饰' },
        { key: 'rear_door_metal', name: '左后门金属构件' },
        { key: 'front_bumper', name: '前保险杠系统' },
        { key: 'engine_compartment', name: '发动机舱' },
        { key: 'front_axle', name: '前桥系统' },
        { key: 'rear_axle', name: '后桥系统' },
        { key: 'wheel', name: '车轮' },
        { key: 'brake', name: '制动系统' },
        { key: 'electrical', name: '电气系统' },
      ],
    },
  ],
  parts: [
    {
      id: 'p-62290ew000-999', oem_code: '62290EW000-999', name: '前保险杠中间加强件',
      original_name: '前保险杠支撑架,上', category: 'front_bumper', subcategory: '前保险杠中间加强件',
      price_msrp: 180, price_market: 120, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
    {
      id: 'p-96212ex70a-a229', oem_code: '96212EX70A-A229', name: '前保险杠牌照板',
      original_name: '支架-牌照', category: 'front_bumper', subcategory: '前保险杠牌照板',
      price_msrp: 95, price_market: 65, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
    {
      id: 'p-622a0ex70a-b151', oem_code: '622A0EX70A-B151', name: '前保险杠托架总成',
      original_name: '前保险杠孔盖板', category: 'front_bumper', subcategory: '前保险杠托架总成',
      price_msrp: 420, price_market: 280, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
    {
      id: 'p-75115ew830-b124', oem_code: '75115EW830-B124', name: '前保险杠骨架支架（左）',
      original_name: '前侧梁,中左', category: 'front_bumper', subcategory: '前保险杠骨架支架（左）',
      price_msrp: 360, price_market: 245, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
    {
      id: 'p-75114ew830-b124', oem_code: '75114EW830-B124', name: '前保险杠骨架支架（右）',
      original_name: '前侧梁,右', category: 'front_bumper', subcategory: '前保险杠骨架支架（右）',
      price_msrp: 360, price_market: 245, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
    {
      id: 'p-k851e-ew51a-a176', oem_code: 'K851E-EW51A-A176', name: '副驾驶员安全气囊',
      original_name: '付气囊模块总成', category: 'electrical', subcategory: '安全气囊',
      price_msrp: 3481, price_market: 1300, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
    {
      id: 'p-b8556ew33e-999', oem_code: 'B8556EW33E-999', name: '气囊电脑',
      original_name: '气囊传感器诊断器总成', category: 'electrical', subcategory: '气囊电脑',
      price_msrp: 4375, price_market: 1600, vehicle_model_id: 'vm-lgbh12e20hy420076',
    },
  ],
};

async function ensureDbFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(seedDatabase, null, 2), 'utf-8');
  }
}

async function readDb(): Promise<PartsDatabase> {
  await ensureKvDb();
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    return readDbFromFile();
  }
  const existing = await kvGet<PartsDatabase>(PARTS_NAMESPACE, PARTS_KEY).catch(() => {
    kvEnabled = false;
    return null;
  });
  if (!existing) {
    if (!allowJsonFallback) {
      throw new Error('未找到车辆配件键值数据');
    }
    return readDbFromFile();
  }
  return existing;
}

async function ensureKvDb() {
  if (!kvEnabled) return;
  try {
    const existing = await kvGet<PartsDatabase>(PARTS_NAMESPACE, PARTS_KEY);
    if (existing) return;
    const parsed = await readDbFromFile();
    await kvSet(PARTS_NAMESPACE, PARTS_KEY, parsed);
  } catch (error) {
    if (!allowJsonFallback) throw error;
    kvEnabled = false;
  }
}

async function readDbFromFile(): Promise<PartsDatabase> {
  await ensureDbFile();
  const raw = await fs.readFile(dataFile, 'utf-8');
  return JSON.parse(raw) as PartsDatabase;
}

export async function searchVehicleByVin(vin: string) {
  const db = await readDb();
  const normalized = (vin || '').trim().toUpperCase();
  if (!normalized) return null;
  // 演示：根据 VIN 前缀/完全匹配返回车型
  const model =
    db.models.find((m) => m.vin.toUpperCase() === normalized) ||
    db.models.find((m) => normalized.startsWith(m.vin.slice(0, 8).toUpperCase())) ||
    db.models.find((m) => m.brand.includes(normalized.slice(0, 4))) ||
    db.models[0];
  return model || null;
}

export async function listVehicleModels(keyword?: string) {
  const db = await readDb();
  const k = (keyword || '').trim().toLowerCase();
  if (!k) return db.models;
  return db.models.filter((m) =>
    [m.brand, m.series, m.trim, m.vin].some((v) => (v || '').toLowerCase().includes(k))
  );
}

export async function getCategoriesByModel(modelId: string) {
  const db = await readDb();
  const model = db.models.find((m) => m.id === modelId);
  return model?.categories || [];
}

export async function searchParts(params: {
  vehicleModelId: string;
  category?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await readDb();
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(params.pageSize || 20)));
  const k = (params.keyword || '').trim().toLowerCase();
  const filtered = db.parts.filter((p) => {
    if (p.vehicle_model_id !== params.vehicleModelId) return false;
    if (params.category && p.category !== params.category) return false;
    if (!k) return true;
    return [p.name, p.original_name, p.oem_code, p.subcategory]
      .some((v) => (v || '').toLowerCase().includes(k));
  });
  const start = (page - 1) * pageSize;
  return {
    items: filtered.slice(start, start + pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}
