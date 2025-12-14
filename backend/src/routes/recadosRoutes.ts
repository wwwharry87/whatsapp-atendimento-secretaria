// src/routes/recadosRoutes.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento, AtendimentoStatus } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { Cliente } from "../entities/Cliente";
import {
  sendTextMessage,
  sendImageMessageById,
  sendDocumentMessageById,
  sendAudioMessageById,
  sendVideoMessageById,
} from "../services/whatsappService";
import { getOrganizationStyle, HumanMessagesService } from "../services/humanMessages";
import { AuthRequest } from "../middlewares/authMiddleware";
import { invalidateSessionCache } from "../services/sessionState";
import { ensureProtocolForSession } from "../services/protocolService";

const router = Router();

/**
 * Resolve idcliente da requisição (Lógica Multi-tenant)
 */
function resolveIdCliente(req: Request): number {
  const r = req as AuthRequest & { user?: any };

  if (typeof (r as any).idcliente === "number" && !Number.isNaN(Number((r as any).idcliente)))
    return Number((r as any).idcliente);

  if (r.user && typeof r.user.idcliente === "number") return Number(r.user.idcliente);

  const headerVal = (req.headers["x-id-cliente"] || "").toString();
  if (headerVal && !Number.isNaN(Number(headerVal))) return Number(headerVal);

  const queryVal = (req.query.idcliente || "").toString();
  if (queryVal && !Number.isNaN(Number(queryVal))) return Number(queryVal);

  const bodyVal = (req.body?.idcliente || "").toString();
  if (bodyVal && !Number.isNaN(Number(bodyVal))) return Number(bodyVal);

  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !Number.isNaN(Number(envVal))) return Number(envVal);

  return 1;
}

/**
 * GET /recados
 * Lista recados para o painel
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const repoAtendimento = AppDataSource.getRepository(Atendimento);

    const statusParam = String(req.query.status || "abertos").toLowerCase();
    const departamentoId = req.query.departamentoId ? Number(req.query.departamentoId) : undefined;
    const search = (req.query.search as string) || "";
    const page = req.query.page ? Number(req.query.page) : 1;
    const perPage = req.query.perPage ? Number(req.query.perPage) : 20;

    // ✅ Inclui WAITING_AGENT porque seu timer muda LEAVE_MESSAGE -> WAITING_AGENT
    let statuses: any[] = [
      "LEAVE_MESSAGE",
      "LEAVE_MESSAGE_DECISION",
      "WAITING_AGENT",
      "OFFLINE_POST_AGENT_RESPONSE",
      "OFFLINE_RATING",
    ];

    if (statusParam === "encerrados") {
      statuses = ["FINISHED"];
    } else if (statusParam === "todos") {
      statuses = [
        "LEAVE_MESSAGE",
        "LEAVE_MESSAGE_DECISION",
        "WAITING_AGENT",
        "OFFLINE_POST_AGENT_RESPONSE",
        "OFFLINE_RATING",
        "FINISHED",
      ];
    }

    const idcliente = resolveIdCliente(req);

    const qb = repoAtendimento
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.departamento", "d")
      .where("a.status IN (:...statuses)", { statuses })
      .andWhere("a.idcliente = :idcliente", { idcliente });

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

    // =========================================================================
    // CORREÇÃO AQUI: Use o nome da PROPRIEDADE da classe, não da coluna do banco.
    // O TypeORM se perde na paginação (take/skip) se usar nome da coluna.
    // =========================================================================
    qb.orderBy("a.atualizadoEm", "DESC") // <-- era "a.atualizado_em"
      .addOrderBy("a.criadoEm", "DESC")  // <-- era "a.criado_em"
      .skip((page - 1) * perPage)
      .take(perPage);

    const [items, total] = await qb.getManyAndCount();

    const data = items.map((a) => ({
      id: a.id,
      protocolo: a.protocolo || null,
      cidadaoNome: (a as any).cidadaoNome,
      cidadaoNumero: (a as any).cidadaoNumero,
      departamentoId: (a as any).departamentoId,
      departamentoNome: (a as any).departamento ? (a as any).departamento.nome : null,
      status: a.status,
      criadoEm: (a as any).criadoEm,
      atualizadoEm: (a as any).atualizadoEm,
      encerradoEm: (a as any).encerradoEm,
    }));

    res.json({ data, total, page, perPage });
  } catch (err) {
    console.error("[RECADOS] Erro ao listar recados:", err);
    res.status(500).json({ error: "Erro ao listar recados." });
  }
});

/**
 * GET /recados/:id
 * Detalhes e mensagens
 */
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);
    const idcliente = resolveIdCliente(req);

    const atendimento = await repoAtendimento.findOne({
      where: { id, idcliente } as any,
      relations: ["departamento"],
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const mensagens = await repoMensagem.find({
      where: { atendimentoId: id as any, idcliente: idcliente as any },
      order: { criadoEm: "ASC" as any },
    });

    res.json({
      ...atendimento,
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direcao: (m as any).direcao,
        tipo: m.tipo,
        conteudoTexto: m.conteudoTexto,
        criadoEm: (m as any).criadoEm,
        remetenteNumero: (m as any).remetenteNumero,
        mediaUrl: m.mediaUrl,
        mimeType: m.mimeType,
        fileName: (m as any).fileName,
      })),
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao carregar recado:", err);
    res.status(500).json({ error: "Erro ao carregar recado." });
  }
});

