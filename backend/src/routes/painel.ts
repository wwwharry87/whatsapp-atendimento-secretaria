// src/routes/painel.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";

const router = Router();

/**
 * Converte um objeto Date ou string para ISO string.
 */
function toIsoString(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toISOString();
  } catch {
    return String(value);
  }
}

/**
 * Carrega a lista de atendimentos em formato de resumo,
 * usada tanto na listagem quanto no dashboard.
 */
async function carregarResumos() {
  const repo = AppDataSource.getRepository(Atendimento);

  const atendimentos = await repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .orderBy("a.criado_em", "DESC")
    .getMany();

  return atendimentos.map((a: any) => {
    const criadoEm = a.criadoEm ?? a.criado_em;
    const encerradoEm = a.encerradoEm ?? a.encerrado_em ?? null;

    const foiResolvido =
      typeof a.foiResolvido === "boolean"
        ? a.foiResolvido
        : typeof a.foi_resolvido === "boolean"
        ? a.foi_resolvido
        : null;

    const notaSatisfacao =
      typeof a.notaSatisfacao === "number"
        ? a.notaSatisfacao
        : typeof a.nota_satisfacao === "number"
        ? a.nota_satisfacao
        : null;

    const tempoPrimeiraResposta =
      a.tempoPrimeiraRespostaSegundos ??
      a.tempo_primeira_resposta_segundos ??
      null;

    return {
      id: a.id,
      protocolo: a.protocolo ?? null,
      cidadao_nome: a.cidadaoNome ?? a.cidadao_nome ?? null,
      cidadao_numero: a.cidadaoNumero ?? a.cidadao_numero ?? "",
      departamento_nome: a.departamento?.nome ?? null,
      agente_nome: a.agenteNome ?? a.agente_nome ?? null,
      status: a.status,
      criado_em: toIsoString(criadoEm)!,
      encerrado_em: encerradoEm ? toIsoString(encerradoEm) : null,
      foi_resolvido: foiResolvido,
      nota_satisfacao: notaSatisfacao,
      tempo_primeira_resposta_segundos: tempoPrimeiraResposta,
    };
  });
}

/**
 * GET /atendimentos
 * Lista de atendimentos em formato de resumo.
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
 * Mesmo formato de /atendimentos, para o DashboardPage.tsx.
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
router.get('/atendimentos/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const repo = AppDataSource.getRepository(Atendimento);

    const atendimento = await repo.findOne({
      where: { id },
      relations: ["departamento"],
    });

    if (!atendimento) {
      return res.status(404).json({ error: "Atendimento não encontrado" });
    }

    const anyA: any = atendimento;
    const criadoEm = anyA.criadoEm ?? anyA.criado_em;
    const encerradoEm = anyA.encerradoEm ?? anyA.encerrado_em ?? null;

    const foiResolvido =
      typeof anyA.foiResolvido === "boolean"
        ? anyA.foiResolvido
        : typeof anyA.foi_resolvido === "boolean"
        ? anyA.foi_resolvido
        : null;

    const notaSatisfacao =
      typeof anyA.notaSatisfacao === "number"
        ? anyA.notaSatisfacao
        : typeof anyA.nota_satisfacao === "number"
        ? anyA.nota_satisfacao
        : null;

    res.json({
      id: anyA.id,
      protocolo: anyA.protocolo ?? null,
      cidadao_nome: anyA.cidadaoNome ?? anyA.cidadao_nome ?? null,
      cidadao_numero: anyA.cidadaoNumero ?? anyA.cidadao_numero ?? "",
      departamento_nome: atendimento.departamento
        ? atendimento.departamento.nome
        : null,
      agente_nome: anyA.agenteNome ?? anyA.agente_nome ?? null,
      status: anyA.status,
      criado_em: toIsoString(criadoEm)!,
      encerrado_em: encerradoEm ? toIsoString(encerradoEm) : null,
      foi_resolvido: foiResolvido,
      nota_satisfacao: notaSatisfacao,
    });
  } catch (err) {
    console.error("Erro ao buscar cabeçalho do atendimento:", err);
    res.status(500).json({ error: "Erro ao buscar atendimento" });
  }
});

/**
 * GET /atendimentos/:id/mensagens
 * Histórico de mensagens do atendimento (usado no AtendimentoDetalhePage.tsx).
 * Agora já devolvendo comando_codigo e comando_descricao.
 */
router.get(
  "/atendimentos/:id/mensagens",
  async (req: Request, res: Response) => {
    try {
      const id = String(req.params.id);
      const repo = AppDataSource.getRepository(Mensagem);

      const mensagens = await repo.find({
        where: { atendimentoId: id },
        order: { criadoEm: "ASC" },
      });

      const data = mensagens.map((m: any) => {
        const tipo = m.tipo || "TEXT";
        const texto = m.conteudoTexto ?? null;
        const mediaId = m.whatsappMediaId ?? null;
        const mediaMime = m.mimeType ?? null;

        // Direção e autor (CIDADÃO / AGENTE / SISTEMA)
        const direcao = String(m.direcao || "").toUpperCase();
        let autor = "CIDADÃO";

        if (direcao === "AGENT") {
          autor = "AGENTE";
        }

        if (
          m.remetenteNumero &&
          String(m.remetenteNumero).toUpperCase().includes("SIST")
        ) {
          autor = "SISTEMA";
        }

        // Metadados de comando
        const comandoCodigo =
          m.comandoCodigo ??
          m.comando_codigo ??
          null;

        const comandoDescricao =
          m.comandoDescricao ??
          m.comando_descricao ??
          null;

        const criadoEm = m.criadoEm ?? m.criado_em;

        return {
          id: m.id,
          tipo,
          texto,
          autor,
          direction: direcao || null,
          media_id: mediaId,
          media_mime: mediaMime,
          comando_codigo: comandoCodigo,
          comando_descricao: comandoDescricao,
          criado_em: toIsoString(criadoEm)!,
        };
      });

      res.json(data);
    } catch (err) {
      console.error("Erro ao buscar mensagens do atendimento:", err);
      res
        .status(500)
        .json({ error: "Erro ao buscar mensagens do atendimento" });
    }
  }
);

export default router;
