import path from 'path';
import { createKvFileStorage } from './kvFileStorage';

export interface WorkInjuryStandard {
  id: string;
  province: string;
  city?: string;
  household_type?: '城镇' | '农村' | '';
  disability_base_per_year: number;
  death_base_per_year: number;
  compensation_years: number;
  updated_at: string;
  source: string;
}

interface WorkInjuryDatabase {
  items: WorkInjuryStandard[];
}

function nowText() {
  return new Date().toLocaleString('zh-CN', { hour12: false });
}

const seedData: WorkInjuryDatabase = {
  items: [
    {
      id: 'CN-default-town',
      province: '全国默认',
      city: '',
      household_type: '城镇',
      disability_base_per_year: 52000,
      death_base_per_year: 52000,
      compensation_years: 20,
      updated_at: nowText(),
      source: '内置演示基准（可替换为地方统计口径）',
    },
    {
      id: 'CN-default-rural',
      province: '全国默认',
      city: '',
      household_type: '农村',
      disability_base_per_year: 28000,
      death_base_per_year: 28000,
      compensation_years: 20,
      updated_at: nowText(),
      source: '内置演示基准（可替换为地方统计口径）',
    },
    {
      id: 'SH-town',
      province: '上海市',
      city: '上海市',
      household_type: '城镇',
      disability_base_per_year: 84000,
      death_base_per_year: 84000,
      compensation_years: 20,
      updated_at: nowText(),
      source: '演示样例',
    },
    {
      id: 'SH-rural',
      province: '上海市',
      city: '上海市',
      household_type: '农村',
      disability_base_per_year: 56000,
      death_base_per_year: 56000,
      compensation_years: 20,
      updated_at: nowText(),
      source: '演示样例',
    },
    {
      id: 'GD-town',
      province: '广东省',
      city: '',
      household_type: '城镇',
      disability_base_per_year: 62000,
      death_base_per_year: 62000,
      compensation_years: 20,
      updated_at: nowText(),
      source: '演示样例',
    },
    {
      id: 'ZJ-town',
      province: '浙江省',
      city: '',
      household_type: '城镇',
      disability_base_per_year: 64000,
      death_base_per_year: 64000,
      compensation_years: 20,
      updated_at: nowText(),
      source: '演示样例',
    },
  ],
};

const workInjuryStore = createKvFileStorage<WorkInjuryDatabase>({
  dataFile: path.resolve(__dirname, '../data/work-injury-standards.json'),
  seed: seedData,
  namespace: 'work_injury',
  key: 'primary',
});

export async function queryWorkInjuryStandard(params: {
  province?: string;
  city?: string;
  householdType?: string;
}) {
  const db = await workInjuryStore.readDb();
  const province = (params.province || '').trim();
  const city = (params.city || '').trim();
  const householdType = (params.householdType || '').trim();

  const score = (item: WorkInjuryStandard) => {
    let s = 0;
    if (province && item.province === province) s += 8;
    if (city && item.city && item.city === city) s += 4;
    if (householdType && item.household_type && item.household_type === householdType) s += 2;
    if (item.province === '全国默认') s += 1;
    return s;
  };

  const candidates = db.items
    .filter((item) => {
      if (province && item.province !== province && item.province !== '全国默认') return false;
      if (city && item.city && item.city !== city) return false;
      if (householdType && item.household_type && item.household_type !== householdType) return false;
      return true;
    })
    .sort((a, b) => score(b) - score(a));

  const picked = candidates[0] || db.items[0];
  return {
    ...picked,
    matchedBy: {
      province: picked.province === province,
      city: !!city && picked.city === city,
      householdType: !!householdType && picked.household_type === householdType,
    },
  };
}
