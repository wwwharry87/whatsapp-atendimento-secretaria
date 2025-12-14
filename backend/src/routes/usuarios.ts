// src/routes/usuarios.ts
import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { AppDataSource } from "../database/data-source";
import { Usuario, PerfilUsuario } from "../entities/Usuario";
import { UsuarioDepartamento } from "../entities/UsuarioDepartamento";
import { Departamento } from "../entities/Departamento";
import { AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

/**
 * 🔒 Multi-tenant: SEMPRE do token.
 * (Não usamos header/query/body/env/default para tenant em rotas autenticadas)
 */
function getTenant(req: Request): number {
  const r = req as AuthRequest;
  const idcliente = r.user?.idcliente ?? r.idcliente;

  if (typeof idcliente !== "number" || Number.isNaN(idcliente) || idcliente <= 0) {
    throw new Error("TENANT_MISSING");
  }
  return idcliente;
}

/**
 * 🔒 Autorização simples.
 * Ajuste os perfis conforme seu enum real.
 * - ADMIN: pode gerenciar usuários
 * - ATENDENTE: apenas listar (se você quiser)
 */
function ensureAdmin(req: Request) {
  const r = req as AuthRequest;
  const tipo = (r.user?.tipo ?? r.userTipo ?? "").toUpperCase();

  // Ajuste se seus perfis forem outros
  const allowed = ["ADMIN", "GESTOR", "SUPERVISOR"];
  if (!allowed.includes(tipo)) {
    const err = new Error("FORBIDDEN");
    (err as any).code = "FORBIDDEN";
    throw err;
  }
}

// ====== Helpers gerais ======

function normalizarTelefone(telefone?: string | null): string | null {
  if (!telefone) return null;
  const limpo = telefone.replace(/\D/g, "");
  return limpo || null;
}

function validarEmail(email?: string | null): boolean {
  if (!email) return true;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email.trim());
}

function gerarSenhaTemporaria(): string {
  // 10 chars base36 (boa e simples pro WhatsApp)
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

async function validarDepartamentosDoCliente(idcliente: number, departamentosIds: number[]) {
  if (!departamentosIds.length) return;

  const repoDep = AppDataSource.getRepository(Departamento);

  const deps = await repoDep
    .createQueryBuilder("d")
    .select(["d.id"])
    .where("d.idcliente = :idcliente", { idcliente })
    .andWhere("d.id IN (:...ids)", { ids: departamentosIds })
    .getMany();

  if (deps.length !== departamentosIds.length) {
    throw new Error("DEPARTAMENTO_INVALIDO");
  }
}

async function emailJaExisteNoCliente(params: {
  idcliente: number;
  email: string;
  ignoreUserId?: string;
}) {
  const repo = AppDataSource.getRepository(Usuario);

  const qb = repo
    .createQueryBuilder("u")
    .select(["u.id"])
    .where("u.idcliente = :idcliente", { idcliente: params.idcliente })
    .andWhere("LOWER(u.email) = :email", { email: params.email.toLowerCase() });

  if (params.ignoreUserId) {
    qb.andWhere("u.id <> :id", { id: params.ignoreUserId });
  }

  const found = await qb.getOne();
  return !!found;
}

type UsuarioCreateBody = {
  nome: string;
  telefone?: string;
  email?: string;
  senha?: string;
  perfil?: PerfilUsuario;
  ativo?: boolean;
  departamentosIds?: number[];
};

type UsuarioUpdateBody = {
  nome?: string;
  telefone?: string;
  email?: string;
  senha?: string;
  perfil?: PerfilUsuario;
  ativo?: boolean;
  departamentosIds?: number[];
};

// ====== LISTAR ======
// (se quiser restringir a ADMIN também, é só descomentar ensureAdmin)
router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getTenant(req);
    const repo = AppDataSource.getRepository(Usuario);

    const usuarios = await repo.find({
      where: { idcliente: idcliente as any },
      order: { criadoEm: "ASC" as any },
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
  } catch (err: any) {
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ message: "Token inválido (idcliente ausente)." });
    }
    console.error("[USUARIOS] Erro ao listar:", err);
    return res.status(500).json({ message: "Erro ao listar usuários." });
  }
});

