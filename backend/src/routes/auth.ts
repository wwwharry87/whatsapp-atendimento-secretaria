// src/routes/auth.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt, { JwtPayload } from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";
import { Cliente } from "../entities/Cliente";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/auth";

const router = Router();
const usuariosRepo = AppDataSource.getRepository(Usuario);
const clientesRepo = AppDataSource.getRepository(Cliente);

/**
 * =========================
 * 1) Segurança de senha
 * =========================
 *
 * - LEGADO 1: SHA-256 hex (64 chars)
 * - LEGADO 2: bcrypt ($2a$ / $2b$ / $2y$)  ✅ agora suportado
 * - NOVO: scrypt (forte, nativo Node) com salt por senha
 *
 * Formato armazenado em Usuario.senhaHash:
 *   scrypt$N$r$p$saltBase64$hashBase64
 *
 * Upgrade automático:
 * - Se o usuário tiver SHA-256 ou bcrypt e a senha estiver correta, regrava em scrypt.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const SCRYPT_MAXMEM = 64 * 1024 * 1024;

function legacySha256(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function hashPasswordScrypt(raw: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(raw, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });

  return [
    "scrypt",
    SCRYPT_N.toString(),
    SCRYPT_R.toString(),
    SCRYPT_P.toString(),
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

function isBcryptHash(stored: string): boolean {
  return typeof stored === "string" && /^\$2[aby]\$/.test(stored);
}

function verifyPassword(
  raw: string,
  stored: string
): { ok: boolean; legacy: boolean } {
  if (!stored) return { ok: false, legacy: false };

  // Novo formato scrypt$...
  if (stored.startsWith("scrypt$")) {
    const parts = stored.split("$");
    if (parts.length !== 6) return { ok: false, legacy: false };

    const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);

    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return { ok: false, legacy: false };
    }

    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");

    const derived = crypto.scryptSync(raw, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });

    return { ok: timingSafeEqual(derived, expected), legacy: false };
  }

  // ✅ bcrypt (muito comum no seu painel)
  if (isBcryptHash(stored)) {
    const ok = bcrypt.compareSync(raw, stored);
    return { ok, legacy: ok }; // marca como legacy para upgrade -> scrypt
  }

  // Legado SHA-256 hex (64 chars)
  if (/^[a-f0-9]{64}$/i.test(stored)) {
    const hashed = legacySha256(raw);
    const a = Buffer.from(hashed, "hex");
    const b = Buffer.from(stored, "hex");
    return { ok: timingSafeEqual(a, b), legacy: true };
  }

  return { ok: false, legacy: false };
}

/**
 * =========================
 * 2) Proteção brute-force
 * =========================
 */

type AttemptInfo = {
  count: number;
  firstAt: number;
  lastAt: number;
  blockedUntil?: number;
};

const ATTEMPTS_WINDOW_MS = 15 * 60 * 1000;
const ATTEMPTS_MAX = 5;
const BLOCK_MS = 10 * 60 * 1000;
const attempts = new Map<string, AttemptInfo>();

function getClientIp(req: Request): string {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) return xf.split(",")[0].trim();
  return req.ip || (req.socket?.remoteAddress ?? "unknown");
}

function attemptKey(ip: string, loginValue: string): string {
  return `${ip}::${loginValue}`;
}

function isBlocked(key: string): { blocked: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const info = attempts.get(key);
  if (!info) return { blocked: false };

  if (info.blockedUntil && info.blockedUntil > now) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil((info.blockedUntil - now) / 1000),
    };
  }
  return { blocked: false };
}

function registerFail(key: string) {
  const now = Date.now();
  const info = attempts.get(key);

  if (!info) {
    attempts.set(key, { count: 1, firstAt: now, lastAt: now });
    return;
  }

  if (now - info.firstAt > ATTEMPTS_WINDOW_MS) {
    attempts.set(key, { count: 1, firstAt: now, lastAt: now });
    return;
  }

  info.count += 1;
  info.lastAt = now;

  if (info.count >= ATTEMPTS_MAX) {
    info.blockedUntil = now + BLOCK_MS;
  }

  attempts.set(key, info);
}

function registerSuccess(key: string) {
  attempts.delete(key);
}

// ✅ Limpeza periódica (evita crescimento infinito do Map)
setInterval(() => {
  const now = Date.now();
  for (const [k, info] of attempts.entries()) {
    const expired =
      now - info.lastAt > ATTEMPTS_WINDOW_MS && (!info.blockedUntil || info.blockedUntil < now);
    if (expired) attempts.delete(k);
  }
}, 60_000).unref?.();

