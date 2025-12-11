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
    ativo: h.ativo,
  };
}

/**
 * Identifica o idcliente a partir da requisição.
 * Prioridade:
 *  - header "x-id-cliente"
 *  - query string "idcliente"
 *  - body.idcliente
 *  - DEFAULT_CLIENTE_ID ou 1
 */
function getIdClienteFromRequest(req: Request): number {
  const headerVal = (req.headers["x-id-cliente"] || "").toString();
  if (headerVal && !isNaN(Number(headerVal))) {
    return Number(headerVal);
  }

  const queryVal = (req.query.idcliente || "").toString();
  if (queryVal && !isNaN(Number(queryVal))) {
    return Number(queryVal);
  }

  const bodyVal = (req.body?.idcliente || "").toString();
  if (bodyVal && !isNaN(Number(bodyVal))) {
    return Number(bodyVal);
  }

  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !isNaN(Number(envVal))) {
    return Number(envVal);
  }

  return 1;
}

/**
 * GET /horarios
 * Lista os horários de atendimento do cliente atual
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);

    const horarios = await repo
      .createQueryBuilder("h")
      .where("h.idcliente = :idcliente", { idcliente })
      .orderBy("h.departamentoId", "ASC")
      .addOrderBy("h.id", "ASC")
      .getMany();

    res.json(horarios.map(mapEntityToDTO));
  } catch (err) {
    console.error("Erro ao listar horários:", err);
    res.status(500).json({ error: "Erro ao listar horários" });
  }
});

/**
 * POST /horarios/salvar-todos
 * O frontend envia { horarios: HorarioAtendimento[] }
 * Estratégia: apaga os horários APENAS do cliente atual e recria.
 */
router.post("/salvar-todos", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);

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

    // Apaga apenas os horários do cliente atual
    await repo
      .createQueryBuilder()
      .delete()
      .where("idcliente = :idcliente", { idcliente })
      .execute();

    const entities: HorarioAtendimento[] = [];

    for (const h of horarios) {
      const entity = repo.create({
        idcliente,
        departamentoId: h.departamento_id,
        diasSemana: (h.dias_semana || []).join(","),
        inicio: h.inicio,
        fim: h.fim,
        ativo: h.ativo,
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
