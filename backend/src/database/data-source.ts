// src/database/data-source.ts
import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";

import { Departamento } from "../entities/Departamento";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { Usuario } from "../entities/Usuario";
import { UsuarioDepartamento } from "../entities/UsuarioDepartamento";
import { AtendimentoEvento } from "../entities/AtendimentoEvento";
import { HorarioAtendimento } from "../entities/HorarioAtendimento";
import { Cliente } from "../entities/Cliente";

/**
 * =========================
 * Produção: Render + Postgres
 * =========================
 *
 * - synchronize: false (você usa DDL/migrations)
 * - ssl: condicional (em prod geralmente precisa)
 * - pool: configurações seguras
 * - logging: controlado por env
 */

function shouldUseSSL() {
  // você pode controlar via env.db.ssl = true/false no seu config/env
  const fromEnv = (env as any)?.db?.ssl;
  if (typeof fromEnv === "boolean") return fromEnv;

  // fallback: produção -> true
  return env.nodeEnv === "production";
}

function buildSSLConfig() {
  if (!shouldUseSSL()) return undefined;

  // Render geralmente precisa rejectUnauthorized=false
  return { rejectUnauthorized: false };
}

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,

  entities: [
    Departamento,
    Atendimento,
    Mensagem,
    Usuario,
    UsuarioDepartamento,
    AtendimentoEvento,
    HorarioAtendimento,
    Cliente,
  ],

  // você já usa DDL/migrations
  synchronize: false,

  // logging controlado por env (ideal)
  logging: env.nodeEnv !== "production" ? ["error", "warn"] : ["error"],

  ssl: buildSSLConfig(),

  /**
   * Pool do driver pg (TypeORM repassa para o node-postgres)
   * Ajuste dependendo do seu plano do Render.
   */
  extra: {
    max: env.db.poolMax ?? 10, // máximo conexões
    min: env.db.poolMin ?? 0,
    idleTimeoutMillis: env.db.idleTimeoutMs ?? 30000,
    connectionTimeoutMillis: env.db.connectionTimeoutMs ?? 10000,
    // keepAlive ajuda em alguns ambientes
    keepAlive: true,
  },
});

/**
 * Helper opcional: inicialização com retry
 * Use isso no seu index.ts/server.ts ao iniciar o app.
 */
export async function initDataSourceWithRetry(opts?: {
  retries?: number;
  delayMs?: number;
}) {
  const retries = opts?.retries ?? 10;
  const delayMs = opts?.delayMs ?? 1500;

  let lastErr: any;

  for (let i = 1; i <= retries; i++) {
    try {
      if (!AppDataSource.isInitialized) {
        await AppDataSource.initialize();
      }
      console.log(`[DB] Conectado com sucesso (tentativa ${i}/${retries})`);
      return AppDataSource;
    } catch (err) {
      lastErr = err;
      console.error(`[DB] Falha ao conectar (tentativa ${i}/${retries})`, err);

      // aguarda antes de tentar de novo
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastErr;
}
