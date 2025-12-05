// src/routes/usuarios.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";

const router = Router();
const repo = AppDataSource.getRepository(Usuario);

function mapUsuario(u: Usuario) {
  return {
    id: u.id,
    nome: u.nome,
    email: u.email ?? "",
    telefone: (u as any).telefoneWhatsapp ?? "",
    perfil: u.tipo, // "ADMIN" | "GESTOR" | "ATENDENTE"
    ativo: u.ativo,
    criado_em: u.criadoEm.toISOString(),
    atualizado_em: u.atualizadoEm.toISOString()
  };
}

/**
 * GET /usuarios
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const usuarios = await repo.find({
      order: { nome: "ASC" }
    });

    res.json(usuarios.map(mapUsuario));
  } catch (err) {
    console.error("Erro ao listar usuários:", err);
    res.status(500).json({ error: "Erro ao listar usuários" });
  }
});

/**
 * POST /usuarios
 * Cria usuário com senha padrão "123456" (depois podemos trocar isso por envio de link)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { nome, email, telefone, perfil, ativo } = req.body;

    if (!nome || !email || !perfil) {
      return res
        .status(400)
        .json({ error: "nome, email e perfil são obrigatórios." });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const existente = await repo.findOne({
      where: [{ email: emailNormalizado }, { login: emailNormalizado }]
    });
    if (existente) {
      return res
        .status(400)
        .json({ error: "Já existe usuário com este e-mail." });
    }

    const senhaHash = await bcrypt.hash("123456", 10);

    const usuario = repo.create({
      nome,
      email: emailNormalizado,
      login: emailNormalizado,
      telefoneWhatsapp: telefone ?? null,
      tipo: perfil,
      ativo: ativo !== false,
      senhaHash
    });

    await repo.save(usuario);

    res.status(201).json(mapUsuario(usuario));
  } catch (err) {
    console.error("Erro ao criar usuário:", err);
    res.status(500).json({ error: "Erro ao criar usuário" });
  }
});

/**
 * PUT /usuarios/:id
 * Atualiza dados básicos e perfil (não mexe em senha aqui).
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const usuario = await repo.findOne({ where: { id } });

    if (!usuario) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    const { nome, email, telefone, perfil, ativo } = req.body;

    if (email) {
      const emailNormalizado = String(email).trim().toLowerCase();

      // verifica se já existe outro usuário com esse email
      const jaExiste = await repo.findOne({
        where: [
          { email: emailNormalizado },
          { login: emailNormalizado }
        ]
      });

      if (jaExiste && jaExiste.id !== usuario.id) {
        return res
          .status(400)
          .json({ error: "Já existe outro usuário com este e-mail." });
      }

      usuario.email = emailNormalizado;
      usuario.login = emailNormalizado;
    }

    if (nome) usuario.nome = nome;
    if (telefone !== undefined) {
      (usuario as any).telefoneWhatsapp = telefone || null;
    }
    if (perfil) usuario.tipo = perfil;
    if (typeof ativo === "boolean") usuario.ativo = ativo;

    await repo.save(usuario);

    res.json(mapUsuario(usuario));
  } catch (err) {
    console.error("Erro ao atualizar usuário:", err);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
});

export default router;
