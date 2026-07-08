import { PrismaClient } from '@prisma/client';

type KvRow = {
  kv_key: string;
  kv_value: unknown;
  updated_at: Date;
};

let prismaClient: PrismaClient | null = null;
let initPromise: Promise<void> | null = null;

function getPrismaClient() {
  if (!prismaClient) {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL = 'postgresql://root:password@localhost:5432/rider_claims?schema=public';
    }
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}

async function ensureTable() {
  if (!initPromise) {
    initPromise = getPrismaClient().$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS app_kv_store (
        kv_namespace TEXT NOT NULL,
        kv_key TEXT NOT NULL,
        kv_value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (kv_namespace, kv_key)
      );
    `).then(() => undefined);
  }
  await initPromise;
}

export async function kvGet<T>(namespace: string, key: string): Promise<T | null> {
  await ensureTable();
  const rows = await getPrismaClient().$queryRawUnsafe<KvRow[]>(
    `
      SELECT kv_key, kv_value, updated_at
      FROM app_kv_store
      WHERE kv_namespace = $1 AND kv_key = $2
      LIMIT 1
    `,
    namespace,
    key
  );
  if (!rows.length) return null;
  return rows[0].kv_value as T;
}

export async function kvSet<T>(namespace: string, key: string, value: T): Promise<void> {
  await ensureTable();
  await getPrismaClient().$executeRawUnsafe(
    `
      INSERT INTO app_kv_store (kv_namespace, kv_key, kv_value, updated_at)
      VALUES ($1, $2, $3::jsonb, NOW())
      ON CONFLICT (kv_namespace, kv_key)
      DO UPDATE SET kv_value = EXCLUDED.kv_value, updated_at = NOW()
    `,
    namespace,
    key,
    JSON.stringify(value)
  );
}

export async function kvDelete(namespace: string, key: string): Promise<void> {
  await ensureTable();
  await getPrismaClient().$executeRawUnsafe(
    `DELETE FROM app_kv_store WHERE kv_namespace = $1 AND kv_key = $2`,
    namespace,
    key
  );
}

export async function kvList<T>(namespace: string): Promise<Array<{ key: string; value: T; updatedAt: string }>> {
  await ensureTable();
  const rows = await getPrismaClient().$queryRawUnsafe<KvRow[]>(
    `
      SELECT kv_key, kv_value, updated_at
      FROM app_kv_store
      WHERE kv_namespace = $1
      ORDER BY updated_at DESC
    `,
    namespace
  );
  return rows.map((row) => ({
    key: row.kv_key,
    value: row.kv_value as T,
    updatedAt: row.updated_at.toISOString(),
  }));
}