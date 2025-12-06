// src/routes/auth.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";

const router = Router();

/**
 * Hash simples com SHA-256 (sem depender de bcrypt)
 */
function hashPassword(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function checkPassword(raw: string, hash: string): boolean {
  return hashPassword(raw) === hash;
}

/**
 * POST /auth/login
 * Body aceita tanto { login, senha } quanto { email, senha }.
 * Vamos autenticar pelo e-mail.
 */
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { login, email, senha } = req.body as {
      login?: string;
      email?: string;
      senha?: string;
    };

    const loginValue = (email || login || "").toString().trim().toLowerCase();

    if (!loginValue || !senha) {
      return res
        .status(400)
        .json({ error: "Informe e-mail (ou login) e senha." });
    }

    const repo = AppDataSource.getRepository(Usuario);

    const usuario = await repo.findOne({
      where: { email: loginValue },
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    if (!usuario.senhaHash) {
      return res.status(401).json({ error: "Usuário sem senha cadastrada." });
    }

    const senhaOk = checkPassword(senha, usuario.senhaHash);
    if (!senhaOk) {
      return res.status(401).json({ error: "Usuário ou senha inválidos." });
    }

    // Token simples (sem JWT) – suficiente pro painel front
    const tokenPayload = {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: (usuario as any).perfil ?? (usuario as any).tipo ?? "ATENDENTE",
      idcliente: (usuario as any).idcliente ?? null,
    };

    const token = Buffer.from(JSON.stringify(tokenPayload)).toString("base64");

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        telefone: usuario.telefone,
        perfil: tokenPayload.perfil,
        // se o frontend ainda usa "tipo", mantemos o alias:
        tipo: tokenPayload.perfil,
        idcliente: tokenPayload.idcliente,
      },
    });
  } catch (err) {
    console.error("[AUTH] Erro no login:", err);
    return res.status(500).json({ error: "Erro ao autenticar." });
  }
});

/**
 * GET /auth/me
 * Opcional: o frontend pode mandar Authorization: Bearer <token-base64>
 * e aqui só decodificamos esse token simples.
 */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const auth = req.headers["authorization"] || "";
    const [, token] = auth.split(" ");

    if (!token) {
      return res.status(401).json({ error: "Não autenticado." });
    }

    let payload: any;
    try {
      const json = Buffer.from(token, "base64").toString("utf-8");
      payload = JSON.parse(json);
    } catch {
      return res.status(401).json({ error: "Token inválido." });
    }

    return res.json({
      id: payload.id,
      nome: payload.nome,
      email: payload.email,
      perfil: payload.perfil,
      tipo: payload.perfil,
      idcliente: payload.idcliente,
    });
  } catch (err) {
    console.error("[AUTH] Erro no /me:", err);
    return res.status(500).json({ error: "Erro ao carregar usuário." });
  }
});

export default router;
