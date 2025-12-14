// src/config/auth.ts

// Assegura que o segredo JWT seja configurado corretamente no ambiente
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === "dev-secret-trocar-depois") {
    throw new Error("JWT_SECRET não está configurado corretamente. Configure um segredo forte no ambiente.");
  }
  
  export const JWT_SECRET = process.env.JWT_SECRET;
  export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "8h"; // Usar o valor do ambiente ou 8h como padrão
  