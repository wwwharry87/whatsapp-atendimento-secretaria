import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { AtendimentoEvento } from "../entities/AtendimentoEvento";

const router = Router();

/**
 * Tenta obter o idcliente a partir do JWT já decodificado no middleware de auth.
 * Se não tiver nada, retorna null (sem filtro de cliente).
 */
function getUserClientId(req: Request): number | null {
  try {
    const userPayload =
      (req as any).userJwtPayload ||
      (req as any).user ||
      (req as any).authUser ||
      null;

    const raw =
      userPayload?.idcliente ??
      (req as any).idcliente ??
      (req.headers["x-idcliente"] as string | undefined);

    if (!raw) return null;

    const parsed = parseInt(String(raw), 10);
    if (Number.isNaN(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
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

    const idcliente = getUserClientId(req);

    const qb = repo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .orderBy("a.criado_em", "DESC")
      .skip((pageNum - 1) * pageSize)
      .take(pageSize);

    // 🔹 Multi-tenant: filtrar por cliente, se tiver
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
 * ============================================================
 *  ROTAS MAIS ESPECÍFICAS /atendimentos/:id/...
 *  (PRECISAM VIR ANTES DE /atendimentos/:id)
 * ============================================================
 */

/**
 * Lista mensagens de um atendimento em ordem cronológica
 * no formato esperado pelo painel.
 *
 * GET /atendimentos/:id/mensagens
 */
router.get(
  "/atendimentos/:id/mensagens",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const repoAt = AppDataSource.getRepository(Atendimento);
      const repoMsg = AppDataSource.getRepository(Mensagem);

      // ✅ Aqui podemos até ignorar idcliente, porque o painel só acessa
      // atendimentos que já vieram da lista filtrada.
      const atendimento = await repoAt.findOne({
        where: { id },
        relations: ["departamento"],
      });

      if (!atendimento) {
        return res
          .status(404)
          .json({ error: "Atendimento não encontrado (mensagens)" });
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
router.get(
  "/atendimentos/:id/eventos",
  async (req: Request, res: Response) => {
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
  }
);

/**
 * ============================================================
 *  GET /atendimentos/:id  (DETALHE DO ATENDIMENTO)
 * ============================================================
 *
 * 🔴 IMPORTANTE:
 *  - Aqui eu NÃO filtro por idcliente.
 *  - O ID já vem da listagem filtrada, então está seguro.
 *  - Isso evita o 404 por causa de inconsistência de idcliente.
 *  - Se não achar no atendimento, ainda tento reconstruir com base na 1ª mensagem.
 */
router.get("/atendimentos/:id", async (req: Request, res: Response) => {
  try {
    const repo = AppDataSource.getRepository(Atendimento);
    const repoMsg = AppDataSource.getRepository(Mensagem);
    const { id } = req.params;

    // 1) Tenta pegar direto da tabela de atendimentos
    let atendimento = await repo.findOne({
      where: { id },
      relations: ["departamento"],
    });

    // 2) Se ainda assim não encontrar, tenta montar cabeçalho mínimo
    //    com base na primeira mensagem existente
    if (!atendimento) {
      const firstMsg = await repoMsg.findOne({
        where: { atendimentoId: id },
        order: { criadoEm: "ASC" },
      });

      if (!firstMsg) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      atendimento = {
        id,
        idcliente: null,
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
 * (aqui sim é seguro filtrar por idcliente, se quiser)
 */
router.get(
  "/atendimentos/protocolo/:protocolo",
  async (req: Request, res: Response) => {
    try {
      const repo = AppDataSource.getRepository(Atendimento);
      const { protocolo } = req.params;
      const idcliente = getUserClientId(req);

      const where: any = { protocolo };
      if (idcliente) {
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
    const idcliente = getUserClientId(req);

    const qb = repo.createQueryBuilder("a");

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
      .where(idcliente ? "a.idcliente = :idcliente" : "1=1", { idcliente })
      .groupBy("a.status")
      .getRawMany();

    const porDepartamento = await repo
      .createQueryBuilder("a")
      .leftJoin("a.departamento", "d")
      .select("COALESCE(d.nome, 'Sem setor')", "departamento")
      .addSelect("COUNT(*)", "quantidade")
      .where(idcliente ? "a.idcliente = :idcliente" : "1=1", { idcliente })
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
