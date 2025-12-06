// src/routes/usuarios.ts
import { Router, Request, Response } from "express";
import crypto from "crypto";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";

const router = Router();

/**
 * Hash simples de senha com SHA-256
 */
function hashPassword(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/**
 * Helper pra pegar idcliente:
 * - tenta pegar do header X-Id-Cliente
 * - se não tiver, usa DEFAULT_CLIENTE_ID ou 1
 */
function getIdClienteFromRequest(req: Request): number {
  const headerVal = (req.headers["x-id-cliente"] || "").toString();
  if (headerVal && !Number.isNaN(Number(headerVal))) {
    return Number(headerVal);
  }
  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !Number.isNaN(Number(envVal))) {
    return Number(envVal);
  }
  return 1; // fallback
}

/**
 * GET /usuarios
 * Lista usuários do cliente.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);

    const repo = AppDataSource.getRepository(Usuario);
    const usuarios = await repo.find({
      where: { idcliente },
      order: { nome: "ASC" },
    });

    return res.json(
      usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        telefone: u.telefone,
        perfil: (u as any).perfil ?? "ATENDENTE",
        // alias pra não quebrar nada legado que ainda use "tipo"
        tipo: (u as any).perfil ?? "ATENDENTE",
        ativo: u.ativo,
        idcliente: (u as any).idcliente ?? idcliente,
      }))
    );
  } catch (err) {
    console.error("[USUARIOS] Erro ao listar:", err);
    return res
      .status(500)
      .json({ error: "Erro ao listar usuários. Verifique o servidor." });
  }
});

/**
 * POST /usuarios
 * Cria um novo usuário para o cliente.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);

    const { nome, email, telefone, perfil, senha } = req.body as {
      nome: string;
      email: string;
      telefone?: string;
      perfil?: string;
      senha?: string;
    };

    if (!nome || !email) {
      return res
        .status(400)
        .json({ error: "Nome e e-mail são obrigatórios." });
    }

    const repo = AppDataSource.getRepository(Usuario);

    const emailLower = email.toLowerCase();

    const existente = await repo.findOne({
      where: { email: emailLower, idcliente },
    });

    if (existente) {
      return res
        .status(400)
        .json({ error: "Já existe um usuário com este e-mail." });
    }

    // 🔒 força via unknown pra evitar o erro TS2352
    const usuario = repo.create({
      idcliente,
      nome,
      email: emailLower,
      telefone: telefone || null,
      perfil: (perfil as any) || "ATENDENTE",
      senhaHash: senha ? hashPassword(senha) : null,
      ativo: true,
    } as any) as unknown as Usuario;

    await repo.save(usuario);

    return res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      perfil: (usuario as any).perfil ?? "ATENDENTE",
      tipo: (usuario as any).perfil ?? "ATENDENTE",
      ativo: usuario.ativo,
      idcliente: (usuario as any).idcliente ?? idcliente,
    });
  } catch (err) {
    console.error("[USUARIOS] Erro ao criar:", err);
    return res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

/**
 * PUT /usuarios/:id
 * Atualiza dados básicos (nome, email, telefone, perfil, senha, ativo).
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const { id } = req.params;

    const { nome, email, telefone, perfil, senha, ativo } = req.body as {
      nome?: string;
      email?: string;
      telefone?: string;
      perfil?: string;
      senha?: string;
      ativo?: boolean;
    };

    const repo = AppDataSource.getRepository(Usuario);

    const encontrado = (await repo.findOne({
      where: { id, idcliente },
    })) as Usuario | null;

    if (!encontrado) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const usuario: Usuario = encontrado;

    if (nome) usuario.nome = nome;
    if (email) usuario.email = email.toLowerCase();
    if (telefone !== undefined) usuario.telefone = telefone || null;
    if (perfil) {
      (usuario as any).perfil = perfil;
    }
    if (typeof ativo === "boolean") {
      usuario.ativo = ativo;
    }
    if (senha) {
      usuario.senhaHash = hashPassword(senha);
    }

    await repo.save(usuario);

    return res.json({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      telefone: usuario.telefone,
      perfil: (usuario as any).perfil ?? "ATENDENTE",
      tipo: (usuario as any).perfil ?? "ATENDENTE",
      ativo: usuario.ativo,
      idcliente: (usuario as any).idcliente ?? idcliente,
    });
  } catch (err) {
    console.error("[USUARIOS] Erro ao atualizar:", err);
    return res.status(500).json({ error: "Erro ao atualizar usuário." });
  }
});

/**
 * DELETE /usuarios/:id
 * Em vez de apagar, marca como inativo.
 */
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const { id } = req.params;

    const repo = AppDataSource.getRepository(Usuario);
    const encontrado = (await repo.findOne({
      where: { id, idcliente },
    })) as Usuario | null;

    if (!encontrado) {
      return res.status(404).json({ error: "Usuário não encontrado." });
    }

    const usuario: Usuario = encontrado;
    usuario.ativo = false;
    await repo.save(usuario);

    return res.status(204).send();
  } catch (err) {
    console.error("[USUARIOS] Erro ao inativar:", err);
    return res.status(500).json({ error: "Erro ao inativar usuário." });
  }
});

export default router;
