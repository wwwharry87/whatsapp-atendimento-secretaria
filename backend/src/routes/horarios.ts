// src/routes/horarios.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { HorarioAtendimento } from "../entities/HorarioAtendimento";

const router = Router();
const repo = AppDataSource.getRepository(HorarioAtendimento);

function mapEntityToDTO(h: HorarioAtendimento) {
  return {
    id: h.id,
    departamento_id: h.departamentoId ?? null,
    dias_semana: h.diasSemana
      ? h.diasSemana.split(",").filter(Boolean)
      : [],
    inicio: h.inicio,
    fim: h.fim,
    ativo: h.ativo
  };
}

/**
 * GET /horarios
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const horarios = await repo.find({
      order: {
        departamentoId: "ASC",
        id: "ASC"
      }
    });

    res.json(horarios.map(mapEntityToDTO));
  } catch (err) {
    console.error("Erro ao listar horários:", err);
    res.status(500).json({ error: "Erro ao listar horários" });
  }
});

/**
 * POST /horarios/salvar-todos
 * O frontend envia { horarios: HorarioAtendimento[] }
 */
router.post("/salvar-todos", async (req: Request, res: Response) => {
  try {
    const { horarios } = req.body as {
      horarios: {
        id?: number;
        departamento_id: number | null;
        dias_semana: string[];
        inicio: string;
        fim: string;
        ativo: boolean;
      }[];
    };

    if (!Array.isArray(horarios)) {
      return res
        .status(400)
        .json({ error: "Campo 'horarios' deve ser um array." });
    }

    // Estratégia simples: limpa tudo e recria
    await repo.clear();

    const entities: HorarioAtendimento[] = [];

    for (const h of horarios) {
      const entity = repo.create({
        departamentoId: h.departamento_id,
        diasSemana: (h.dias_semana || []).join(","),
        inicio: h.inicio,
        fim: h.fim,
        ativo: h.ativo
      });

      entities.push(await repo.save(entity));
    }

    res.json(entities.map(mapEntityToDTO));
  } catch (err) {
    console.error("Erro ao salvar horários:", err);
    res.status(500).json({ error: "Erro ao salvar horários" });
  }
});

export default router;