/**
 * POST /recados/:id/responder
 * Agente responde pelo painel.
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
    } = req.body;

    if ((!mensagem || !mensagem.trim()) && !mediaId) {
      return res.status(400).json({ error: "Mensagem vazia." });
    }

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);
    const idclienteReq = resolveIdCliente(req);

    const atendimento = await repoAtendimento.findOne({
      where: { id, idcliente: idclienteReq } as any,
      relations: ["departamento"],
    });

    if (!atendimento) return res.status(404).json({ error: "Atendimento não encontrado." });

    // ✅ Use sempre o idcliente do atendimento (fonte da verdade)
    const idcliente = (atendimento as any).idcliente as number;
    const numeroCidadao = (atendimento as any).cidadaoNumero as string;

    // ✅ garante protocolo padronizado (serviço único do projeto)
    const protocolo = await ensureProtocolForSession({
      atendimentoId: atendimento.id,
      protocolo: (atendimento as any).protocolo,
      status: atendimento.status,
    });

    // Determina tipo de mensagem
    let tipoMensagem = "TEXT";
    if (mediaId) {
      if (tipoMidia) tipoMensagem = tipoMidia;
      else if (mimeType?.startsWith("image/")) tipoMensagem = "IMAGE";
      else if (mimeType?.startsWith("audio/")) tipoMensagem = "AUDIO";
      else if (mimeType?.startsWith("video/")) tipoMensagem = "VIDEO";
      else tipoMensagem = "DOCUMENT";
    }

    // Envia texto
    if (mensagem && mensagem.trim()) {
      const corpo = agenteNome ? `🧑‍💼 *${agenteNome}*:\n${mensagem.trim()}` : mensagem.trim();
      await sendTextMessage(numeroCidadao, corpo, { idcliente });
    }

    // Envia mídia
    if (mediaId) {
      const opts = { idcliente };
      if (tipoMensagem === "IMAGE") await sendImageMessageById(numeroCidadao, mediaId, opts);
      else if (tipoMensagem === "AUDIO") await sendAudioMessageById(numeroCidadao, mediaId, opts);
      else if (tipoMensagem === "VIDEO") await sendVideoMessageById(numeroCidadao, mediaId, opts);
      else await sendDocumentMessageById(numeroCidadao, mediaId, opts);
    }

    // Salva no banco
    const msgEntity = repoMensagem.create({
      idcliente,
      atendimentoId: atendimento.id,
      direcao: "AGENT",
      tipo: tipoMensagem as any,
      conteudoTexto: mensagem?.trim() || null,
      whatsappMediaId: mediaId || null,
      mediaUrl: mediaUrl || null,
      mimeType: mimeType || null,
      fileName: fileName || null,
      fileSize: fileSize ?? null,
      remetenteNumero: agenteNumero || (atendimento as any).agenteNumero || "PAINEL",
      comandoDescricao: "Resposta via Painel",
    } as any);

    await repoMensagem.save(msgEntity);

    // Atualiza dados do agente + atualizadoEm
    const upd: any = {
      atualizadoEm: new Date(),
    };
    if (agenteNome) upd.agenteNome = agenteNome;
    if (agenteNumero) upd.agenteNumero = agenteNumero;

    await repoAtendimento.update(atendimento.id, upd);

    // ✅ invalida cache do cidadão para o bot recarregar status/agente se ele responder
    invalidateSessionCache(numeroCidadao);

    res.json({ ok: true, protocolo });
  } catch (err) {
    console.error("[RECADOS] Erro ao responder:", err);
    res.status(500).json({ error: "Erro ao responder." });
  }
});

/**
 * PATCH /recados/:id/transferir
 */