/**
 * =========================
 * 3) JWT hardening
 * =========================
 */

function assertJwtSecretIsSafe() {
  // seus defaults aparecem como "dev-secret-trocar-depois" também
  const weakDefaults = new Set([
    "dev-secret-change-me",
    "dev-secret-trocar-depois",
  ]);

  if (!JWT_SECRET || weakDefaults.has(JWT_SECRET) || JWT_SECRET.length < 32) {
    throw new Error(
      "JWT_SECRET inseguro/curto. Configure um segredo forte (>= 32 chars) no ambiente."
    );
  }
}

function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  if (!token || token.length < 10) return null;
  return token;
}

/**
 * POST /auth/login
 * Body: { email?: string, login?: string, senha: string }
 */
router.post("/login", async (req: Request, res: Response): Promise<Response> => {
  try {
    assertJwtSecretIsSafe();

    const { email, login, senha } = req.body as {
      email?: string;
      login?: string;
      senha?: string;
    };

    const loginValue = (email || login || "").toString().trim().toLowerCase();
    const senhaValue = (senha || "").toString();

    if (!loginValue || !senhaValue) {
      return res.status(400).json({ error: "Informe e-mail (ou login) e senha." });
    }

    const ip = getClientIp(req);
    const key = attemptKey(ip, loginValue);

    const blocked = isBlocked(key);
    if (blocked.blocked) {
      return res.status(429).json({
        error: "Muitas tentativas. Tente novamente mais tarde.",
        retry_after_seconds: blocked.retryAfterSec,
      });
    }

    const usuario = await usuariosRepo
      .createQueryBuilder("u")
      .where("LOWER(u.email) = :login", { login: loginValue })
      .andWhere("u.ativo = :ativo", { ativo: true })
      .getOne();

    if (!usuario) {
      registerFail(key);
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    const check = verifyPassword(senhaValue, usuario.senhaHash);

    if (!check.ok) {
      registerFail(key);
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    registerSuccess(key);

    // ✅ Upgrade automático de bcrypt/sha256 -> scrypt
    if (check.legacy) {
      try {
        usuario.senhaHash = hashPasswordScrypt(senhaValue);
        await usuariosRepo.save(usuario);
        console.log(`[AUTH] Upgrade de senha para scrypt: usuario=${usuario.id}`);
      } catch (e) {
        console.error("[AUTH] Falha ao atualizar hash legado para scrypt:", e);
      }
    }

    let clienteNome: string | null = null;
    if (usuario.idcliente) {
      try {
        const cliente = await clientesRepo.findOne({ where: { id: usuario.idcliente } });
        if (cliente) clienteNome = cliente.nome;
      } catch (err) {
        console.error("[AUTH] Erro ao carregar cliente no /login:", err);
      }
    }

    const payload = {
      tipo: usuario.perfil,
      idcliente: usuario.idcliente,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      subject: String(usuario.id),
      algorithm: "HS256",
    });

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        login: usuario.email,
        perfil: usuario.perfil,
        idcliente: usuario.idcliente,
        cliente_nome: clienteNome,
      },
    });
  } catch (err) {
    console.error("[AUTH] Erro no /login:", err);
    return res.status(500).json({ error: "Erro interno ao tentar realizar login." });
  }
});

/**
 * GET /auth/me
 */
router.get("/me", async (req: Request, res: Response): Promise<Response> => {
  try {
    assertJwtSecretIsSafe();

    const token = parseBearerToken(req.headers.authorization);
    if (!token) {
      return res.status(401).json({ error: "Token não informado ou mal formatado." });
    }

    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    }) as JwtPayload;

    const sub = decoded?.sub ? String(decoded.sub) : "";
    if (!sub) {
      return res.status(401).json({ error: "Token inválido." });
    }

    const usuario = await usuariosRepo.findOne({ where: { id: sub as any } });
    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: "Usuário não encontrado." });
    }

    let clienteNome: string | null = null;
    if (usuario.idcliente) {
      try {
        const cliente = await clientesRepo.findOne({ where: { id: usuario.idcliente } });
        if (cliente) clienteNome = cliente.nome;
      } catch (err) {
        console.error("[AUTH] Erro ao carregar cliente no /me:", err);
      }
    }

    return res.json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      login: usuario.email,
      perfil: usuario.perfil,
      idcliente: usuario.idcliente,
      cliente_nome: clienteNome,
    });
  } catch (err) {
    console.error("[AUTH] Erro no /me:", err);
    return res.status(401).json({ error: "Token inválido ou expirado." });
  }
});

export default router;
