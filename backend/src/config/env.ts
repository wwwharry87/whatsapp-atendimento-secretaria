// src/config/env.ts
import dotenv from "dotenv";
dotenv.config();

function str(name: string, def?: string): string {
  const v = process.env[name];
  if (v == null || v === "") return def ?? "";
  return v;
}

function num(name: string, def: number): number {
  const v = process.env[name];
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function bool(name: string, def = false): boolean {
  const v = (process.env[name] ?? "").toString().trim().toLowerCase();
  if (!v) return def;
  return ["true", "1", "yes", "y", "sim"].includes(v);
}

function required(name: string, hint?: string): string {
  const v = str(name, "");
  if (!v) {
    throw new Error(
      `[ENV] Variável obrigatória ausente: ${name}${hint ? ` (${hint})` : ""}`
    );
  }
  return v;
}

/**
 * Regras de produção:
 * - se NODE_ENV=production, exigimos coisas essenciais do WhatsApp e DB
 * - senão, deixamos defaults pra desenvolvimento local
 */
const nodeEnv = str("NODE_ENV", "development");
const isProd = nodeEnv === "production";

// (opcional) Render costuma fornecer DATABASE_URL. Se você quiser usar depois, já fica disponível aqui.
const databaseUrl = str("DATABASE_URL", "");

// WhatsApp
const whatsappAccessToken = str("WHATSAPP_ACCESS_TOKEN", "");
const whatsappPhoneNumberId = str("WHATSAPP_PHONE_NUMBER_ID", "");
const whatsappVerifyToken = str("WHATSAPP_VERIFY_TOKEN", "verify_token_teste");

// Se você quiser validar assinatura do webhook (x-hub-signature-256)
const whatsappAppSecret = str("WHATSAPP_APP_SECRET", "");

// DeepSeek / IA
const deepseekApiKey = str("DEEPSEEK_API_KEY", "");
const deepseekApiUrl = str("DEEPSEEK_API_URL", "https://api.deepseek.com/chat/completions");
const deepseekModel = str("DEEPSEEK_MODEL", "deepseek-chat");
const iaHabilitada = bool("IA_HABILITADA", false);

// DB (fallback quando não usa DATABASE_URL)
const dbHost = str("DB_HOST", "localhost");
const dbPort = num("DB_PORT", 5432);
const dbUsername = str("DB_USERNAME", "postgres");
const dbPassword = str("DB_PASSWORD", "postgres");
const dbDatabase = str("DB_DATABASE", "whatsapp_atendimento");

// Pool/SSL (para o data-source “produção”)
const dbSSL = bool("DB_SSL", isProd); // default: prod=true
const poolMax = num("DB_POOL_MAX", 10);
const poolMin = num("DB_POOL_MIN", 0);
const idleTimeoutMs = num("DB_IDLE_TIMEOUT_MS", 30000);
const connectionTimeoutMs = num("DB_CONNECTION_TIMEOUT_MS", 10000);

// JWT (mesmo que seu config/auth.ts leia direto do process.env, já deixo regra aqui)
// (Não forço aqui pra não quebrar import, mas você pode exigir no auth.ts como já fizemos)
const jwtSecret = str("JWT_SECRET", "");
const jwtExpiresIn = str("JWT_EXPIRES_IN", "8h");

// ✅ Validações mínimas em produção (sem travar dev)
if (isProd) {
  // Banco: precisa de DATABASE_URL ou do conjunto host/user/pass/db
  if (!databaseUrl) {
    required("DB_HOST");
    required("DB_USERNAME");
    required("DB_PASSWORD");
    required("DB_DATABASE");
  }

  // WhatsApp: token e phone_number_id precisam existir
  if (!whatsappAccessToken) required("WHATSAPP_ACCESS_TOKEN");
  if (!whatsappPhoneNumberId) required("WHATSAPP_PHONE_NUMBER_ID");

  // Verify token deve ser configurado (evitar default em prod)
  if (!process.env.WHATSAPP_VERIFY_TOKEN) {
    throw new Error("[ENV] WHATSAPP_VERIFY_TOKEN obrigatório em produção.");
  }

  // JWT: recomendo fortemente (>= 32 chars)
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("[ENV] JWT_SECRET fraco/ausente. Em produção use um segredo forte (>= 32 chars).");
  }
}

export const env = {
  nodeEnv,
  isProd,
  port: num("PORT", 3000),

  // Se você quiser no futuro mudar o DataSource para usar URL:
  // env.db.url estará pronto.
  db: {
    url: databaseUrl || undefined,
    host: dbHost,
    port: dbPort,
    username: dbUsername,
    password: dbPassword,
    database: dbDatabase,

    ssl: dbSSL,
    poolMax,
    poolMin,
    idleTimeoutMs,
    connectionTimeoutMs,
  },

  whatsapp: {
    apiVersion: str("WHATSAPP_API_VERSION", "v24.0"),
    phoneNumberId: whatsappPhoneNumberId,
    accessToken: whatsappAccessToken,
    verifyToken: whatsappVerifyToken,

    // assinatura do webhook (opcional)
    appSecret: whatsappAppSecret || undefined,
  },

  // IA / DeepSeek
  DEEPSEEK_API_KEY: deepseekApiKey,
  DEEPSEEK_API_URL: deepseekApiUrl,
  DEEPSEEK_MODEL: deepseekModel,
  IA_HABILITADA: iaHabilitada,

  // JWT (útil se você quiser centralizar config depois)
  JWT_SECRET: jwtSecret || undefined,
  JWT_EXPIRES_IN: jwtExpiresIn,
};