router.patch("/:id/transferir", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { departamentoId, agenteNome, agenteNumero } = req.body;

    const repo = AppDataSource.getRepository(Atendimento);
    const idcliente = resolveIdCliente(req);

    const atendimento = await repo.findOne({ where: { id, idcliente } as any });
    if (!atendimento) return res.status(404).json({ error: "Não encontrado" });

    const upd: any = { atualizadoEm: new Date() };
    if (departamentoId) upd.departamentoId = departamentoId;
    if (agenteNome) upd.agenteNome = agenteNome;
    if (agenteNumero) upd.agenteNumero = agenteNumero;

    await repo.update(id, upd);

    // ✅ invalida cache para refletir a transferência no bot
    invalidateSessionCache((atendimento as any).cidadaoNumero);

    res.json({ ok: true });
  } catch (err) {
    console.error("[RECADOS] Erro ao transferir:", err);
    res.status(500).json({ error: "Erro ao transferir" });
  }
});

async function concluirHandler(req: Request, res: Response) {
  try {
    const { id } = req.params;

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);
    const idclienteReq = resolveIdCliente(req);

    const atendimento = await repoAtendimento.findOne({
      where: { id, idcliente: idclienteReq } as any,
      relations: ["departamento"],
    });

    if (!atendimento) return res.status(404).json({ error: "Atendimento não encontrado." });

    const idcliente = (atendimento as any).idcliente as number;
    const numeroCidadao = (atendimento as any).cidadaoNumero as string;

    // ✅ Se já está em pesquisa/nota/encerrado, não re-dispara
    const st = String(atendimento.status || "").toUpperCase();
    if (st === "OFFLINE_POST_AGENT_RESPONSE" || st === "OFFLINE_RATING" || st === "FINISHED") {
      return res.json({
        ok: true,
        message: "Atendimento já está em fase de pesquisa/encerramento.",
        protocolo: (atendimento as any).protocolo || null,
        status: atendimento.status,
      });
    }

    const protocolo = await ensureProtocolForSession({
      atendimentoId: atendimento.id,
      protocolo: (atendimento as any).protocolo,
      status: atendimento.status,
    });

    // ✅ muda status e atualiza atualizadoEm
    const novoStatus = "OFFLINE_POST_AGENT_RESPONSE";
    await repoAtendimento.update(atendimento.id, {
      status: novoStatus as AtendimentoStatus,
      atualizadoEm: new Date(),
    } as any);

    // ✅ mensagem padrão clara (o novo aiFlowService trata a resposta)
    const msgSatisfacao =
      `✅ A equipe registrou a conclusão do atendimento (Protocolo: *${protocolo}*).\n\n` +
      `Sua solicitação foi resolvida?\n\n` +
      `1 - Sim, foi resolvida ✅\n` +
      `2 - Não, ainda preciso de ajuda ❌`;

    await sendTextMessage(numeroCidadao, msgSatisfacao, { idcliente });

    // salva no histórico como IA/SISTEMA
    const msgSis = repoMensagem.create({
      idcliente,
      atendimentoId: atendimento.id,
      direcao: "IA",
      tipo: "TEXT",
      conteudoTexto: msgSatisfacao,
      remetenteNumero: "550000000000", // CORREÇÃO: Força numérico aqui também
      comandoDescricao: "Disparo automático de Pesquisa de Satisfação",
    } as any);

    await repoMensagem.save(msgSis);

    // ✅ invalida cache: próxima msg do cidadão cai no status OFFLINE_POST_AGENT_RESPONSE
    invalidateSessionCache(numeroCidadao);

    return res.json({
      ok: true,
      message: "Atendimento marcado como concluído. Pesquisa de satisfação enviada.",
      protocolo,
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao concluir recado:", err);
    return res.status(500).json({ error: "Erro ao concluir recado." });
  }
}

/**
 * PATCH /recados/:id/concluir
 */
router.patch("/:id/concluir", concluirHandler);

/**
 * POST /recados/:id/concluir
 */
router.post("/:id/concluir", concluirHandler);

export default router;