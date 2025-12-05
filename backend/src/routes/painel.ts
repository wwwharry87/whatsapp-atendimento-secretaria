// src/routes/painel.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";


const router = Router();

/**
 * Monta a lista de resumos para o painel.
 */
async function carregarResumos() {
  const repo = AppDataSource.getRepository(Atendimento);

  const atendimentos = await repo.find({
    relations: ["departamento"],
    order: { criadoEm: "DESC" },
    take: 200,
  });

  return atendimentos.map((a) => {
    const anyA = a as any;
    return {
      id: a.id,
      protocolo: anyA.protocolo ?? null,
      cidadao_nome: anyA.cidadaoNome ?? null,
      cidadao_numero: anyA.cidadaoNumero ?? "",
      departamento_nome: a.departamento ? a.departamento.nome : null,
      agente_nome: anyA.agenteNome ?? null,
      status: anyA.status,
      criado_em: a.criadoEm.toISOString(),
      encerrado_em: a.encerradoEm ? a.encerradoEm.toISOString() : null,
      foi_resolvido: anyA.foiResolvido ?? null,
      nota_satisfacao: anyA.notaSatisfacao ?? null,
      tempo_primeira_resposta_segundos:
        anyA.tempoPrimeiraRespostaSegundos ?? null,
    };
  });
}

/**
 * GET /atendimentos
 * Lista resumida para a tela "Atendimentos"
 */
router.get("/atendimentos", async (req: Request, res: Response) => {
  try {
    const resumos = await carregarResumos();
    res.json(resumos);
  } catch (err) {
    console.error("Erro ao listar atendimentos:", err);
    res.status(500).json({ error: "Erro ao listar atendimentos" });
  }
});

/**
 * GET /dashboard/resumo-atendimentos
 * Usa a mesma lista da tela de atendimentos.
 */
router.get(
  "/dashboard/resumo-atendimentos",
  async (req: Request, res: Response) => {
    try {
      const resumos = await carregarResumos();
      res.json(resumos);
    } catch (err) {
      console.error("Erro ao montar resumo do dashboard:", err);
      res
        .status(500)
        .json({ error: "Erro ao montar resumo do dashboard" });
    }
  }
);

/**
 * GET /atendimentos/:id
 * Cabeçalho do atendimento (dados gerais).
 */
router.get("/atendimentos/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Atendimento);

    const atendimento = await repo.findOne({
      where: { id },
      relations: ["departamento"],
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado" });
    }

    const anyA = atendimento as any;

    res.json({
      id: atendimento.id,
      protocolo: anyA.protocolo ?? null,
      cidadao_nome: anyA.cidadaoNome ?? null,
      cidadao_numero: anyA.cidadaoNumero ?? "",
      departamento_nome: atendimento.departamento
        ? atendimento.departamento.nome
        : null,
      agente_nome: anyA.agenteNome ?? null,
      status: anyA.status,
      criado_em: atendimento.criadoEm.toISOString(),
      encerrado_em: atendimento.encerradoEm
        ? atendimento.encerradoEm.toISOString()
        : null,
      foi_resolvido: anyA.foiResolvido ?? null,
      nota_satisfacao: anyA.notaSatisfacao ?? null,
    });
  } catch (err) {
    console.error("Erro ao buscar atendimento:", err);
    res.status(500).json({ error: "Erro ao buscar atendimento" });
  }
});

/**
 * GET /atendimentos/:id/mensagens
 * Detalhamento do atendimento: todas as mensagens.
 */
router.get(
    "/atendimentos/:id/mensagens",
    async (req: Request, res: Response) => {
      try {
        const { id } = req.params;
  
        const repo = AppDataSource.getRepository(Mensagem);
  
        // Se na entidade a relação for diferente (ex: atendimentoId), ajuste aqui:
        const mensagens = await repo.find({
          where: { atendimento: { id } as any },
          order: { criadoEm: "ASC" },
        });
  
        const data = mensagens.map((m) => {
          const anyM = m as any;
  
          // Campo real da tabela: direcao = CITIZEN | AGENT
          const direcao: string | null =
            anyM.direcao ?? anyM.direction ?? null;
  
          // Monta um rótulo amigável pra gestão
          let autor: string | null = null;
          if (direcao === "CITIZEN") autor = "CIDADÃO";
          else if (direcao === "AGENT") autor = "AGENTE";
          else if (direcao) autor = direcao;
          // se no futuro tiver mensagens de SISTEMA, dá pra tratar aqui também
  
          // Texto da mensagem: vem de conteudo_texto
          const texto: string | null =
            anyM.conteudoTexto ?? anyM.conteudo_texto ?? anyM.texto ?? null;
  
          // Tipo de mídia
          const tipo: string = (anyM.tipo || "TEXT").toUpperCase();
  
          // IDs de mídia e MIME type
          const mediaId: string | null =
            anyM.whatsappMediaId ??
            anyM.whatsapp_media_id ??
            anyM.mediaId ??
            null;
  
          const mediaMime: string | null =
            anyM.mimeType ?? anyM.mime_type ?? null;
  
          const criadoEm: string = (
            m.criadoEm ?? anyM.criado_em ?? new Date()
          ).toISOString();
  
          return {
            id: m.id,
            tipo,            // TEXT, AUDIO, IMAGE, VIDEO, DOCUMENT
            texto,
            autor,           // "CIDADÃO" ou "AGENTE"
            direction: direcao, // "CITIZEN" ou "AGENT"
            media_id: mediaId,
            media_mime: mediaMime,
            criado_em: criadoEm,
          };
        });
  
        res.json(data);
      } catch (err) {
        console.error("Erro ao listar mensagens do atendimento:", err);
        res
          .status(500)
          .json({ error: "Erro ao listar mensagens do atendimento" });
      }
    }
  );
  

export default router;
