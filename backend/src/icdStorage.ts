import fs from 'fs/promises';
import path from 'path';
import { kvGet, kvSet } from './kvStorage';

export interface Icd10Record {
  id: string;
  code: string;
  name: string;
  level1: string;
  level2: string;
  level3: string;
  injury_part: string;
  severity: string;
  treatment: string;
}

interface Icd10Database {
  items: Icd10Record[];
  updated_at?: string;
}

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.resolve(dataDir, 'icd10-db.json');
const ICD_NAMESPACE = 'icd10';
const ICD_KEY = 'primary';
let kvEnabled = true;
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

async function ensureDbFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    const empty: Icd10Database = { items: [], updated_at: new Date().toLocaleString('zh-CN', { hour12: false }) };
    await fs.writeFile(dataFile, JSON.stringify(empty, null, 2), 'utf-8');
  }
}

export async function readIcdDb(): Promise<Icd10Database> {
  await ensureKvDb();
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    return readIcdDbFromFile();
  }
  const existing = await kvGet<Icd10Database>(ICD_NAMESPACE, ICD_KEY).catch(() => {
    kvEnabled = false;
    return null;
  });
  if (!existing) {
    if (!allowJsonFallback) {
      throw new Error('未找到 ICD10 键值数据');
    }
    return readIcdDbFromFile();
  }
  return existing;
}

export async function writeIcdDb(items: Icd10Record[]) {
  const payload: Icd10Database = {
    items,
    updated_at: new Date().toLocaleString('zh-CN', { hour12: false }),
  };
  await ensureKvDb();
  if (kvEnabled) {
    await kvSet(ICD_NAMESPACE, ICD_KEY, payload).catch(() => {
      kvEnabled = false;
    });
  }
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    await ensureDbFile();
    await fs.writeFile(dataFile, JSON.stringify(payload, null, 2), 'utf-8');
  }
}

async function ensureKvDb() {
  if (!kvEnabled) return;
  try {
    const existing = await kvGet<Icd10Database>(ICD_NAMESPACE, ICD_KEY);
    if (existing) return;

    const parsed = await readIcdDbFromFile();
    await kvSet(ICD_NAMESPACE, ICD_KEY, parsed);
  } catch (error) {
    if (!allowJsonFallback) throw error;
    kvEnabled = false;
  }
}

async function readIcdDbFromFile(): Promise<Icd10Database> {
  await ensureDbFile();
  const raw = await fs.readFile(dataFile, 'utf-8');
  return JSON.parse(raw) as Icd10Database;
}

export async function searchIcdRecords(params: {
  keyword?: string;
  level1?: string;
  level2?: string;
  level3?: string;
  level4?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = await readIcdDb();
  const keyword = (params.keyword || '').trim().toLowerCase();
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = Math.max(1, Math.min(100, Number(params.pageSize || 20)));

  const filtered = db.items.filter((item) => {
    if (params.level1 && item.level1 !== params.level1) return false;
    if (params.level2 && item.level2 !== params.level2) return false;
    if (params.level3 && item.level3 !== params.level3) return false;
    if (params.level4 && item.name !== params.level4) return false;
    if (!keyword) return true;

    const haystack = [
      item.code,
      item.name,
      item.level1,
      item.level2,
      item.level3,
      item.injury_part,
      item.severity,
    ].join(' ').toLowerCase();
    return haystack.includes(keyword);
  });

  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize);

  return {
    items,
    total: filtered.length,
    page,
    pageSize,
    level1Options: Array.from(new Set(db.items.map((item) => item.level1).filter(Boolean))),
    level2Options: Array.from(new Set(db.items.filter((item) => !params.level1 || item.level1 === params.level1).map((item) => item.level2).filter(Boolean))),
    level3Options: Array.from(new Set(db.items.filter((item) => (!params.level1 || item.level1 === params.level1) && (!params.level2 || item.level2 === params.level2)).map((item) => item.level3).filter(Boolean))),
    level4Options: Array.from(new Set(db.items.filter((item) => (!params.level1 || item.level1 === params.level1) && (!params.level2 || item.level2 === params.level2) && (!params.level3 || item.level3 === params.level3)).map((item) => item.name).filter(Boolean))),
    updatedAt: db.updated_at,
  };
}