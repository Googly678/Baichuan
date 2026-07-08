import fs from 'fs/promises';
import path from 'path';
import { DemoDatabase, ClaimCase } from './types';
import { seedData } from './seedData';
import { kvGet, kvSet } from './kvStorage';

const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.resolve(dataDir, 'demo-db.json');
const tempDataFile = path.resolve(dataDir, 'demo-db.json.tmp');
let writeQueue: Promise<void> = Promise.resolve();
const CLAIMS_NAMESPACE = 'claims';
const CLAIMS_KEY = 'primary';
let kvEnabled = true;
const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';

// 初始化时检查是否启用 JSON fallback
console.log(`[STORAGE] JSON Fallback 模式: ${allowJsonFallback ? '启用' : '禁用'}`);
console.log(`[STORAGE] PostgreSQL 连接字符串: ${process.env.DATABASE_URL || '未设置'}`);

async function ensureDbFile() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(dataFile);
  } catch {
    console.log(`[STORAGE] 数据文件不存在，创建初始数据文件: ${dataFile}`);
    await fs.writeFile(dataFile, JSON.stringify(seedData, null, 2), 'utf-8');
  }
}

async function readFileDb(): Promise<DemoDatabase> {
  await ensureDbFile();
  try {
    const raw = await fs.readFile(dataFile, 'utf-8');
    const tryParse = (text: string) => JSON.parse(text) as DemoDatabase;

    try {
      return tryParse(raw);
    } catch {
      console.warn(`[STORAGE] JSON 文件格式有问题，尝试修复...`);
      const sanitized = raw.replace(/\u0000+$/g, '').trimEnd();
      try {
        return tryParse(sanitized);
      } catch {
        const lastBrace = sanitized.lastIndexOf('}');
        if (lastBrace > 0) {
          const prefix = sanitized.slice(0, lastBrace + 1);
          return tryParse(prefix);
        }
        throw new Error('数据库文件损坏且无法自动恢复');
      }
    }
  } catch (error) {
    console.error(`[STORAGE] 读取数据文件失败:`, error);
    throw error;
  }
}

async function ensureKvDb() {
  if (!kvEnabled) return;
  try {
    const existing = await kvGet<DemoDatabase>(CLAIMS_NAMESPACE, CLAIMS_KEY);
    if (existing) {
      console.log(`[STORAGE] KV 数据库已初始化`);
      return;
    }
    console.log(`[STORAGE] KV 数据库为空，初始化数据...`);
    const fileDb = await readFileDb().catch(() => {
      console.warn(`[STORAGE] 读取文件失败，使用默认演示数据`);
      return seedData;
    });
    await kvSet(CLAIMS_NAMESPACE, CLAIMS_KEY, fileDb);
    console.log(`[STORAGE] KV 数据库初始化完成`);
  } catch (error) {
    console.error(`[STORAGE] KV 数据库初始化失败:`, error);
    if (!allowJsonFallback) throw error;
    kvEnabled = false;
    console.log(`[STORAGE] 已切换到 JSON 文件存储模式`);
  }
}

export async function readDb(): Promise<DemoDatabase> {
  await ensureKvDb();
  
  // 优先尝试读取 KV 数据库
  if (kvEnabled) {
    try {
      const db = await kvGet<DemoDatabase>(CLAIMS_NAMESPACE, CLAIMS_KEY);
      if (db) {
        console.log(`[STORAGE] 从 KV 存储读取数据`);
        return db;
      }
    } catch (error) {
      console.warn(`[STORAGE] KV 数据库读取失败:`, error);
      kvEnabled = false;
    }
  }

  // 回退到 JSON 文件
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    console.log(`[STORAGE] 使用 JSON 文件存储读取数据`);
    return readFileDb();
  }
  
  // 如果 KV 返回 null，返回文件数据
  console.log(`[STORAGE] KV 存储为空，回退到 JSON 文件`);
  return readFileDb();
}

async function writeDbDirect(db: DemoDatabase) {
  await ensureKvDb();
  
  // 尝试写入 KV 数据库
  if (kvEnabled) {
    try {
      await kvSet(CLAIMS_NAMESPACE, CLAIMS_KEY, db);
      console.log(`[STORAGE] 数据已保存到 KV 存储`);
      return; // 成功保存到 KV，无需再写文件
    } catch (kvError) {
      console.warn(`[STORAGE] KV 数据库写入失败，回退到 JSON 文件:`, kvError);
      kvEnabled = false;
    }
  }

  // 回退到 JSON 文件写入
  if (!kvEnabled) {
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    
    try {
      const content = JSON.stringify(db, null, 2);
      // 先写到临时文件，再重命名，确保原子性
      await fs.writeFile(tempDataFile, content, 'utf-8');
      await fs.rename(tempDataFile, dataFile);
      console.log(`[STORAGE] 数据已保存到 JSON 文件`);
    } catch (fileError) {
      console.error(`[STORAGE] JSON 文件写入失败:`, fileError);
      throw new Error(`文件系统写入失败: ${(fileError as Error).message}`);
    }
  }
}

async function enqueueWrite<T>(job: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(job, job);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

export async function writeDb(db: DemoDatabase) {
  return enqueueWrite(async () => {
    await writeDbDirect(db);
  });
}

export async function listCases() {
  const db = await readDb();
  return db.cases;
}

export async function findCase(caseId: string) {
  const db = await readDb();
  return db.cases.find((item) => item.id === caseId) || null;
}

export async function saveCase(caseId: string, payload: ClaimCase) {
  return enqueueWrite(async () => {
    const db = await readDb();
    const index = db.cases.findIndex((item) => item.id === caseId);
    if (index === -1) throw new Error('案件不存在');
    db.cases[index] = payload;
    await writeDbDirect(db);
    return db.cases[index];
  });
}

export async function createCase(payload: ClaimCase) {
  return enqueueWrite(async () => {
    const db = await readDb();
    db.cases.unshift(payload);
    await writeDbDirect(db);
    return payload;
  });
}