// src/routes/usuarios.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { AppDataSource } from "../database/data-source";
import { Usuario, PerfilUsuario } from "../entities/Usuario";
import { Cliente } from "../entities/Cliente";
import { UsuarioDepartamento } from "../entities/UsuarioDepartamento";
import { AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

// ====== Helpers de cliente ======
let defaultClienteIdCache: number | null = null;

/**
 * Usado apenas como fallback (quando não vier idcliente no token),
 * por exemplo em um cenário legado ou usuário "global" de configuração.
 */
async function getDefaultClienteId(): Promise<number> {
  if (defaultClienteIdCache !== null) return defaultClienteIdCache;

  const repo = AppDataSource.getRepository(Cliente);
  let cliente: Cliente | null = null;

  try {
    cliente = await repo.findOne({
      where: { ativo: true as any },
      order: { id: "ASC" as any },
    });
  } catch (err) {
    console.log(
      "[USUARIOS] Erro ao buscar cliente ativo (talvez coluna não exista ainda).",
      err
    );
  }

  if (!cliente) {
    cliente = await repo.findOne({
      order: { id: "ASC" as any },
    });
  }

  if (!cliente) {
    throw new Error(
      "Nenhum cliente encontrado na tabela 'clientes'. Cadastre pelo menos um registro."
    );
  }

  defaultClienteIdCache = cliente.id;
  return defaultClienteIdCache;
}

/**
 * Sempre que possível, usa o idcliente do token (authMiddleware).
 * Só cai no default (primeiro cliente) se não tiver nada no token.
 */
async function getIdClienteFromRequest(req: Request): Promise<number> {
  const authReq = req as AuthRequest;

  if (authReq.idcliente && !Number.isNaN(Number(authReq.idcliente))) {
    return Number(authReq.idcliente);
  }

  // fallback legado
  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !Number.isNaN(Number(envVal))) {
    return Number(envVal);
  }

  return getDefaultClienteId();
}

// ====== Helpers gerais ======

function normalizarTelefone(telefone?: string | null): string | null {
  if (!telefone) return null;
  const limpo = telefone.replace(/\D/g, "");
  return limpo || null;
}

function validarEmail(email?: string | null): boolean {
  if (!email) return true; // se não informar, não travamos aqui
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

type UsuarioCreateBody = {
  nome: string;
  telefone?: string;
  email?: string;
  senha?: string; // opcional na tela
  perfil?: PerfilUsuario;
  ativo?: boolean;
  departamentosIds?: number[]; // vínculos com setores
};

type UsuarioUpdateBody = {
  nome?: string;
  telefone?: string;
  email?: string;
  senha?: string; // se enviado, troca a senha
  perfil?: PerfilUsuario;
  ativo?: boolean;
  departamentosIds?: number[];
};

// ====== LISTAR USUÁRIOS ======

router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = await getIdClienteFromRequest(req);
    const repo = AppDataSource.getRepository(Usuario);

    const usuarios = await repo.find({
      where: { idcliente: idcliente as any },
      order: { criadoEm: "ASC" as any },
      relations: ["cliente"],
    });

    return res.json(
      usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        telefone: u.telefone,
        email: u.email,
        perfil: u.perfil,
        ativo: u.ativo,
        idcliente: u.idcliente,
        criadoEm: u.criadoEm,
        atualizadoEm: u.atualizadoEm,
      }))
    );
  } catch (err) {
    console.error("[USUARIOS] Erro ao listar:", err);
    return res.status(500).json({ message: "Erro ao listar usuários." });
  }
});

// ====== CRIAR USUÁRIO ======

