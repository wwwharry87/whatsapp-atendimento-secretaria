// src/routes/auth.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";
import { Cliente } from "../entities/Cliente";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/auth";

const router = Router();
const usuariosRepo = AppDataSource.getRepository(Usuario);
const clientesRepo = AppDataSource.getRepository(Cliente);

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
 *
 * No banco atual estamos usando APENAS o email para autenticar.
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

      // Por enquanto vamos considerar que o usuário digita o e-mail.
      const loginValue = (email || login || "").toString().trim().toLowerCase();

      if (!loginValue || !senha) {
        return res
          .status(400)
          .json({ error: "Informe e-mail e senha." });
      }

      // Busca usuário APENAS pelo e-mail (coluna que existe no banco)
      const usuario = await usuariosRepo
        .createQueryBuilder("u")
        .where("LOWER(u.email) = :login", { login: loginValue })
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

      // Busca o nome do cliente vinculado (tabela clientes)
      let clienteNome: string | null = null;
      try {
        if (usuario.idcliente) {
          const cliente = await clientesRepo.findOne({
            where: { id: usuario.idcliente },
          });
          if (cliente) {
            clienteNome = cliente.nome;
          }
        }
      } catch (err) {
        console.error("[AUTH] Erro ao carregar cliente no /login:", err);
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
          // Por enquanto, "login" na resposta é só um alias pro email
          login: usuario.email,
          perfil: usuario.perfil,
          idcliente: usuario.idcliente,
          // novo campo para o frontend exibir o nome do cliente
          cliente_nome: clienteNome,
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

      // Busca o nome do cliente também no /me para manter consistência
      let clienteNome: string | null = null;
      try {
        if (usuario.idcliente) {
          const cliente = await clientesRepo.findOne({
            where: { id: usuario.idcliente },
          });
          if (cliente) {
            clienteNome = cliente.nome;
          }
        }
      } catch (err) {
        console.error("[AUTH] Erro ao carregar cliente no /me:", err);
      }

      return res.json({
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        // Mesmo esquema: login só como alias pro email neste momento
        login: usuario.email,
        perfil: usuario.perfil,
        idcliente: usuario.idcliente,
        cliente_nome: clienteNome,
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
