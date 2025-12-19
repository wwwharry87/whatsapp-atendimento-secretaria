// src/lib/redisCache.ts
import { RedisLite } from "./redisLite";

const REDIS_URL = process.env.REDIS_URL;

let client: RedisLite | null = null;

function getClient(): RedisLite | null {
  if (!REDIS_URL) return null;
  if (!client) client = new RedisLite(REDIS_URL);
  return client;
}

export function redisEnabled(): boolean {
  return !!REDIS_URL;
}

export async function warmupRedis(): Promise<void> {
  const c = getClient();
  if (!c) {
    console.log("[REDIS] REDIS_URL não definido (seguindo sem Redis).");
    return;
  }
  try {
    const ok = await c.ping();
    console.log(`[REDIS] Conectado: ${ok ? "PING ok" : "PING falhou"}`);
  } catch (e: any) {
    console.warn("[REDIS] Falha ao conectar (seguindo com fallback):", e?.message || e);
  }
}

export async function redisGet(key: string): Promise<string | null> {
  const c = getClient();
  if (!c) return null;
  try {
    return await c.get(key);
  } catch {
    return null;
  }
}

export async function redisSet(
  key: string,
  value: string,
  opts?: { exSeconds?: number; pxMs?: number; nx?: boolean }
): Promise<boolean> {
  const c = getClient();
  if (!c) return false;
  try {
    const r = await c.set(key, value, opts);
    return r === "OK";
  } catch {
    return false;
  }
}

export async function redisDel(key: string): Promise<number> {
  const c = getClient();
  if (!c) return 0;
  try {
    return await c.del(key);
  } catch {
    return 0;
  }
}

// Lock distribuído (best-effort) com token
export async function redisAcquireLock(key: string, ttlMs: number): Promise<string | null> {
  const token = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const ok = await redisSet(key, token, { nx: true, pxMs: ttlMs });
  return ok ? token : null;
}

export async function redisReleaseLock(key: string, token: string): Promise<boolean> {
  const c = getClient();
  if (!c) return false;

  // atomic compare-and-del
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `;
  try {
    const r = await c.eval(script, [key], [token]);
    return Number(r) > 0;
  } catch {
    return false;
  }
}
