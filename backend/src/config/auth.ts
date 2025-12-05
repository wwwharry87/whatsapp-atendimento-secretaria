// src/config/auth.ts

export const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-depois";
export const JWT_EXPIRES_IN = "8h";
