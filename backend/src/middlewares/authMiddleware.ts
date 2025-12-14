// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/auth";

type JwtPayload = {
  sub: string;        // user id
  tipo: string;       // perfil
  idcliente: number;  // tenant
  exp?: number;
  iat?: number;
};

export interface AuthRequest extends Request {
  userId: string;
  userTipo: string;
  idcliente: number;
  user?: {
    id: string;
    tipo: string;
    idcliente: number;
  };
}

function parseBearerToken(authHeader?: string): string | null {
  if (!authHeader) return null;
  const [scheme, token] = authHeader.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer") return null;
  if (!token || token.length < 10) return null;
  return token;
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = parseBearerToken(req.headers.authorization);

  if (!token) {
    return res.status(401).json({ error: "Token não informado ou mal formatado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // ✅ valida claims essenciais (multi-tenant seguro)
    const userId = decoded?.sub;
    const userTipo = decoded?.tipo;
    const idcliente = decoded?.idcliente;

    if (!userId || typeof userId !== "string") {
      return res.status(401).json({ error: "Token inválido (sub ausente)" });
    }
    if (!userTipo || typeof userTipo !== "string") {
      return res.status(401).json({ error: "Token inválido (tipo ausente)" });
    }
    if (typeof idcliente !== "number" || Number.isNaN(idcliente) || idcliente <= 0) {
      // 🔒 importante: SEM idcliente válido, não deixa seguir
      return res.status(401).json({ error: "Token inválido (idcliente ausente)" });
    }

    const r = req as AuthRequest;

    r.userId = userId;
    r.userTipo = userTipo;
    r.idcliente = idcliente;

    // ✅ padrão único para rotas: req.user.*
    r.user = { id: userId, tipo: userTipo, idcliente };

    return next();
  } catch (err) {
    console.error("[AUTH] Erro ao validar token:", err);
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}
