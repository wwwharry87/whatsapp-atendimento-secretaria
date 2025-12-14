// src/routes/departamentos.ts
import { Router, Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";
import { UsuarioDepartamento } from "../entities/UsuarioDepartamento";
import { Usuario } from "../entities/Usuario";
import { AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

const depRepo = AppDataSource.getRepository(Departamento);
const udRepo = AppDataSource.getRepository(UsuarioDepartamento);
const usuarioRepo = AppDataSource.getRepository(Usuario);

function getTenant(req: Request): number {
  const r = req as AuthRequest;
  const idcliente = r.user?.idcliente ?? r.idcliente;
  if (typeof idcliente !== "number" || Number.isNaN(idcliente) || idcliente <= 0) {
    throw new Error("TENANT_MISSING");
  }
  return idcliente;
}

function ensureAdmin(req: Request) {
  const r = req as AuthRequest;
  const tipo = (r.user?.tipo ?? r.userTipo ?? "").toUpperCase();
  const allowed = ["ADMIN", "GESTOR", "SUPERVISOR"];
  if (!allowed.includes(tipo)) {
    const err = new Error("FORBIDDEN");
    (err as any).code = "FORBIDDEN";
    throw err;
  }
}

function normalizePhone(num?: string | null): string | null {
  if (!num) return null;
  const n = num.replace(/\D/g, "");
  return n || null;
}

function mapDepartamento(d: Departamento) {
  return {
    id: d.id,
    nome: d.nome,
    responsavel_nome: d.responsavelNome ?? "",
    responsavel_numero: d.responsavelNumero ?? "",
    criado_em: (d as any).criadoEm?.toISOString?.() ?? null,
    atualizado_em: (d as any).atualizadoEm?.toISOString?.() ?? null,
  };
}

/**
 * GET /departamentos
 * Lista departamentos do município do token
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getTenant(req);

    const departamentos = await depRepo.find({
      where: { idcliente: idcliente as any },
      order: { nome: "ASC" as any },
    });

    return res.json(departamentos.map(mapDepartamento));
  } catch (err: any) {
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }
    console.error("[DEPARTAMENTOS] Erro ao listar:", err);
    return res.status(500).json({ error: "Erro ao listar departamentos" });
  }
});

/**
 * POST /departamentos
 * Cria departamento (somente ADMIN/GESTOR/SUPERVISOR)
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    ensureAdmin(req);

    const idcliente = getTenant(req);
    const { nome, responsavel_nome, responsavel_numero } = req.body as any;

    if (!nome || String(nome).trim().length < 2) {
      return res.status(400).json({ error: "O campo nome é obrigatório." });
    }

    const departamento = depRepo.create({
      idcliente,
      nome: String(nome).trim(),
      responsavelNome: responsavel_nome ? String(responsavel_nome).trim() : null,
      responsavelNumero: normalizePhone(responsavel_numero),
    });

    await depRepo.save(departamento);

    return res.status(201).json(mapDepartamento(departamento));
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ error: "Sem permissão para criar departamentos." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }
    console.error("[DEPARTAMENTOS] Erro ao criar:", err);
    return res.status(500).json({ error: "Erro ao criar departamento" });
  }
});

/**
 * PUT /departamentos/:id
 * Atualiza departamento (somente ADMIN/GESTOR/SUPERVISOR)
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    ensureAdmin(req);

    const idcliente = getTenant(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const departamento = await depRepo.findOne({ where: { id: id as any, idcliente: idcliente as any } });
    if (!departamento) {
      return res.status(404).json({ error: "Departamento não encontrado" });
    }

    const { nome, responsavel_nome, responsavel_numero } = req.body as any;

    if (nome !== undefined) {
      const n = String(nome).trim();
      if (n.length < 2) return res.status(400).json({ error: "Nome inválido." });
      departamento.nome = n;
    }

    if (responsavel_nome !== undefined) {
      const rn = String(responsavel_nome).trim();
      departamento.responsavelNome = rn ? rn : null;
    }

    if (responsavel_numero !== undefined) {
      departamento.responsavelNumero = normalizePhone(responsavel_numero);
    }

    await depRepo.save(departamento);

    return res.json(mapDepartamento(departamento));
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ error: "Sem permissão para editar departamentos." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }
    console.error("[DEPARTAMENTOS] Erro ao atualizar:", err);
    return res.status(500).json({ error: "Erro ao atualizar departamento" });
  }
});

/**
 * GET /departamentos/:id/agentes
 * Lista agentes vinculados ao departamento do mesmo município
 */
router.get("/:id/agentes", async (req: Request, res: Response) => {
  try {
    const idcliente = getTenant(req);
    const departamentoId = Number(req.params.id);
    if (!Number.isFinite(departamentoId) || departamentoId <= 0) {
      return res.status(400).json({ error: "ID de departamento inválido" });
    }

    const dep = await depRepo.findOne({ where: { id: departamentoId as any, idcliente: idcliente as any } });
    if (!dep) return res.status(404).json({ error: "Departamento não encontrado" });

    const relacoes = await udRepo.find({
      where: { idcliente: idcliente as any, departamentoId: departamentoId as any },
      order: { principal: "DESC" as any },
      relations: ["usuario"],
    });

    const data = relacoes.map((r) => ({
      usuario_id: r.usuarioId,
      nome: r.usuario?.nome ?? "",
      telefone: (r.usuario as any)?.telefone ?? null,
      perfil: (r.usuario as any)?.perfil ?? null,
      principal: r.principal,
    }));

    return res.json(data);
  } catch (err: any) {
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }
    console.error("[DEPARTAMENTOS] Erro ao listar agentes:", err);
    return res.status(500).json({ error: "Erro ao listar agentes do departamento" });
  }
});

/**
 * POST /departamentos/:id/agentes
 * Sobrescreve vínculos (somente ADMIN/GESTOR/SUPERVISOR)
 * Body:
 * { agentes: [{ usuario_id: string, principal?: boolean }] }
 */
router.post("/:id/agentes", async (req: Request, res: Response) => {
  try {
    ensureAdmin(req);

    const idcliente = getTenant(req);
    const departamentoId = Number(req.params.id);
    if (!Number.isFinite(departamentoId) || departamentoId <= 0) {
      return res.status(400).json({ error: "ID de departamento inválido" });
    }

    const dep = await depRepo.findOne({ where: { id: departamentoId as any, idcliente: idcliente as any } });
    if (!dep) return res.status(404).json({ error: "Departamento não encontrado" });

    const { agentes } = req.body as {
      agentes: { usuario_id: string; principal?: boolean }[];
    };

    if (!Array.isArray(agentes)) {
      return res.status(400).json({ error: "Campo 'agentes' deve ser um array." });
    }

    const userIds = agentes
      .map((a) => (a?.usuario_id ? String(a.usuario_id) : ""))
      .filter((x) => x.length > 0);

    // ✅ valida: todos os usuarios pertencem ao mesmo idcliente
    if (userIds.length > 0) {
      const users = await usuarioRepo.find({
        where: { id: In(userIds) as any, idcliente: idcliente as any },
        select: ["id"],
      });

      if (users.length !== userIds.length) {
        return res.status(400).json({
          error: "Um ou mais usuários informados não pertencem a este município.",
        });
      }
    }

    // Remove vínculos antigos
    await udRepo.delete({ idcliente: idcliente as any, departamentoId: departamentoId as any });

    // Insere novos
    const novos = await Promise.all(
      agentes
        .filter((a) => a?.usuario_id)
        .map((a) =>
          udRepo.save(
            udRepo.create({
              idcliente,
              departamentoId,
              usuarioId: String(a.usuario_id),
              principal: !!a.principal,
            })
          )
        )
    );

    // Recarrega com relations para devolver nomes
    const relacoes = await udRepo.find({
      where: { idcliente: idcliente as any, departamentoId: departamentoId as any },
      order: { principal: "DESC" as any },
      relations: ["usuario"],
    });

    const data = relacoes.map((r) => ({
      usuario_id: r.usuarioId,
      nome: r.usuario?.nome ?? "",
      telefone: (r.usuario as any)?.telefone ?? null,
      perfil: (r.usuario as any)?.perfil ?? null,
      principal: r.principal,
    }));

    return res.json(data);
  } catch (err: any) {
    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ error: "Sem permissão para vincular agentes." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }
    console.error("[DEPARTAMENTOS] Erro ao salvar agentes:", err);
    return res.status(500).json({ error: "Erro ao salvar agentes do departamento" });
  }
});

export default router;
