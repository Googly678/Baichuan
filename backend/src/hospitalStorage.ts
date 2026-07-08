import fs from 'fs/promises';
import path from 'path';
import { kvGet, kvSet } from './kvStorage';

export interface HospitalRecord {
  id: string;
  name: string;
  credit_code: string;
  province: string;
  city: string;
  district: string;
}

interface HospitalDatabase {
  items: HospitalRecord[];
}

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.resolve(dataDir, 'hospital-db.json');
const HOSPITAL_NAMESPACE = 'hospitals';
const HOSPITAL_KEY = 'primary';
let kvEnabled = true;
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

const regions = [
  { province: '上海市', city: '上海市', districts: ['浦东新区', '黄浦区', '徐汇区'] },
  { province: '北京市', city: '北京市', districts: ['朝阳区', '海淀区', '东城区'] },
  { province: '广东省', city: '广州市', districts: ['越秀区', '天河区', '海珠区'] },
  { province: '广东省', city: '深圳市', districts: ['福田区', '南山区', '罗湖区'] },
  { province: '浙江省', city: '杭州市', districts: ['上城区', '西湖区', '滨江区'] },
  { province: '江苏省', city: '南京市', districts: ['鼓楼区', '玄武区', '建邺区'] },
  { province: '四川省', city: '成都市', districts: ['锦江区', '青羊区', '武侯区'] },
  { province: '湖北省', city: '武汉市', districts: ['江岸区', '武昌区', '洪山区'] },
  { province: '山东省', city: '济南市', districts: ['历下区', '市中区', '槐荫区'] },
  { province: '河南省', city: '郑州市', districts: ['金水区', '中原区', '二七区'] },
  { province: '福建省', city: '福州市', districts: ['鼓楼区', '台江区', '仓山区'] },
  { province: '湖南省', city: '长沙市', districts: ['芙蓉区', '天心区', '岳麓区'] },
];

const hospitalSuffixes = [
  '第一人民医院',
  '第二人民医院',
  '第三人民医院',
  '中医院',
  '中西医结合医院',
  '中心医院',
  '妇幼保健院',
  '骨科医院',
  '肿瘤医院',
  '医科大学附属医院',
  '工伤康复医院',
  '创伤医院',
];

function generateSeedHospitals(): HospitalDatabase {
  const items: HospitalRecord[] = [];
  let seq = 1;

  for (const region of regions) {
    for (const district of region.districts) {
      for (const suffix of hospitalSuffixes) {
        const id = `h-${seq}`;
        const code = `9${String(seq).padStart(17, '0')}`;
        items.push({
          id,
          name: `${region.city}${suffix}`,
          credit_code: code,
          province: region.province,
          city: region.city,
          district,
        });
        seq += 1;
      }
    }
  }
  return { items };
}

async function ensureDbFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    await fs.writeFile(dataFile, JSON.stringify(generateSeedHospitals(), null, 2), 'utf-8');
  }
}

async function readDb(): Promise<HospitalDatabase> {
  await ensureKvDb();
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    return readDbFromFile();
  }
  const existing = await kvGet<HospitalDatabase>(HOSPITAL_NAMESPACE, HOSPITAL_KEY).catch(() => {
    kvEnabled = false;
    return null;
  });
  if (!existing) {
    if (!allowJsonFallback) {
      throw new Error('未找到医院键值数据');
    }
    return readDbFromFile();
  }
  return existing;
}

async function ensureKvDb() {
  if (!kvEnabled) return;
  try {
    const existing = await kvGet<HospitalDatabase>(HOSPITAL_NAMESPACE, HOSPITAL_KEY);
    if (existing) return;

    const parsed = await readDbFromFile();
    await kvSet(HOSPITAL_NAMESPACE, HOSPITAL_KEY, parsed);
  } catch (error) {
    if (!allowJsonFallback) throw error;
    kvEnabled = false;
  }
}

async function readDbFromFile(): Promise<HospitalDatabase> {
  await ensureDbFile();
  const raw = await fs.readFile(dataFile, 'utf-8');
  return JSON.parse(raw) as HospitalDatabase;
}

export async function searchHospitals(params: {
  province?: string;
  city?: string;
  district?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await readDb();
  const keyword = (params.keyword || '').trim().toLowerCase();
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(params.pageSize || 20)));

  const filtered = db.items.filter((item) => {
    if (params.province && item.province !== params.province) return false;
    if (params.city && item.city !== params.city) return false;
    if (params.district && item.district !== params.district) return false;
    if (!keyword) return true;
    const haystack = `${item.name} ${item.credit_code} ${item.province} ${item.city} ${item.district}`.toLowerCase();
    return haystack.includes(keyword);
  });

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total: filtered.length,
    page,
    pageSize,
    provinceOptions: Array.from(new Set(db.items.map((item) => item.province))),
    cityOptions: Array.from(new Set(db.items.filter((item) => !params.province || item.province === params.province).map((item) => item.city))),
    districtOptions: Array.from(new Set(db.items.filter((item) => (!params.province || item.province === params.province) && (!params.city || item.city === params.city)).map((item) => item.district))),
  };
}
