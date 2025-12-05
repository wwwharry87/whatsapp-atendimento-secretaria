// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";
import { JWT_SECRET, JWT_EXPIRES_IN } from "../config/auth";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();
const usuarioRepo = AppDataSource.getRepository(Usuario);

// POST /api/auth/primeiro-usuario
// Cria o primeiro usuário ADMIN, somente se ainda não existir nenhum usuário
router.post("/primeiro-usuario", async (req, res) => {
  try {
    const total = await usuarioRepo.count();
    if (total > 0) {
      return res.status(400).json({
        error:
          "Já existe usuário na base. Esta rota só pode ser usada para o primeiro acesso.",
      });
    }

    const { nome, login, senha } = req.body;

    if (!nome || !login || !senha) {
      return res
        .status(400)
        .json({ error: "nome, login e senha são obrigatórios" });
    }

    const existente = await usuarioRepo.findOne({ where: { login } });
    if (existente) {
      return res.status(400).json({ error: "Login já está em uso" });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const usuario = usuarioRepo.create({
      nome,
      login,
      senhaHash,
      tipo: "ADMIN",
      ativo: true,
      email: null,
      telefoneWhatsapp: null,
    });

    await usuarioRepo.save(usuario);

    return res.status(201).json({
      message: "Usuário ADMIN criado com sucesso",
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        login: usuario.login,
        tipo: usuario.tipo,
        ativo: usuario.ativo,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao criar primeiro usuário" });
  }
});

// POST /api/auth/login
router.post("/login", async (req, res) => {
  try {
    const { login, senha } = req.body;

    if (!login || !senha) {
      return res
        .status(400)
        .json({ error: "login e senha são obrigatórios" });
    }

    const usuario = await usuarioRepo.findOne({
      where: { login },
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    const senhaCorreta = await bcrypt.compare(senha, usuario.senhaHash);
    if (!senhaCorreta) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    const token = jwt.sign(
      {
        tipo: usuario.tipo,
      },
      JWT_SECRET,
      {
        subject: usuario.id,
        expiresIn: JWT_EXPIRES_IN,
      }
    );

    return res.json({
      token,
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        login: usuario.login,
        tipo: usuario.tipo,
        ativo: usuario.ativo,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao efetuar login" });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userId = (req as any).userId as string;

    const usuario = await usuarioRepo.findOne({
      where: { id: userId },
    });

    if (!usuario) {
      return res.status(404).json({ error: "Usuário não encontrado" });
    }

    return res.json({
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      tipo: usuario.tipo,
      ativo: usuario.ativo,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erro ao buscar usuário atual" });
  }
});

export default router;
