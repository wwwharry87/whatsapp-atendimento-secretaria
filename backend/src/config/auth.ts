// src/config/auth.ts

import type { SignOptions } from "jsonwebtoken";

/**
 * Centraliza leitura de envs de autenticação com tipagem correta.
 *
 * Importante: este arquivo NÃO tem relação com a API oficial do WhatsApp.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`${name} não está configurado. Configure no ambiente.`);
  }
  return v;
}

// Assegura que o segredo JWT seja configurado corretamente no ambiente
const rawSecret = requireEnv("JWT_SECRET");
if (rawSecret === "dev-secret-trocar-depois") {
  throw new Error(
    "JWT_SECRET não está configurado corretamente. Configure um segredo forte no ambiente."
  );
}

// ✅ Tipado como string (o jsonwebtoken aceita string como Secret)
export const JWT_SECRET: string = rawSecret;

// ✅ Tipagem compatível com jsonwebtoken@9 (ms.StringValue | number)
export const JWT_EXPIRES_IN: SignOptions["expiresIn"] =
  (process.env.JWT_EXPIRES_IN as SignOptions["expiresIn"]) ?? "8h";
