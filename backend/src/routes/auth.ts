// src/routes/auth.ts
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { AppDataSource } from "../database/data-source";
import { Usuario } from "../entities/Usuario";

const router = Router();
const usuarioRepo = AppDataSource.getRepository(Usuario);

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-trocar-depois";
const JWT_EXPIRES_IN = "8h";

/**
 * POST /api/auth/primeiro-usuario
 * Cria o primeiro usuário ADMIN.
 * A partir de agora o login É o e-mail.
 */
router.post("/primeiro-usuario", async (req, res) => {
  try {
    const total = await usuarioRepo.count();
    if (total > 0) {
      return res.status(400).json({
        error:
          "Já existe usuário na base. Esta rota só pode ser usada para o primeiro acesso.",
      });
    }

    const { nome, email, senha } = req.body;

    if (!nome || !email || !senha) {
      return res
        .status(400)
        .json({ error: "nome, email e senha são obrigatórios" });
    }

    const emailNormalizado = String(email).trim().toLowerCase();

    const existente = await usuarioRepo.findOne({
      where: [{ email: emailNormalizado }, { login: emailNormalizado }],
    });
    if (existente) {
      return res.status(400).json({ error: "E-mail já está em uso" });
    }

    const senhaHash = await bcrypt.hash(senha, 10);

    const usuario = usuarioRepo.create({
      nome,
      email: emailNormalizado,
      login: emailNormalizado, // 👈 login = email por padrão
      senhaHash,
      tipo: "ADMIN",
      ativo: true,
      telefoneWhatsapp: null,
    });

    await usuarioRepo.save(usuario);

    return res.status(201).json({
      message: "Usuário ADMIN criado com sucesso",
      usuario: {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
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

/**
 * POST /api/auth/login
 * Login sempre por e-mail, mas aceita compatibilidade:
 * - email + senha/password
 * - login/username + senha/password (buscando por email OU login)
 */
router.post("/login", async (req, res) => {
  try {
    const {
      email,
      login,
      username,
      senha,
      password,
    }: {
      email?: string;
      login?: string;
      username?: string;
      senha?: string;
      password?: string;
    } = req.body;

    const identificadorBruto = email || login || username;
    const senhaPura = password || senha;

    if (!identificadorBruto || !senhaPura) {
      return res.status(400).json({
        error:
          "Envie email (ou login) e senha. Campos aceitos: email/login/username e senha/password.",
      });
    }

    const identificador = String(identificadorBruto).trim().toLowerCase();

    // 👉 prioridade é buscar por email, mas mantemos login como fallback
    const usuario = await usuarioRepo.findOne({
      where: [{ email: identificador }, { login: identificador }],
    });

    if (!usuario || !usuario.ativo) {
      return res.status(401).json({ error: "Usuário ou senha inválidos" });
    }

    const senhaCorreta = await bcrypt.compare(senhaPura, usuario.senhaHash);
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
        email: usuario.email,
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

export default router;
