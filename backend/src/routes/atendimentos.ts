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
 * (usado pelo painel para montar o cabeçalho do chat)
 */
router.get("/atendimentos/:id", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Atendimento);
    const repoMsg = AppDataSource.getRepository(Mensagem);
    const { id } = req.params;

    // Vamos tentar respeitar multi-cliente se o usuário tiver idcliente
    const idcliente = getUserClientId(req);

    let atendimento: any = null;

    if (idcliente) {
      atendimento = await repo.findOne({
        where: { id, idcliente },
        relations: ["departamento"],
      });

      if (!atendimento) {
        console.warn(
          `[ATENDIMENTOS] Atendimento ${id} não encontrado com idcliente=${idcliente}. Tentando sem idcliente (fallback).`
        );
      }
    }

    // Fallback: busca somente pelo ID (casos antigos sem idcliente)
    if (!atendimento) {
      atendimento = await repo.findOne({
        where: { id },
        relations: ["departamento"],
      });
    }

    // Se ainda não achou, tentamos montar um cabeçalho básico
    // a partir da primeira mensagem gravada nesse atendimento.
    if (!atendimento) {
      console.warn(
        `[ATENDIMENTOS] Atendimento ${id} não encontrado na tabela. Tentando montar detalhe a partir das mensagens...`
      );

      const firstMsg = await repoMsg.findOne({
        where: { atendimentoId: id },
        order: { criadoEm: "ASC" },
      });

      if (!firstMsg) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      atendimento = {
        id,
        idcliente: idcliente ?? null,
        protocolo: null,
        cidadaoNome: null,
        cidadaoNumero: firstMsg.remetenteNumero,
        status: "ACTIVE",
        departamentoId: null,
        departamento: null,
        agenteNumero: null,
        agenteNome: null,
        foiResolvido: null,
        notaSatisfacao: null,
        tempoPrimeiraRespostaSegundos: null,
        criadoEm: firstMsg.criadoEm,
        atualizadoEm: firstMsg.criadoEm,
        encerradoEm: null,
      };
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

        if (!atendimento) {
          console.warn(
            `[ATENDIMENTOS] Protocolo ${protocolo} não encontrado para idcliente=${idcliente}. Tentando sem filtro de cliente.`
          );
        }
      }

      if (!atendimento) {
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

        if (!atendimento) {
          console.warn(
            `[ATENDIMENTOS] Atendimento ${id} não encontrado para idcliente=${idcliente} ao listar mensagens. Tentando sem filtro de cliente.`
          );
        }
      }

      if (!atendimento) {
        atendimento = await repoAt.findOne({
          where: { id },
          relations: ["departamento"],
        });
      }

      if (!atendimento) {
        console.warn(
          `[ATENDIMENTOS] Atendimento ${id} realmente não encontrado ao listar mensagens.`
        );
        return res
          .status(404)
          .json({ error: "Atendimento não encontrado" });
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

    const idcliente = getUserClientId(req);

    const qb = repoEvt
      .createQueryBuilder("e")
      .where("e.atendimento_id = :id", { id })
      .orderBy("e.criado_em", "ASC");

    if (idcliente) {
      qb.andWhere("e.idcliente = :idcliente", { idcliente });
    }

    const eventos = await qb.getMany();

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

    const qb = repo.createQueryBuilder("a");

    const idcliente = getUserClientId(req);
    if (idcliente) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente });
    }

    if (dataInicio) {
      qb.andWhere("a.criado_em >= :dataInicio", { dataInicio });
    }
    if (dataFim) {
      qb.andWhere("a.criado_em <= :dataFim", {
        dataFim: `${dataFim} 23:59:59`,
      });
    }

    const total = await qb.getCount();

    const porStatus = await repo
      .createQueryBuilder("a")
      .select("a.status", "status")
      .addSelect("COUNT(*)", "quantidade")
      .groupBy("a.status")
      .getRawMany();

    const porDepartamento = await repo
      .createQueryBuilder("a")
      .leftJoin("a.departamento", "d")
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
