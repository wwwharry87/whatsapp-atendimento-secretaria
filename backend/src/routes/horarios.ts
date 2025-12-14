// src/routes/horarios.ts
import { Router, Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { HorarioAtendimento } from "../entities/HorarioAtendimento";
import { Departamento } from "../entities/Departamento";
import { AuthRequest } from "../middlewares/authMiddleware";
import { clearHorarioCache } from "../services/horarioService";

const router = Router();
const repo = AppDataSource.getRepository(HorarioAtendimento);
const depRepo = AppDataSource.getRepository(Departamento);

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

function mapEntityToDTO(h: HorarioAtendimento) {
  return {
    id: h.id,
    departamento_id: h.departamentoId ?? null,
    dias_semana: h.diasSemana ? h.diasSemana.split(",").filter(Boolean) : [],
    inicio: h.inicio,
    fim: h.fim,
    ativo: h.ativo,
  };
}

function isValidTimeHHMM(value: any): boolean {
  if (typeof value !== "string") return false;
  // 00:00 a 23:59
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value.trim());
}

function timeToMinutes(hhmm: string): number {
  const [hh, mm] = hhmm.split(":").map((n) => Number(n));
  return hh * 60 + mm;
}

const VALID_DAYS = new Set(["seg", "ter", "qua", "qui", "sex", "sab", "dom"]);

function normalizeDays(arr: any): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((d) => String(d || "").trim().toLowerCase())
    .filter((d) => VALID_DAYS.has(d));
}

type HorarioDTO = {
  id?: number;
  departamento_id: number | null;
  dias_semana: string[];
  inicio: string;
  fim: string;
  ativo: boolean;
};

router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getTenant(req);

    const horarios = await repo.find({
      where: { idcliente: idcliente as any },
      order: { departamentoId: "ASC" as any, id: "ASC" as any },
    });

    return res.json(horarios.map(mapEntityToDTO));
  } catch (err: any) {
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }
    console.error("[HORARIOS] Erro ao listar:", err);
    return res.status(500).json({ error: "Erro ao listar horários" });
  }
});

/**
 * POST /horarios/salvar-todos
 * Body: { horarios: HorarioDTO[] }
 * Estratégia: apaga do cliente atual e recria (em transação).
 */
router.post("/salvar-todos", async (req: Request, res: Response) => {
  const queryRunner = AppDataSource.createQueryRunner();

  try {
    ensureAdmin(req);

    const idcliente = getTenant(req);
    const { horarios } = req.body as { horarios: HorarioDTO[] };

    if (!Array.isArray(horarios)) {
      return res.status(400).json({ error: "Campo 'horarios' deve ser um array." });
    }

    // 1) Validar / normalizar payload
    const normalized: Array<{
      departamentoId: number | null;
      diasSemana: string;
      inicio: string;
      fim: string;
      ativo: boolean;
    }> = [];

    for (const h of horarios) {
      const depId = h?.departamento_id ?? null;

      if (depId !== null && (!Number.isFinite(depId) || Number(depId) <= 0)) {
        return res.status(400).json({ error: "departamento_id inválido." });
      }

      const dias = normalizeDays(h?.dias_semana);
      const inicio = String(h?.inicio ?? "").trim();
      const fim = String(h?.fim ?? "").trim();
      const ativo = !!h?.ativo;

      if (!isValidTimeHHMM(inicio) || !isValidTimeHHMM(fim)) {
        return res.status(400).json({ error: "Horário inválido. Use HH:MM (ex: 08:00)." });
      }

      if (timeToMinutes(inicio) >= timeToMinutes(fim)) {
        return res.status(400).json({ error: "Intervalo inválido: inicio deve ser menor que fim." });
      }

      // Se ativo=true, exige ao menos 1 dia. Se ativo=false, pode vir vazio.
      if (ativo && dias.length === 0) {
        return res.status(400).json({ error: "dias_semana inválido: informe ao menos um dia quando ativo=true." });
      }

      normalized.push({
        departamentoId: depId,
        diasSemana: dias.join(","),
        inicio,
        fim,
        ativo,
      });
    }

    // 2) Validar se todos os departamentos pertencem ao mesmo idcliente
    const depIds = Array.from(
      new Set(normalized.map((x) => x.departamentoId).filter((x): x is number => x !== null))
    );

    if (depIds.length > 0) {
      const deps = await depRepo.find({
        where: { id: In(depIds) as any, idcliente: idcliente as any },
        select: ["id"],
      });

      if (deps.length !== depIds.length) {
        return res.status(400).json({
          error: "Um ou mais departamentos informados não pertencem a este município.",
        });
      }
    }

    // 3) Transação: apaga e recria atomicamente
    await queryRunner.connect();
    await queryRunner.startTransaction();

    await queryRunner.manager
      .createQueryBuilder()
      .delete()
      .from(HorarioAtendimento)
      .where("idcliente = :idcliente", { idcliente })
      .execute();

    for (const h of normalized) {
      const entity = queryRunner.manager.create(HorarioAtendimento, {
        idcliente,
        departamentoId: h.departamentoId,
        diasSemana: h.diasSemana,
        inicio: h.inicio,
        fim: h.fim,
        ativo: h.ativo,
      });

      await queryRunner.manager.save(HorarioAtendimento, entity);
    }

    await queryRunner.commitTransaction();

    clearHorarioCache();

    // 4) Retorna o que ficou salvo
    const saved = await repo.find({
      where: { idcliente: idcliente as any },
      order: { departamentoId: "ASC" as any, id: "ASC" as any },
    });

    return res.json(saved.map(mapEntityToDTO));
  } catch (err: any) {
    try {
      await queryRunner.rollbackTransaction();
    } catch {}

    if (err?.code === "FORBIDDEN" || err?.message === "FORBIDDEN") {
      return res.status(403).json({ error: "Sem permissão para alterar horários." });
    }
    if (err?.message === "TENANT_MISSING") {
      return res.status(401).json({ error: "Token inválido (idcliente ausente)." });
    }

    console.error("[HORARIOS] Erro ao salvar-todos:", err);
    return res.status(500).json({ error: "Erro ao salvar horários" });
  } finally {
    try {
      await queryRunner.release();
    } catch {}
  }
});



export default router;
