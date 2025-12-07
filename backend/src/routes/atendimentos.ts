import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { AtendimentoEvento } from "../entities/AtendimentoEvento";

const router = Router();

/**
 * Helper para pegar idcliente do usuário autenticado (JWT / middleware)
 * Caso não exista, retorna undefined e as consultas não filtram por cliente.
 */
function getUserClientId(req: Request): number | undefined {
  const user = (req as any).user;
  if (!user) return undefined;
  if (user.idcliente) return Number(user.idcliente);
  if (user.clienteId) return Number(user.clienteId);
  return undefined;
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

    const qb = repo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .orderBy("a.criado_em", "DESC")
      .skip((pageNum - 1) * pageSize)
      .take(pageSize);

    // 🔹 Multi-cliente: filtra por idcliente se tiver user logado
    const idcliente = getUserClientId(req);
    if (idcliente) {
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
 * GET /atendimentos/:id
 * Detalhe de um atendimento
 */
router.get("/atendimentos/:id", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Atendimento);
    const { id } = req.params;
    const idcliente = getUserClientId(req);

    let atendimento: Atendimento | null = null;

    if (idcliente) {
      atendimento = await repo.findOne({
        where: { id, idcliente },
        relations: ["departamento"],
      });
    } else {
      atendimento = await repo.findOne({
        where: { id },
        relations: ["departamento"],
      });
    }

    // 🔁 Fallback: se não encontrou com idcliente, tenta sem filtro (para registros antigos)
    if (!atendimento && idcliente) {
      console.warn(
        `[ATENDIMENTOS/:id] Atendimento ${id} não encontrado com idcliente=${idcliente}, tentando sem filtro de cliente.`
      );
      atendimento = await repo.findOne({
        where: { id },
        relations: ["departamento"],
      });
    }

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado" });
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
      const idcliente = getUserClientId(req);

      let atendimento: Atendimento | null = null;

      if (idcliente) {
        atendimento = await repo.findOne({
          where: { protocolo, idcliente },
          relations: ["departamento"],
        });
      } else {
        atendimento = await repo.findOne({
          where: { protocolo },
          relations: ["departamento"],
        });
      }

      if (!atendimento && idcliente) {
        console.warn(
          `[ATENDIMENTOS/protocolo] Atendimento com protocolo=${protocolo} não encontrado com idcliente=${idcliente}, tentando sem filtro.`
        );
        atendimento = await repo.findOne({
          where: { protocolo },
          relations: ["departamento"],
        });
      }

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
 * Lista mensagens de um atendimento em ordem cronológica
 * no formato esperado pelo painel (texto, autor, media, comando, etc.)
 */
router.get(
  "/atendimentos/:id/mensagens",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const repoAt = AppDataSource.getRepository(Atendimento);
      const repoMsg = AppDataSource.getRepository(Mensagem);

      const idcliente = getUserClientId(req);

      let atendimento: Atendimento | null = null;

      if (idcliente) {
        atendimento = await repoAt.findOne({
          where: { id, idcliente },
          relations: ["departamento"],
        });
      } else {
        atendimento = await repoAt.findOne({
          where: { id },
          relations: ["departamento"],
        });
      }

      if (!atendimento && idcliente) {
        console.warn(
          `[ATENDIMENTOS/:id/mensagens] Atendimento ${id} não encontrado com idcliente=${idcliente}, tentando sem filtro.`
        );
        atendimento = await repoAt.findOne({
          where: { id },
          relations: ["departamento"],
        });
      }

      if (!atendimento) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      const mensagens = await repoMsg.find({
        where: { atendimentoId: id },
        order: { criadoEm: "ASC" },
      });

      const resposta = mensagens.map((m) => {
        let autorBase: string | null = null;

        if (m.direcao === "CITIZEN") {
          autorBase = "CIDADÃO";
        } else if (m.direcao === "AGENT") {
          autorBase = "AGENTE";
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

          // 🔹 novos campos – IMPORTANTES PRO PAINEL
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
router.get("/atendimentos/:id/eventos", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repoEvt = AppDataSource.getRepository(AtendimentoEvento);

    const eventos = await repoEvt.find({
      where: { atendimentoId: id },
      order: { criadoEm: "ASC" },
    });

    res.json(eventos);
  } catch (err: any) {
    console.error("Erro ao listar eventos do atendimento:", err);
    res.status(500).json({ error: "Erro ao listar eventos do atendimento" });
  }
});

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
    const idcliente = getUserClientId(req);

    const qbBase = repo.createQueryBuilder("a");

    if (idcliente) {
      qbBase.andWhere("a.idcliente = :idcliente", { idcliente });
    }

    if (dataInicio) {
      qbBase.andWhere("a.criado_em >= :dataInicio", { dataInicio });
    }
    if (dataFim) {
      qbBase.andWhere("a.criado_em <= :dataFim", {
        dataFim: `${dataFim} 23:59:59`,
      });
    }

    const total = await qbBase.getCount();

    const qbStatus = repo.createQueryBuilder("a");
    if (idcliente) {
      qbStatus.andWhere("a.idcliente = :idcliente", { idcliente });
    }
    if (dataInicio) {
      qbStatus.andWhere("a.criado_em >= :dataInicio", { dataInicio });
    }
    if (dataFim) {
      qbStatus.andWhere("a.criado_em <= :dataFim", {
        dataFim: `${dataFim} 23:59:59`,
      });
    }

    const porStatus = await qbStatus
      .select("a.status", "status")
      .addSelect("COUNT(*)", "quantidade")
      .groupBy("a.status")
      .getRawMany();

    const qbDep = repo
      .createQueryBuilder("a")
      .leftJoin("a.departamento", "d");

    if (idcliente) {
      qbDep.andWhere("a.idcliente = :idcliente", { idcliente });
    }
    if (dataInicio) {
      qbDep.andWhere("a.criado_em >= :dataInicio", { dataInicio });
    }
    if (dataFim) {
      qbDep.andWhere("a.criado_em <= :dataFim", {
        dataFim: `${dataFim} 23:59:59`,
      });
    }

    const porDepartamento = await qbDep
      .select("COALESCE(d.nome, 'Sem setor')", "departamento")
      .addSelect("COUNT(*)", "quantidade")
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
