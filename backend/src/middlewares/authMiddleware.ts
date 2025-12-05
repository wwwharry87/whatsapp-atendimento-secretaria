// src/middlewares/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config/auth";

type JwtPayload = {
  sub: string; // user id
  tipo: string;
};

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

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    // guarda no request para uso nas rotas
    (req as any).userId = decoded.sub;
    (req as any).userTipo = decoded.tipo;

    return next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}
