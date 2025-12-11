// src/routes/recadosRoutes.ts
import { Router, Request, Response } from "express";
import { In } from "typeorm";
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import {
  sendTextMessage,
  sendImageMessageById,
  sendDocumentMessageById,
  sendAudioMessageById,
  sendVideoMessageById,
} from "../services/whatsappService";

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
 * Gera protocolo no padrão ATD-YYYYMMDD-XXXXXX
 * (cópia simples da lógica do sessionService)
 */
function generateProtocol(atendimentoId: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const short = atendimentoId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ATD-${yyyy}${mm}${dd}-${short}`;
}

/**
 * Garante que o atendimento tenha protocolo.
 * Se não tiver, gera e salva, retornando o valor.
 */
async function ensureProtocolo(
  atendimento: Atendimento
): Promise<string | null> {
  const repoAtendimento = AppDataSource.getRepository(Atendimento);
  let protocolo = atendimento.protocolo || null;

  if (!protocolo) {
    protocolo = generateProtocol(atendimento.id);
    await repoAtendimento.update(atendimento.id, { protocolo });
    (atendimento as any).protocolo = protocolo;
  }

  return protocolo;
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

    // Multi-tenant: filtra pelo idcliente do token, se existir
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
 *
 * Body:
 *  - mensagem?: string
 *  - agenteNome?: string
 *  - agenteNumero?: string
 *  - tipoMidia?: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO"
 *  - mediaId?: string
 *  - mimeType?: string
 *  - fileName?: string
 *  - fileSize?: number
 *  - mediaUrl?: string
 *
 * Comportamento:
 *  - Garante que o atendimento tenha protocolo;
 *  - Envia primeiro um aviso ao cidadão citando o protocolo;
 *  - Depois envia o texto do agente (se tiver) e/ou a mídia;
 *  - Grava a mensagem no histórico com idcliente.
 */
router.post("/:id/responder", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const {
      mensagem,
      agenteNome,
      agenteNumero,
      tipoMidia,
      mediaId,
      mimeType,
      fileName,
      fileSize,
      mediaUrl,
    } = req.body as {
      mensagem?: string;
      agenteNome?: string;
      agenteNumero?: string;
      tipoMidia?: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";
      mediaId?: string;
      mimeType?: string;
      fileName?: string;
      fileSize?: number;
      mediaUrl?: string;
    };

    if ((!mensagem || !mensagem.trim()) && !mediaId) {
      return res.status(400).json({
        error:
          "É necessário informar pelo menos uma mensagem de texto ou um anexo (mediaId).",
      });
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

    const idcliente = atendimento.idcliente || reqIdCliente;
    if (!idcliente) {
      return res.status(500).json({
        error:
          "Atendimento não possui idcliente definido. Não é possível registrar a mensagem.",
      });
    }

    // Garante que exista protocolo para vincular o recado
    const protocolo = await ensureProtocolo(atendimento);

    // 1) Mensagem de aviso ANTES do recado
    let aviso = "";
    if (protocolo) {
      aviso =
        `📄 Você recebeu um recado referente ao protocolo *${protocolo}*.\n` +
        "Essa é uma atualização enviada pela equipe responsável. Você pode responder esta mensagem normalmente caso tenha dúvidas ou queira complementar informações, até que o atendimento seja marcado como concluído.";
    } else {
      aviso =
        "📄 Você recebeu um recado da equipe responsável pelo seu atendimento.\n" +
        "Você pode responder esta mensagem normalmente caso tenha dúvidas ou queira complementar informações, até que o atendimento seja marcado como concluído.";
    }

    await sendTextMessage(numeroCidadao, aviso);

    // 2) Define tipo de mídia (se houver)
    let tipoMensagem: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" =
      "TEXT";

    if (mediaId) {
      if (tipoMidia) {
        tipoMensagem = tipoMidia;
      } else if (mimeType) {
        if (mimeType.startsWith("image/")) tipoMensagem = "IMAGE";
        else if (mimeType.startsWith("audio/")) tipoMensagem = "AUDIO";
        else if (mimeType.startsWith("video/")) tipoMensagem = "VIDEO";
        else tipoMensagem = "DOCUMENT";
      } else {
        tipoMensagem = "DOCUMENT";
      }
    }

    // 3) Mensagem do agente (texto, se existir)
    if (mensagem && mensagem.trim()) {
      const corpoAgente = agenteNome
        ? `🧑‍💼 *${agenteNome}*:\n${mensagem.trim()}`
        : mensagem.trim();

      await sendTextMessage(numeroCidadao, corpoAgente);
    }

    // 4) Envio da mídia (se existir)
    if (mediaId) {
      if (tipoMensagem === "IMAGE") {
        await sendImageMessageById(numeroCidadao, mediaId);
      } else if (tipoMensagem === "AUDIO") {
        await sendAudioMessageById(numeroCidadao, mediaId);
      } else if (tipoMensagem === "VIDEO") {
        await sendVideoMessageById(numeroCidadao, mediaId);
      } else {
        // DOCUMENT ou fallback
        await sendDocumentMessageById(numeroCidadao, mediaId);
      }
    }

    // 5) Registra mensagem no histórico (AGORA COM idcliente e suporte a mídia)
    const msgEntity = repoMensagem.create({
      idcliente, // multi-tenant
      atendimentoId: atendimento.id,
      direcao: "AGENT" as any,
      tipo: tipoMensagem as any,
      conteudoTexto: mensagem?.trim() || null,
      whatsappMediaId: mediaId || null,
      mediaUrl: mediaUrl || null,
      mimeType: mimeType || null,
      fileName: fileName || null,
      fileSize: fileSize ?? null,
      remetenteNumero: agenteNumero || atendimento.agenteNumero || "PAINEL",
      comandoCodigo: null,
      comandoDescricao: mediaId
        ? "Recado (mídia) enviado pelo painel de recados (modo recado)."
        : "Recado enviado pelo painel de recados (modo recado).",
    } as any);

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
      message: "Recado enviado ao cidadão com sucesso.",
      protocolo,
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

/**
 * PATCH /recados/:id/concluir
 *
 * Marca o recado/atendimento como concluído, garantindo que exista protocolo.
 * Body (opcional):
 *   - foiResolvido?: boolean
 *   - notaSatisfacao?: number
 */
router.patch("/:id/concluir", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { foiResolvido, notaSatisfacao } = req.body as {
      foiResolvido?: boolean;
      notaSatisfacao?: number;
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

    const protocolo = await ensureProtocolo(atendimento);

    const atualizacoes: Partial<Atendimento> = {
      status: "FINISHED" as AtendimentoStatus,
      encerradoEm: new Date(),
    };

    if (typeof foiResolvido === "boolean") {
      (atualizacoes as any).foiResolvido = foiResolvido;
    }
    if (
      typeof notaSatisfacao === "number" &&
      notaSatisfacao >= 1 &&
      notaSatisfacao <= 5
    ) {
      (atualizacoes as any).notaSatisfacao = notaSatisfacao;
    }

    await repoAtendimento.update(atendimento.id, atualizacoes);

    res.json({
      ok: true,
      message: "Recado/atendimento marcado como concluído.",
      protocolo,
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao concluir recado:", err);
    res.status(500).json({ error: "Erro ao concluir recado." });
  }
});

export default router;
