// src/routes/atendimentos.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { AtendimentoEvento } from "../entities/AtendimentoEvento";
import { AuthRequest } from "../middlewares/authMiddleware";

const router = Router();

/**
 * Tenta obter o idcliente a partir do JWT (authMiddleware) ou headers/params.
 * Se não conseguir, retorna null (sem filtro de cliente).
 */
function getIdClienteFromRequest(req: Request): number | null {
  const authReq = req as AuthRequest;

  // 1) Token JWT (preenchido pelo authMiddleware)
  if (authReq.idcliente && !Number.isNaN(Number(authReq.idcliente))) {
    return Number(authReq.idcliente);
  }

  // 2) Headers (aceita x-id-cliente e x-idcliente)
  const headerVal =
    (req.headers["x-id-cliente"] ||
      req.headers["x-idcliente"] ||
      "")?.toString() || "";
  if (headerVal && !Number.isNaN(Number(headerVal))) {
    return Number(headerVal);
  }

  // 3) Query
  const queryVal = (req.query.idcliente || "").toString();
  if (queryVal && !Number.isNaN(Number(queryVal))) {
    return Number(queryVal);
  }

  // 4) Body
  const bodyVal = (req.body?.idcliente || "").toString();
  if (bodyVal && !Number.isNaN(Number(bodyVal))) {
    return Number(bodyVal);
  }

  // 5) Env (fallback)
  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !Number.isNaN(Number(envVal))) {
    return Number(envVal);
  }

  return null;
}

/**
 * GET /atendimentos
 * Lista atendimentos com filtros e paginação
 * Query params:
 *  - page (default 1)
 *  - limit (default 20)
 *  - status
 *  - departamentoId
 *  - protocolo
 *  - cidadaoNome
 *  - telefone
 */