router.post("/", async (req: Request, res: Response) => {
  try {
    const {
      nome,
      telefone,
      email,
      senha,
      perfil,
      ativo,
      departamentosIds,
    } = req.body as UsuarioCreateBody;

    if (!nome || nome.trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Nome do usuário deve ter pelo menos 3 caracteres." });
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({ message: "E-mail inválido." });
    }

    const idcliente = await getIdClienteFromRequest(req);
    const repo = AppDataSource.getRepository(Usuario);
    const udRepo = AppDataSource.getRepository(UsuarioDepartamento);

    // Se não informar senha pela tela, usamos uma senha padrão temporária
    const senhaEmTexto =
      (senha && senha.trim()) || "123456"; // <<< senha padrão TEMPORÁRIA
    const senhaHash = await bcrypt.hash(senhaEmTexto, 10);

    const usuario = repo.create({
      nome: nome.trim().toUpperCase(),
      telefone: normalizarTelefone(telefone),
      email: email ? email.trim().toLowerCase() : null,
      senhaHash,
      perfil: (perfil ?? "ATENDENTE") as PerfilUsuario,
      ativo: ativo !== false, // default true
      idcliente,
    });

    await repo.save(usuario);

    // Vincular aos departamentos, se foi enviado
    if (Array.isArray(departamentosIds) && departamentosIds.length > 0) {
      const vinculos: UsuarioDepartamento[] = departamentosIds.map((depId) =>
        udRepo.create({
          usuarioId: usuario.id,
          departamentoId: depId,
          idcliente,
          principal: false,
        })
      );

      await udRepo.save(vinculos);
    }

    console.log(
      "[USUARIOS] Usuário criado com sucesso:",
      usuario.id,
      "idcliente=",
      idcliente
    );

    return res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      telefone: usuario.telefone,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      idcliente: usuario.idcliente,
      senhaTemporaria: senha ? undefined : senhaEmTexto,
    });
  } catch (err) {
    console.error("[USUARIOS] Erro ao criar:", err);
    return res.status(500).json({ message: "Erro ao criar usuário." });
  }
});

// ====== ATUALIZAR USUÁRIO ======

router.put("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      nome,
      telefone,
      email,
      senha,
      perfil,
      ativo,
      departamentosIds,
    } = req.body as UsuarioUpdateBody;

    const idcliente = await getIdClienteFromRequest(req);
    const repo = AppDataSource.getRepository(Usuario);
    const udRepo = AppDataSource.getRepository(UsuarioDepartamento);

    // Garante que o usuário seja do MESMO cliente
    const usuario = await repo.findOne({
      where: { id, idcliente: idcliente as any },
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    if (nome && nome.trim().length < 3) {
      return res
        .status(400)
        .json({ message: "Nome do usuário deve ter pelo menos 3 caracteres." });
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({ message: "E-mail inválido." });
    }

    if (nome) usuario.nome = nome.trim().toUpperCase();
    if (telefone !== undefined) {
      usuario.telefone = normalizarTelefone(telefone) ?? "";
    }
    if (email !== undefined) {
      usuario.email = email ? email.trim().toLowerCase() : null;
    }
    if (perfil) {
      usuario.perfil = perfil;
    }
    if (typeof ativo === "boolean") {
      usuario.ativo = ativo;
    }

    if (senha && senha.trim()) {
      const novaHash = await bcrypt.hash(senha.trim(), 10);
      usuario.senhaHash = novaHash;
    }

    await repo.save(usuario);

    // Atualizar vínculos com departamentos, se veio no corpo
    if (Array.isArray(departamentosIds)) {
      // apaga vínculos antigos deste usuário para ESTE cliente
      await udRepo.delete({
        usuarioId: usuario.id,
        idcliente: idcliente as any,
      });

      if (departamentosIds.length > 0) {
        const novosVinculos: UsuarioDepartamento[] = departamentosIds.map(
          (depId) =>
            udRepo.create({
              usuarioId: usuario.id,
              departamentoId: depId,
              idcliente,
              principal: false,
            })
        );
        await udRepo.save(novosVinculos);
      }
    }

    console.log(
      "[USUARIOS] Usuário atualizado:",
      usuario.id,
      "idcliente=",
      idcliente
    );

    return res.json({
      id: usuario.id,
      nome: usuario.nome,
      telefone: usuario.telefone,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      idcliente: usuario.idcliente,
    });
  } catch (err) {
    console.error("[USUARIOS] Erro ao atualizar:", err);
    return res.status(500).json({ message: "Erro ao atualizar usuário." });
  }
});

// ====== DESATIVAR / REATIVAR RÁPIDO ======

router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { ativo } = req.body as { ativo: boolean };

    const idcliente = await getIdClienteFromRequest(req);
    const repo = AppDataSource.getRepository(Usuario);

    const usuario = await repo.findOne({
      where: { id, idcliente: idcliente as any },
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    usuario.ativo = ativo;
    await repo.save(usuario);

    return res.json({
      id: usuario.id,
      ativo: usuario.ativo,
    });
  } catch (err) {
    console.error("[USUARIOS] Erro ao alterar status:", err);
    return res.status(500).json({ message: "Erro ao alterar status." });
  }
});

export default router;
