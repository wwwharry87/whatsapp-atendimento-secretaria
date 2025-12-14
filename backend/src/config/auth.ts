// src/config/auth.ts

/**
 * Configurações de autenticação (JWT)
 *
 * Importante:
 * - Em produção, JWT_SECRET DEVE ser forte (>= 32 chars) e não pode ser o valor de desenvolvimento.
 * - Este arquivo garante que o TypeScript enxergue JWT_SECRET como string (não undefined).
 */

const secretFromEnv = process.env.JWT_SECRET;

// Assegura que o segredo JWT seja configurado corretamente no ambiente
if (!secretFromEnv || secretFromEnv === "dev-secret-trocar-depois") {
  throw new Error(
    "JWT_SECRET não está configurado corretamente. Configure um segredo forte no ambiente."
  );
}

export const JWT_SECRET: string = secretFromEnv;

// Padrão 8h (pode ser sobrescrito por env). Mantém type compatível com jsonwebtoken.
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || "8h";
