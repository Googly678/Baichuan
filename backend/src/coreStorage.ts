import fs from 'fs/promises';
import path from 'path';
import { CoreClaimRecord, CoreDatabase } from './types';
import { kvGet, kvSet } from './kvStorage';

const dataDir = path.resolve(__dirname, '../data');
const coreFile = path.resolve(dataDir, 'core-db.json');
const tempCoreFile = path.resolve(dataDir, 'core-db.json.tmp');
let writeQueue: Promise<void> = Promise.resolve();
const CORE_NAMESPACE = 'core_claims';
const CORE_KEY = 'primary';
let kvEnabled = true;

const defaultCoreDb: CoreDatabase = { records: [] };
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

async function ensureCoreFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(coreFile);
  } catch {
    await fs.writeFile(coreFile, JSON.stringify(defaultCoreDb, null, 2), 'utf-8');
  }
}

async function writeCoreDbDirect(db: CoreDatabase) {
  await ensureCoreKvDb();
  if (kvEnabled) {
    await kvSet(CORE_NAMESPACE, CORE_KEY, db).catch(() => {
      kvEnabled = false;
    });
  }
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    await ensureCoreFile();
    const content = JSON.stringify(db, null, 2);
    await fs.writeFile(tempCoreFile, content, 'utf-8');
    await fs.rename(tempCoreFile, coreFile);
  }
}

function tryParse(text: string): CoreDatabase {
  const parsed = JSON.parse(text) as CoreDatabase;
  if (!Array.isArray(parsed.records)) return defaultCoreDb;
  return parsed;
}

export async function readCoreDb(): Promise<CoreDatabase> {
  await ensureCoreKvDb();
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    return readCoreDbFromFile();
  }
  const existing = await kvGet<CoreDatabase>(CORE_NAMESPACE, CORE_KEY).catch(() => {
    kvEnabled = false;
    return null;
  });
  if (!existing) {
    if (!allowJsonFallback) {
      throw new Error('未找到 core claims 键值数据');
    }
    return readCoreDbFromFile();
  }
  return existing;
}

async function ensureCoreKvDb() {
  if (!kvEnabled) return;
  try {
    const existing = await kvGet<CoreDatabase>(CORE_NAMESPACE, CORE_KEY);
    if (existing) return;

    const recovered = await readCoreDbFromFile();
    await kvSet(CORE_NAMESPACE, CORE_KEY, recovered);
  } catch (error) {
    if (!allowJsonFallback) throw error;
    kvEnabled = false;
  }
}

async function readCoreDbFromFile(): Promise<CoreDatabase> {
  await ensureCoreFile();
  const raw = await fs.readFile(coreFile, 'utf-8');
  try {
    return tryParse(raw);
  } catch {
    const sanitized = raw.replace(/\u0000+$/g, '').trimEnd();
    return tryParse(sanitized);
  }
}

async function enqueueWrite<T>(job: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(job, job);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function listCoreRecords() {
  const db = await readCoreDb();
  return db.records;
}

export async function findCoreRecord(caseNo: string) {
  const db = await readCoreDb();
  return db.records.find((item) => item.case_no === caseNo) || null;
}

export async function upsertCoreRecord(payload: CoreClaimRecord) {
  return enqueueWrite(async () => {
    const db = await readCoreDb();
    const index = db.records.findIndex((item) => item.case_no === payload.case_no);
    if (index === -1) {
      db.records.unshift(payload);
    } else {
      db.records[index] = payload;
    }
    await writeCoreDbDirect(db);
    return payload;
  });
}