router.get("/atendimentos", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Atendimento);
    const {
      page = "1",
      limit = "20",
      status,
      departamentoId,
      protocolo,
      cidadaoNome,
      telefone,
    } = req.query as Record<string, string>;

    const pageNum = Math.max(parseInt(page || "1", 10), 1);
    const pageSize = Math.min(Math.max(parseInt(limit || "20", 10), 1), 100);

    const idcliente = getIdClienteFromRequest(req);

    const qb = repo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .orderBy("a.criado_em", "DESC")
      .skip((pageNum - 1) * pageSize)
      .take(pageSize);

    // 🔹 Multi-tenant: filtrar por cliente, se tiver
    if (idcliente !== null) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente });
    }

    if (status) {
      qb.andWhere("a.status = :status", { status });
    }

    if (departamentoId) {
      qb.andWhere("a.departamento_id = :departamentoId", {
        departamentoId: Number(departamentoId),
      });
    }

    if (protocolo) {
      qb.andWhere("a.protocolo ILIKE :protocolo", {
        protocolo: `%${protocolo}%`,
      });
    }

    if (cidadaoNome) {
      qb.andWhere("a.cidadao_nome ILIKE :cidadaoNome", {
        cidadaoNome: `%${cidadaoNome}%`,
      });
    }

    if (telefone) {
      qb.andWhere("a.cidadao_numero ILIKE :telefone", {
        telefone: `%${telefone}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();

    res.json({
      page: pageNum,
      limit: pageSize,
      total,
      items,
    });
  } catch (err: any) {
    console.error("Erro ao listar atendimentos:", err);
    res.status(500).json({ error: "Erro ao listar atendimentos" });
  }
});

/**
 * ============================================================
 *  ROTAS MAIS ESPECÍFICAS /atendimentos/:id/...
 * ============================================================
 */

/**
 * GET /atendimentos/:id/mensagens
 * Lista mensagens de um atendimento em ordem cronológica
 * no formato esperado pelo painel.
 */
router.get(
  "/atendimentos/:id/mensagens",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idcliente = getIdClienteFromRequest(req);

      const repoAt = AppDataSource.getRepository(Atendimento);
      const repoMsg = AppDataSource.getRepository(Mensagem);

      const whereAt: any = { id };
      if (idcliente !== null) {
        whereAt.idcliente = idcliente;
      }

      const atendimento = await repoAt.findOne({
        where: whereAt,
        relations: ["departamento"],
      });

      if (!atendimento) {
        return res
          .status(404)
          .json({ error: "Atendimento não encontrado (mensagens)" });
      }

      const whereMsg: any = { atendimentoId: id };
      if (idcliente !== null) {
        whereMsg.idcliente = idcliente;
      }

      const mensagens = await repoMsg.find({
        where: whereMsg,
        order: { criadoEm: "ASC" as any },
      });

      const resposta = mensagens.map((m) => {
        let autorBase: string | null = null;

        if (m.direcao === "CITIZEN") {
          autorBase = "CIDADÃO";
        } else if (m.direcao === "AGENT") {
          autorBase = "AGENTE";
        } else if (m.direcao === "IA") {
          autorBase = "ASSISTENTE VIRTUAL";
        } else {
          autorBase = "SISTEMA";
        }

        return {
          id: m.id,
          tipo: m.tipo,
          texto: m.conteudoTexto ?? null,
          autor: autorBase,
          direction: m.direcao,
          media_id: m.whatsappMediaId ?? null,
          media_mime: m.mimeType ?? null,
          criado_em: m.criadoEm,
          comando_codigo: (m as any).comandoCodigo ?? null,
          comando_descricao: (m as any).comandoDescricao ?? null,
        };
      });

      res.json(resposta);
    } catch (err: any) {
      console.error("Erro ao listar mensagens do atendimento:", err);
      res
        .status(500)
        .json({ error: "Erro ao listar mensagens do atendimento" });
    }
  }
);

/**
 * GET /atendimentos/:id/eventos
 * Linha do tempo de eventos do atendimento
 */
router.get(
  "/atendimentos/:id/eventos",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idcliente = getIdClienteFromRequest(req);
      const repoEvt = AppDataSource.getRepository(AtendimentoEvento);

      const whereEvt: any = { atendimentoId: id };
      if (idcliente !== null) {
        whereEvt.idcliente = idcliente;
      }

      const eventos = await repoEvt.find({
        where: whereEvt,
        order: { criadoEm: "ASC" as any },
      });

      res.json(eventos);
    } catch (err: any) {
      console.error("Erro ao listar eventos do atendimento:", err);
      res.status(500).json({ error: "Erro ao listar eventos do atendimento" });
    }
  }
);

/**
 * GET /atendimentos/:id  (DETALHE DO ATENDIMENTO)
 */
router.get("/atendimentos/:id", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Atendimento);
    const repoMsg = AppDataSource.getRepository(Mensagem);
    const { id } = req.params;
    const idcliente = getIdClienteFromRequest(req);

    const whereAt: any = { id };
    if (idcliente !== null) {
      whereAt.idcliente = idcliente;
    }

    // 1) Tenta pegar direto da tabela de atendimentos
    let atendimento = await repo.findOne({
      where: whereAt,
      relations: ["departamento"],
    });

    // 2) Se ainda assim não encontrar, tenta montar cabeçalho mínimo
    //    com base na primeira mensagem existente PARA O MESMO CLIENTE
    if (!atendimento) {
      const whereMsg: any = { atendimentoId: id };
      if (idcliente !== null) {
        whereMsg.idcliente = idcliente;
      }

      const firstMsg = await repoMsg.findOne({
        where: whereMsg,
        order: { criadoEm: "ASC" as any },
      });

      if (!firstMsg) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      atendimento = {
        id,
        idcliente: idcliente ?? (firstMsg as any).idcliente ?? null,
        cidadaoNumero: firstMsg.remetenteNumero ?? "",
        cidadaoNome: null,
        status: "ACTIVE",
        departamentoId: null,
        departamento: null as any,
        agenteNumero: null,
        agenteNome: null,
        protocolo: null,
        foiResolvido: null,
        notaSatisfacao: null,
        tempoPrimeiraRespostaSegundos: null,
        criadoEm: firstMsg.criadoEm,
        atualizadoEm: firstMsg.criadoEm,
        encerradoEm: null,
      } as any as Atendimento;
    }

    res.json(atendimento);
  } catch (err: any) {
    console.error("Erro ao buscar atendimento:", err);
    res.status(500).json({ error: "Erro ao buscar atendimento" });
  }
});

/**
 * GET /atendimentos/protocolo/:protocolo
 * Buscar atendimento por número de protocolo
 */
router.get(
  "/atendimentos/protocolo/:protocolo",
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Atendimento);
      const { protocolo } = req.params;
      const idcliente = getIdClienteFromRequest(req);

      const where: any = { protocolo };
      if (idcliente !== null) {
        where.idcliente = idcliente;
      }

      const atendimento = await repo.findOne({
        where,
        relations: ["departamento"],
      });

      if (!atendimento) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      res.json(atendimento);
    } catch (err: any) {
      console.error("Erro ao buscar atendimento por protocolo:", err);
      res
        .status(500)
        .json({ error: "Erro ao buscar atendimento por protocolo" });
    }
  }
);

/**
 * GET /dashboard/resumo
 * Indicadores básicos para painel
 * Query:
 *  - dataInicio (YYYY-MM-DD)
 *  - dataFim (YYYY-MM-DD)
 */
router.get("/dashboard/resumo", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Atendimento);
    const { dataInicio, dataFim } = req.query as Record<string, string>;
    const idcliente = getIdClienteFromRequest(req);

    // 🔹 Filtro base reutilizável
    const baseWhere: string[] = [];
    const baseParams: any = {};

    if (idcliente !== null) {
      baseWhere.push("a.idcliente = :idcliente");
      baseParams.idcliente = idcliente;
    }

    if (dataInicio) {
      baseWhere.push("a.criado_em >= :dataInicio");
      baseParams.dataInicio = dataInicio;
    }

    if (dataFim) {
      baseWhere.push("a.criado_em <= :dataFim");
      baseParams.dataFim = `${dataFim} 23:59:59`;
    }

    const whereClause =
      baseWhere.length > 0 ? baseWhere.join(" AND ") : "1=1";

    // ✅ Total no período
    const total = await repo
      .createQueryBuilder("a")
      .where(whereClause, baseParams)
      .getCount();

    // ✅ Agrupado por status no mesmo período
    const porStatus = await repo
      .createQueryBuilder("a")
      .select("a.status", "status")
      .addSelect("COUNT(*)", "quantidade")
      .where(whereClause, baseParams)
      .groupBy("a.status")
      .getRawMany();

    // ✅ Agrupado por departamento no mesmo período
    const porDepartamento = await repo
      .createQueryBuilder("a")
      .leftJoin("a.departamento", "d")
      .select("COALESCE(d.nome, 'Sem setor')", "departamento")
      .addSelect("COUNT(*)", "quantidade")
      .where(whereClause, baseParams)
      .groupBy("d.nome")
      .getRawMany();

    res.json({
      totalAtendimentos: total,
      porStatus,
      porDepartamento,
    });
  } catch (err: any) {
    console.error("Erro ao montar resumo do dashboard:", err);
    res.status(500).json({ error: "Erro ao montar resumo do dashboard" });
  }
});

export default router;