// ====== CRIAR ======
router.post("/", async (req: Request, res: Response) => {
  try {
    ensureAdmin(req);

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
      return res.status(400).json({ message: "Nome do usuário deve ter pelo menos 3 caracteres." });
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({ message: "E-mail inválido." });
    }

    const idcliente = getTenant(req);
    const repo = AppDataSource.getRepository(Usuario);
    const udRepo = AppDataSource.getRepository(UsuarioDepartamento);

    const emailNorm = email ? email.trim().toLowerCase() : null;

    if (emailNorm) {
      const exists = await emailJaExisteNoCliente({ idcliente, email: emailNorm });
      if (exists) {
        return res.status(409).json({ message: "Já existe um usuário com esse e-mail neste município." });
      }
    }

    // ✅ senha temporária segura (não fixa 123456)
    const senhaEmTexto = (senha && senha.trim()) ? senha.trim() : gerarSenhaTemporaria();
    const senhaHash = await bcrypt.hash(senhaEmTexto, 10);

    const usuario = repo.create({
      nome: nome.trim().toUpperCase(),
      telefone: normalizarTelefone(telefone),
      email: emailNorm,
      senhaHash,
      perfil: (perfil ?? "ATENDENTE") as PerfilUsuario,
      ativo: ativo !== false,
      idcliente,
    });

    await repo.save(usuario);

    // Departamentos: valida se pertencem ao mesmo idcliente
    const depsIds = Array.isArray(departamentosIds)
      ? departamentosIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0)
      : [];

    if (depsIds.length > 0) {
      await validarDepartamentosDoCliente(idcliente, depsIds);

      const vinculos = depsIds.map((depId) =>
        udRepo.create({
          usuarioId: usuario.id,
          departamentoId: depId,
          idcliente,
          principal: false,
        })
      );
      await udRepo.save(vinculos);
    }

    return res.status(201).json({
      id: usuario.id,
      nome: usuario.nome,
      telefone: usuario.telefone,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      idcliente: usuario.idcliente,
      // retorna apenas se foi gerada automaticamente (pra você mostrar UMA vez no painel)
      senhaTemporaria: senha ? undefined : senhaEmTexto,
    });
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ message: "Sem permissão para gerenciar usuários." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ message: "Token inválido (idcliente ausente)." });
    }
    if (err?.message === "DEPARTAMENTO_INVALIDO") {
      return res.status(400).json({ message: "Um ou mais departamentos são inválidos para este município." });
    }
    console.error("[USUARIOS] Erro ao criar:", err);
    return res.status(500).json({ message: "Erro ao criar usuário." });
  }
});

// ====== ATUALIZAR ======
router.put("/:id", async (req: Request, res: Response) => {
  try {
    ensureAdmin(req);

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

    const idcliente = getTenant(req);
    const repo = AppDataSource.getRepository(Usuario);
    const udRepo = AppDataSource.getRepository(UsuarioDepartamento);

    const usuario = await repo.findOne({
      where: { id, idcliente: idcliente as any },
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    if (nome && nome.trim().length < 3) {
      return res.status(400).json({ message: "Nome do usuário deve ter pelo menos 3 caracteres." });
    }

    if (email && !validarEmail(email)) {
      return res.status(400).json({ message: "E-mail inválido." });
    }

    if (nome) usuario.nome = nome.trim().toUpperCase();

    if (telefone !== undefined) {
      usuario.telefone = normalizarTelefone(telefone);
    }

    if (email !== undefined) {
      const emailNorm = email ? email.trim().toLowerCase() : null;

      if (emailNorm) {
        const exists = await emailJaExisteNoCliente({ idcliente, email: emailNorm, ignoreUserId: usuario.id });
        if (exists) {
          return res.status(409).json({ message: "Já existe um usuário com esse e-mail neste município." });
        }
      }

      usuario.email = emailNorm;
    }

    if (perfil) usuario.perfil = perfil;
    if (typeof ativo === "boolean") usuario.ativo = ativo;

    if (senha && senha.trim()) {
      usuario.senhaHash = await bcrypt.hash(senha.trim(), 10);
    }

    await repo.save(usuario);

    // Atualiza vínculos
    if (Array.isArray(departamentosIds)) {
      const depsIds = departamentosIds.map((x) => Number(x)).filter((x) => Number.isFinite(x) && x > 0);

      await udRepo.delete({ usuarioId: usuario.id, idcliente: idcliente as any });

      if (depsIds.length > 0) {
        await validarDepartamentosDoCliente(idcliente, depsIds);

        const novos = depsIds.map((depId) =>
          udRepo.create({
            usuarioId: usuario.id,
            departamentoId: depId,
            idcliente,
            principal: false,
          })
        );
        await udRepo.save(novos);
      }
    }

    return res.json({
      id: usuario.id,
      nome: usuario.nome,
      telefone: usuario.telefone,
      email: usuario.email,
      perfil: usuario.perfil,
      ativo: usuario.ativo,
      idcliente: usuario.idcliente,
    });
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ message: "Sem permissão para gerenciar usuários." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ message: "Token inválido (idcliente ausente)." });
    }
    if (err?.message === "DEPARTAMENTO_INVALIDO") {
      return res.status(400).json({ message: "Um ou mais departamentos são inválidos para este município." });
    }
    console.error("[USUARIOS] Erro ao atualizar:", err);
    return res.status(500).json({ message: "Erro ao atualizar usuário." });
  }
});

// ====== STATUS ======
router.patch("/:id/status", async (req: Request, res: Response) => {
  try {
    ensureAdmin(req);

    const { id } = req.params;
    const { ativo } = req.body as { ativo: boolean };

    const idcliente = getTenant(req);
    const repo = AppDataSource.getRepository(Usuario);

    const usuario = await repo.findOne({
      where: { id, idcliente: idcliente as any },
    });

    if (!usuario) {
      return res.status(404).json({ message: "Usuário não encontrado." });
    }

    usuario.ativo = !!ativo;
    await repo.save(usuario);

    return res.json({ id: usuario.id, ativo: usuario.ativo });
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ message: "Sem permissão para gerenciar usuários." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ message: "Token inválido (idcliente ausente)." });
    }
    console.error("[USUARIOS] Erro ao alterar status:", err);
    return res.status(500).json({ message: "Erro ao alterar status." });
  }
});

export default router;
