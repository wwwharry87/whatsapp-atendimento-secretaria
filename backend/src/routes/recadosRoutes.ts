// src/routes/recadosRoutes.ts
import { Router, Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { sendTextMessage } from "../services/whatsappService";

const router = Router();

/**
 * Helper para pegar idcliente do usuário autenticado (se existir)
 */
function getRequestClienteId(req: Request): number | undefined {
  const user = (req as any).user;
  if (user && typeof user.idcliente === "number") {
    return user.idcliente;
  }
  return undefined;
}

/**
 * GET /recados
 *
 * Lista recados em formato resumido para o painel.
 *
 * Query params:
 *   - status: "abertos" | "encerrados" | "todos"
 *   - departamentoId: number (opcional)
 *   - search: string (nome cidadão, telefone ou protocolo)
 *   - page: number (padrão 1)
 *   - perPage: number (padrão 20)
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const repoAtendimento = AppDataSource.getRepository(Atendimento);

    const statusParam = String(req.query.status || "abertos").toLowerCase();
    const departamentoId = req.query.departamentoId
      ? Number(req.query.departamentoId)
      : undefined;
    const search = (req.query.search as string) || "";

    const page = req.query.page ? Number(req.query.page) : 1;
    const perPage = req.query.perPage ? Number(req.query.perPage) : 20;

    let statuses: AtendimentoStatus[] = ["LEAVE_MESSAGE", "LEAVE_MESSAGE_DECISION"];

    if (statusParam === "encerrados") {
      statuses = ["FINISHED"];
    } else if (statusParam === "todos") {
      statuses = ["LEAVE_MESSAGE", "LEAVE_MESSAGE_DECISION", "FINISHED"];
    }

    const qb = repoAtendimento
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .where("a.status IN (:...statuses)", { statuses });

    // Multi-tenant: se tiver idcliente no token, filtra
    const reqIdCliente = getRequestClienteId(req);
    if (reqIdCliente) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente: reqIdCliente });
    }

    if (departamentoId) {
      qb.andWhere("a.departamento_id = :departamentoId", { departamentoId });
    }

    if (search) {
      const s = `%${search.toLowerCase()}%`;
      qb.andWhere(
        "(LOWER(a.cidadao_nome) LIKE :s OR a.cidadao_numero LIKE :s OR LOWER(a.protocolo) LIKE :s)",
        { s }
      );
    }

    qb.orderBy("a.criadoEm", "DESC")
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();

    const data = items.map((a) => ({
      id: a.id,
      protocolo: a.protocolo || null,
      cidadaoNome: a.cidadaoNome,
      cidadaoNumero: a.cidadaoNumero,
      departamentoId: a.departamentoId,
      departamentoNome: a.departamento ? a.departamento.nome : null,
      status: a.status,
      criadoEm: a.criadoEm,
      atualizadoEm: (a as any).atualizadoEm,
      encerradoEm: (a as any).encerradoEm,
    }));

    res.json({
      data,
      total,
      page,
      perPage,
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao listar recados:", err);
    res.status(500).json({ error: "Erro ao listar recados." });
  }
});

/**
 * GET /recados/:id
 *
 * Detalhe de um recado (atendimento) + mensagens.
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);

    const qb = repoAtendimento
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .where("a.id = :id", { id });

    const reqIdCliente = getRequestClienteId(req);
    if (reqIdCliente) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente: reqIdCliente });
    }

    const atendimento = await qb.getOne();

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const mensagens = await repoMensagem.find({
      where: { atendimentoId: id },
      order: { criadoEm: "ASC" as any },
    });

    const detalhe = {
      id: atendimento.id,
      protocolo: atendimento.protocolo || null,
      cidadaoNome: atendimento.cidadaoNome,
      cidadaoNumero: atendimento.cidadaoNumero,
      departamentoId: atendimento.departamentoId,
      departamentoNome: atendimento.departamento
        ? atendimento.departamento.nome
        : null,
      status: atendimento.status,
      criadoEm: atendimento.criadoEm,
      atualizadoEm: (atendimento as any).atualizadoEm,
      encerradoEm: (atendimento as any).encerradoEm,
      agenteNome: (atendimento as any).agenteNome || null,
      agenteNumero: (atendimento as any).agenteNumero || null,
      foiResolvido: (atendimento as any).foiResolvido ?? null,
      notaSatisfacao: (atendimento as any).notaSatisfacao ?? null,
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direcao: (m as any).direcao,
        tipo: m.tipo,
        conteudoTexto: m.conteudoTexto,
        criadoEm: (m as any).criadoEm,
        remetenteNumero: (m as any).remetenteNumero,
      })),
    };

    res.json(detalhe);
  } catch (err) {
    console.error("[RECADOS] Erro ao carregar recado:", err);
    res.status(500).json({ error: "Erro ao carregar recado." });
  }
});

/**
 * POST /recados/:id/responder
 *
 * Responde ao cidadão a partir do painel (modo recado).
 * Body:
 *  - mensagem: string (obrigatório)
 *  - agenteNome: string (opcional, para registrar na Mensagem)
 *  - agenteNumero: string (opcional; se não mandar, usa agenteNumero do atendimento)
 */
router.post("/:id/responder", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { mensagem, agenteNome, agenteNumero } = req.body as {
      mensagem: string;
      agenteNome?: string;
      agenteNumero?: string;
    };

    if (!mensagem || !mensagem.trim()) {
      return res
        .status(400)
        .json({ error: "Campo 'mensagem' é obrigatório." });
    }

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);

    // Busca o atendimento, garantindo (se possível) o mesmo idcliente do usuário logado
    const qb = repoAtendimento
      .createQueryBuilder("a")
      .where("a.id = :id", { id });

    const reqIdCliente = getRequestClienteId(req);
    if (reqIdCliente) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente: reqIdCliente });
    }

    const atendimento = await qb.getOne();

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const numeroCidadao = atendimento.cidadaoNumero;
    if (!numeroCidadao) {
      return res.status(400).json({
        error:
          "Atendimento não possui número de cidadão cadastrado. Não é possível enviar resposta.",
      });
    }

    // envia mensagem via WhatsApp
    await sendTextMessage(numeroCidadao, mensagem);

    // registra mensagem no histórico (AGORA COM idcliente)
    const msgEntity = repoMensagem.create({
      idcliente: atendimento.idcliente, // 👈 IMPORTANTE: multi-tenant
      atendimentoId: atendimento.id,
      direcao: "AGENT" as any,
      tipo: "TEXT" as any,
      conteudoTexto: mensagem,
      remetenteNumero: agenteNumero || atendimento.agenteNumero || "PAINEL",
      comandoCodigo: null,
      comandoDescricao:
        "Resposta enviada pelo painel de recados (modo recado).",
    });

    await repoMensagem.save(msgEntity);

    // Atualiza nome/número do agente se veio do painel
    const atualizacoes: Partial<Atendimento> = {};
    if (agenteNome && !atendimento.agenteNome) {
      (atualizacoes as any).agenteNome = agenteNome;
    }
    if (agenteNumero && !atendimento.agenteNumero) {
      (atualizacoes as any).agenteNumero = agenteNumero;
    }

    if (Object.keys(atualizacoes).length > 0) {
      await repoAtendimento.update(atendimento.id, atualizacoes);
    }

    res.json({
      ok: true,
      message: "Resposta enviada ao cidadão com sucesso.",
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao responder recado:", err);
    res.status(500).json({ error: "Erro ao responder recado." });
  }
});

