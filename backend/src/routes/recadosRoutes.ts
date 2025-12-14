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
// Importante: Invalida o cache para a IA assumir o controle na próxima mensagem
import { invalidateSessionCache } from "../services/sessionState"; 

const router = Router();

/**
 * Resolve idcliente da requisição (Lógica Multi-tenant)
 */
function resolveIdCliente(req: Request): number {
  const r = req as AuthRequest & { user?: any };

  if (typeof r.idcliente === "number" && !Number.isNaN(Number(r.idcliente))) return Number(r.idcliente);
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
 * Gera protocolo: ATD-YYYYMMDD-XXXXXX
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
 * Garante protocolo no banco
 */
async function ensureProtocolo(atendimento: Atendimento): Promise<string | null> {
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

    // Status que o painel considera como "Recados"
    // Incluímos OFFLINE_POST_AGENT_RESPONSE para o agente ver que está aguardando nota
    let statuses: any[] = [
      "LEAVE_MESSAGE", 
      "LEAVE_MESSAGE_DECISION", 
      "OFFLINE_POST_AGENT_RESPONSE",
      "OFFLINE_RATING" 
    ];

    if (statusParam === "encerrados") {
      statuses = ["FINISHED"];
    } else if (statusParam === "todos") {
      statuses = ["LEAVE_MESSAGE", "LEAVE_MESSAGE_DECISION", "OFFLINE_POST_AGENT_RESPONSE", "OFFLINE_RATING", "FINISHED"];
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
        relations: ["departamento"] 
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado." });
    }

    const mensagens = await repoMensagem.find({
      where: { atendimentoId: id as any, idcliente: idcliente as any },
      order: { criadoEm: "ASC" as any },
    });

    const detalhe = {
      ...atendimento,
      mensagens: mensagens.map((m) => ({
        id: m.id,
        direcao: (m as any).direcao,
        tipo: m.tipo,
        conteudoTexto: m.conteudoTexto,
        criadoEm: (m as any).criadoEm,
        remetenteNumero: (m as any).remetenteNumero,
        mediaUrl: m.mediaUrl, // Importante para o painel mostrar mídia
        mimeType: m.mimeType
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
    const idclienteResolved = resolveIdCliente(req);

    const atendimento = await repoAtendimento.findOne({ 
        where: { id, idcliente: idclienteResolved } as any, 
        relations: ["departamento"] 
    });

    if (!atendimento) return res.status(404).json({ error: "Atendimento não encontrado." });

    const idcliente = (atendimento as any).idcliente;
    const numeroCidadao = atendimento.cidadaoNumero;
    const protocolo = await ensureProtocolo(atendimento);

    // Mensagem de "Aviso de Resposta" (Humanizada)
    const clienteRepo = AppDataSource.getRepository(Cliente);
    const cliente = await clienteRepo.findOne({ where: { id: Number(idcliente) } });
    const org = getOrganizationStyle({ displayName: cliente?.nome ?? null, orgTipo: null });
    
    // Opcional: Se quiser avisar "Chegou recado", descomente abaixo. 
    // Muitas vezes o agente só quer responder direto sem o aviso prévio.
    /*
    const aviso = HumanMessagesService.recadoToCitizen({
      org,
      citizenName: (atendimento as any).cidadaoNome,
      departamentoNome: (atendimento as any).departamento?.nome,
      protocolo: protocolo,
      seed: numeroCidadao,
    });
    await sendTextMessage(numeroCidadao, aviso, { idcliente });
    */

    // Preparar Envio
    let tipoMensagem = "TEXT";
    if (mediaId) {
      if (tipoMidia) tipoMensagem = tipoMidia;
      else if (mimeType?.startsWith("image/")) tipoMensagem = "IMAGE";
      else if (mimeType?.startsWith("audio/")) tipoMensagem = "AUDIO";
      else if (mimeType?.startsWith("video/")) tipoMensagem = "VIDEO";
      else tipoMensagem = "DOCUMENT";
    }

    // Enviar Texto
    if (mensagem && mensagem.trim()) {
      const corpo = agenteNome 
        ? `🧑‍💼 *${agenteNome}*:\n${mensagem.trim()}` 
        : mensagem.trim();
      await sendTextMessage(numeroCidadao, corpo, { idcliente });
    }

    // Enviar Mídia
    if (mediaId) {
      const opts = { idcliente };
      if (tipoMensagem === "IMAGE") await sendImageMessageById(numeroCidadao, mediaId, opts);
      else if (tipoMensagem === "AUDIO") await sendAudioMessageById(numeroCidadao, mediaId, opts);
      else if (tipoMensagem === "VIDEO") await sendVideoMessageById(numeroCidadao, mediaId, opts);
      else await sendDocumentMessageById(numeroCidadao, mediaId, opts);
    }

    // Salvar no Banco
    const msg = repoMensagem.create({
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
      comandoDescricao: "Resposta via Painel"
    } as any);

    await repoMensagem.save(msg);

    // Atualizar dados do agente
    const upd: any = {};
    if (agenteNome) upd.agenteNome = agenteNome;
    if (agenteNumero) upd.agenteNumero = agenteNumero;
    if (Object.keys(upd).length > 0) await repoAtendimento.update(atendimento.id, upd);

    res.json({ ok: true });
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

    const upd: any = {};
    if (departamentoId) upd.departamentoId = departamentoId;
    if (agenteNome) upd.agenteNome = agenteNome;
    if (agenteNumero) upd.agenteNumero = agenteNumero;

    await repo.update(id, upd);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Erro ao transferir" });
  }
});

/**
 * PATCH /recados/:id/concluir
 * * AQUI ESTÁ O SEGREDO DO "TOP DO BRASIL":
 * 1. Não encerra o chamado (FINISHED) ainda.
 * 2. Muda o status para OFFLINE_POST_AGENT_RESPONSE.
 * 3. Envia a pergunta de satisfação para o Cidadão.
 * 4. A IA (aiFlowService) vai ler a resposta e pedir a nota.
 */
router.patch("/:id/concluir", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    // Ignoramos inputs manuais de nota aqui, pois vamos pedir ao cidadão

    const repoAtendimento = AppDataSource.getRepository(Atendimento);
    const repoMensagem = AppDataSource.getRepository(Mensagem);
    const idcliente = resolveIdCliente(req);

    const atendimento = await repoAtendimento.findOne({ 
        where: { id, idcliente } as any,
        relations: ["departamento"]
    });

    if (!atendimento) return res.status(404).json({ error: "Atendimento não encontrado." });

    const protocolo = await ensureProtocolo(atendimento);

    // 1. Mudar Status para iniciar fluxo de Pesquisa
    // Esse status avisa o sessionService que estamos aguardando "Sim/Não"
    const novoStatus = "OFFLINE_POST_AGENT_RESPONSE";

    await repoAtendimento.update(atendimento.id, {
      status: novoStatus as AtendimentoStatus,
      // Não colocamos 'encerradoEm' ainda, só quando a IA finalizar a pesquisa
    });

    // 2. Enviar Pergunta de Satisfação no WhatsApp
    // Texto bem claro e objetivo
    const msgSatisfacao = 
      `✅ A equipe registrou a conclusão do atendimento (Protocolo: *${protocolo}*).\n\n` +
      `Sua solicitação foi resolvida?\n\n` +
      `1 - Sim, foi resolvida ✅\n` +
      `2 - Não, ainda preciso de ajuda ❌`;

    await sendTextMessage(atendimento.cidadaoNumero, msgSatisfacao, {
      idcliente: Number(idcliente),
    });

    // 3. Salvar essa mensagem no histórico (tipo IA/SISTEMA)
    const msgSis = repoMensagem.create({
        idcliente: Number(idcliente),
        atendimentoId: atendimento.id,
        direcao: "IA", // Sistema enviando
        tipo: "TEXT",
        conteudoTexto: msgSatisfacao,
        remetenteNumero: "SISTEMA",
        comandoDescricao: "Disparo automático de Pesquisa de Satisfação"
    } as any);
    await repoMensagem.save(msgSis);

    // 4. INVALIDAR CACHE (Fundamental)
    // Isso obriga o bot a recarregar o atendimento do banco quando o cidadão responder "1" ou "2".
    invalidateSessionCache(atendimento.cidadaoNumero);

    res.json({
      ok: true,
      message: "Atendimento marcado como concluído. Pesquisa de satisfação enviada.",
      protocolo,
    });
  } catch (err) {
    console.error("[RECADOS] Erro ao concluir recado:", err);
    res.status(500).json({ error: "Erro ao concluir recado." });
  }
});

// Suporte a POST também para concluir (alguns frontends usam POST)
router.post("/:id/concluir", async (req, res) => {
    // Reutiliza a lógica do PATCH
    // @ts-ignore
    return router.stack.find(layer => layer.route && layer.route.path === '/:id/concluir' && layer.route.methods.patch).handle(req, res);
});

export default router;