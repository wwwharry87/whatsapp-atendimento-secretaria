// src/routes/auth.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/auth";
import { AuthRequest } from "../middlewares/authMiddleware";

const router = Router();
const usuariosRepo = AppDataSource.getRepository(Usuario);

/**
 * Hash simples com SHA-256 (sem depender de bcrypt)
 */
function hashPassword(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function checkPassword(raw: string, hash: string): boolean {
  const hashed = hashPassword(raw);
  return hashed === hash;
}

/**
 * POST /auth/login
 * Body: { email?: string, login?: string, senha: string }
 */
router.post(
  "/login",
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const { email, login, senha } = req.body as {
        email?: string;
        login?: string;
        senha?: string;
      };

      const loginValue = (email || login || "").toString().trim().toLowerCase();

      if (!loginValue || !senha) {
        return res
          .status(400)
          .json({ error: "Informe e-mail (ou login) e senha." });
      }

      // Busca usuário por e-mail OU login, sempre em minúsculas
      const usuario = await usuariosRepo
        .createQueryBuilder("u")
        .where("LOWER(u.email) = :login", { login: loginValue })
        .orWhere("LOWER(u.login) = :login", { login: loginValue })
        .andWhere("u.ativo = :ativo", { ativo: true })
        .getOne();

      if (!usuario) {
        return res
          .status(401)
          .json({ error: "Usuário ou senha inválidos." });
      }

      if (!checkPassword(senha, usuario.senhaHash)) {
        return res
          .status(401)
          .json({ error: "Usuário ou senha inválidos." });
      }

      const payload = {
        sub: usuario.id,
        tipo: usuario.perfil,
        idcliente: usuario.idcliente,
      };

      const token = jwt.sign(payload, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
      });

      return res.json({
        token,
        usuario: {
          id: usuario.id,
          nome: usuario.nome,
          email: usuario.email,
          login: usuario.login,
          perfil: usuario.perfil,
          idcliente: usuario.idcliente,
        },
      });
    } catch (err) {
      console.error("[AUTH] Erro no /login:", err);
      return res
        .status(500)
        .json({ error: "Erro interno ao tentar realizar login." });
    }
  }
);

/**
 * GET /auth/me
 * Retorna dados do usuário logado com base no token
 */
router.get(
  "/me",
  async (req: Request, res: Response): Promise<Response> => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).json({ error: "Token não informado." });
      }

      const [, token] = authHeader.split(" ");
      if (!token) {
        return res.status(401).json({ error: "Token mal formatado." });
      }

      const decoded = jwt.verify(token, JWT_SECRET) as {
        sub: string;
        tipo: string;
        idcliente: number;
      };

      const usuario = await usuariosRepo.findOne({
        where: { id: decoded.sub },
      });

      if (!usuario || !usuario.ativo) {
        return res.status(401).json({ error: "Usuário não encontrado." });
      }

      return res.json({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        login: usuario.login,
        perfil: usuario.perfil,
        idcliente: usuario.idcliente,
      });
    } catch (err) {
      console.error("[AUTH] Erro no /me:", err);
      return res
        .status(500)
        .json({ error: "Erro ao carregar dados do usuário." });
    }
  }
);

export default router;
