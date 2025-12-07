// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/auth";

type JwtPayload = {
  sub: string; // usuário id
  tipo: string; // perfil
  idcliente: number;
};

export interface AuthRequest extends Request {
  userId?: string;
  userTipo?: string;
  idcliente?: number;
}

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ error: "Token não informado" });
  }

  const [, token] = authHeader.split(" ");

  if (!token) {
    return res.status(401).json({ error: "Token mal formatado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    (req as AuthRequest).userId = decoded.sub;
    (req as AuthRequest).userTipo = decoded.tipo;
    (req as AuthRequest).idcliente = decoded.idcliente;

    return next();
  } catch (err) {
    console.error("[AUTH] Erro ao validar token:", err);
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}