/**
 * PATCH /recados/:id/transferir
 *
 * Transfere o atendimento (recado) para outro departamento e/ou agente.
 * Body:
 *   - departamentoId?: number
 *   - agenteNome?: string
 *   - agenteNumero?: string
 */
router.patch("/:id/transferir", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { departamentoId, agenteNome, agenteNumero } = req.body as {
      departamentoId?: number;
      agenteNome?: string;
      agenteNumero?: string;
    };

    const repoAtendimento = AppDataSource.getRepository(Atendimento);

    const qb = repoAtendimento
      .createQueryBuilder("a")
      .where("a.id = :id", { id });

    const reqIdCliente = getRequestClienteId(req);
    if (reqIdCliente) {
      qb.andWhere("a.idcliente = :idcliente", { idcliente: reqIdCliente });
    }

    const atendimento = await qb.getOne();

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const atualizacoes: Partial<Atendimento> = {};

    if (departamentoId) {
      (atualizacoes as any).departamentoId = departamentoId;
    }
    if (agenteNome) {
      (atualizacoes as any).agenteNome = agenteNome;
    }
    if (agenteNumero) {
      (atualizacoes as any).agenteNumero = agenteNumero;
    }

    await repoAtendimento.update(atendimento.id, atualizacoes);

    res.json({
      ok: true,
      message: "Recado transferido/atualizado com sucesso.",
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao transferir recado:", err);
    res.status(500).json({ error: "Erro ao transferir recado." });
  }
});

export default router;
