import fs from 'fs/promises';
import path from 'path';
import { kvGet, kvSet } from './kvStorage';

/**
 * 通用 KV → JSON 文件回退存储工厂。
 *
 * 封装了 6 个 storage 模块中重复出现的同一套模板：
 * `ensureFile`（缺文件写种子）→ `ensureKvDb`（KV 初始化）→ `readDb`（读取）
 * + 写串行队列 + 原子写回退。通过参数覆盖各模块差异。
 */
export interface KvFileStorage<T> {
  /** 读取整个数据库（按 mode 决定 KV 优先或文件优先） */
  readDb(): Promise<T>;
  /** 写入整个数据库（串行队列 + KV/文件回退） */
  writeDb(db: T): Promise<void>;
  /** 串行写队列（多个写操作按顺序执行，避免并发覆盖） */
  enqueueWrite<U>(job: () => Promise<U>): Promise<U>;
  /** 确保数据目录与文件存在（不存在时写入种子数据） */
  ensureFile(): Promise<void>;
}

export interface KvFileStorageOptions<T> {
  /** 数据文件绝对路径 */
  dataFile: string;
  /** 文件不存在时写入的种子数据 */
  seed: T;
  /** KV namespace */
  namespace: string;
  /** KV key */
  key: string;
  /** 读取方向：kv-first（默认）| file-first */
  mode?: 'kv-first' | 'file-first';
  /** 是否尝试修复损坏的 JSON（storage.ts 需要） */
  repairJson?: boolean;
}

export function createKvFileStorage<T>(opts: KvFileStorageOptions<T>): KvFileStorage<T> {
  const {
    dataFile,
    seed,
    namespace,
    key,
    mode = 'kv-first',
    repairJson = false,
  } = opts;
  const dataDir = path.dirname(dataFile);
  const tempDataFile = `${dataFile}.tmp`;
  let kvEnabled = true;
  const allowJsonFallback = process.env.ALLOW_JSON_FALLBACK === 'true';
  let writeQueue: Promise<void> = Promise.resolve();

  async function ensureFile() {
    await fs.mkdir(dataDir, { recursive: true });
    try {
      await fs.access(dataFile);
    } catch {
      await fs.writeFile(dataFile, JSON.stringify(seed, null, 2), 'utf-8');
    }
  }

  async function readFileDb(): Promise<T> {
    await ensureFile();
    const raw = await fs.readFile(dataFile, 'utf-8');
    const tryParse = (text: string) => JSON.parse(text) as T;
    try {
      return tryParse(raw);
    } catch {
      if (!repairJson) throw new Error(`JSON 解析失败: ${dataFile}`);
      const sanitized = raw.replace(/\u0000+$/g, '').trimEnd();
      try {
        return tryParse(sanitized);
      } catch {
        const lastBrace = sanitized.lastIndexOf('}');
        if (lastBrace > 0) {
          return tryParse(sanitized.slice(0, lastBrace + 1));
        }
        throw new Error('数据库文件损坏且无法自动恢复');
      }
    }
  }

  async function ensureKvDb() {
    if (!kvEnabled) return;
    try {
      const existing = await kvGet<T>(namespace, key);
      if (existing) return;
      const fileDb = await readFileDb();
      await kvSet(namespace, key, fileDb);
    } catch (error) {
      if (!allowJsonFallback) throw error;
      kvEnabled = false;
    }
  }

  async function readDb(): Promise<T> {
    if (mode === 'file-first') {
      // 静态参考数据：优先直接读文件，避免 KV/Prisma 连接问题
      try {
        return await readFileDb();
      } catch (fileErr) {
        try {
          const existing = await kvGet<T>(namespace, key);
          if (existing) return existing;
        } catch {
          // KV 也不可用，抛出原始文件错误
        }
        throw fileErr;
      }
    }

    // kv-first：优先 KV，失败回退文件
    await ensureKvDb();
    if (kvEnabled) {
      try {
        const db = await kvGet<T>(namespace, key);
        if (db) return db;
      } catch {
        kvEnabled = false;
      }
    }
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    return readFileDb();
  }

  async function writeDbDirect(db: T) {
    await ensureKvDb();
    if (kvEnabled) {
      try {
        await kvSet(namespace, key, db);
        return;
      } catch {
        kvEnabled = false;
      }
    }
    if (!allowJsonFallback) {
      throw new Error('数据库不可用，且未开启 JSON 回退');
    }
    // 先写临时文件再重命名，保证原子性
    const content = JSON.stringify(db, null, 2);
    await fs.writeFile(tempDataFile, content, 'utf-8');
    await fs.rename(tempDataFile, dataFile);
  }

  function enqueueWrite<U>(job: () => Promise<U>): Promise<U> {
    const result = writeQueue.then(job, job);
    writeQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function writeDb(db: T) {
    return enqueueWrite(async () => {
      await writeDbDirect(db);
    });
  }

  return { readDb, writeDb, enqueueWrite, ensureFile };
}
