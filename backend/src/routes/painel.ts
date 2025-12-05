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

      const mensagens = await repo.find({
        where: { atendimento: { id } as any },
        order: { criadoEm: "ASC" },
      });

      const data = mensagens.map((m) => {
        const anyM = m as any;
        return {
          id: m.id,
          tipo: anyM.tipo ?? "TEXT", // TEXT, AUDIO, IMAGE, VIDEO, DOCUMENT
          texto: anyM.conteudoTexto ?? anyM.texto ?? null,
          autor: anyM.autorTipo ?? anyM.origem ?? null, // CIDADÃO / AGENTE / SISTEMA
          direction: anyM.direction ?? null, // IN / OUT (se existir)
          media_id:
            anyM.mediaWhatsappId ??
            anyM.whatsappMediaId ??
            anyM.mediaId ??
            null,
          media_mime: anyM.mediaMimeType ?? null,
          criado_em: m.criadoEm
            ? m.criadoEm.toISOString()
            : new Date().toISOString(),
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
