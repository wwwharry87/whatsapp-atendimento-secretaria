// src/routes/painel.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";

const router = Router();

/**
 * Lê o idcliente do header X-Id-Cliente ou da variável
 * de ambiente DEFAULT_CLIENTE_ID. Se nada vier, usa 1.
 *
 * (Mesma lógica utilizada em routes/usuarios.ts)
 */
function getIdClienteFromRequest(req: Request): number {
  const headerVal = (req.headers["x-id-cliente"] || "").toString();
  if (headerVal && !Number.isNaN(Number(headerVal))) {
    return Number(headerVal);
  }
  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !Number.isNaN(Number(envVal))) {
    return Number(envVal);
  }
  return 1;
}

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
async function carregarResumos(idcliente: number) {
  const repo = AppDataSource.getRepository(Atendimento);

  const atendimentos = await repo
    .createQueryBuilder("a")
    .leftJoinAndSelect("a.departamento", "d")
    .where("a.idcliente = :idcliente", { idcliente })
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
      typeof a.tempoPrimeiraRespostaSegundos === "number"
        ? a.tempoPrimeiraRespostaSegundos
        : typeof a.tempo_primeira_resposta_segundos === "number"
        ? a.tempo_primeira_resposta_segundos
        : null;

    return {
      id: a.id,
      protocolo: a.protocolo ?? null,
      cidadao_nome: a.cidadaoNome ?? a.cidadao_nome ?? null,
      cidadao_numero: a.cidadaoNumero ?? a.cidadao_numero ?? "",
      departamento_nome: a.departamento?.nome ?? null,
      agente_nome: a.agenteNome ?? a.agente_nome ?? null,
      status: a.status,
      criado_em: toIsoString(criadoEm)!,
      encerrado_em: encerradoEm ? toIsoString(encerradoEm)! : null,
      foi_resolvido: foiResolvido,
      nota_satisfacao: notaSatisfacao,
      tempo_primeira_resposta_segundos: tempoPrimeiraResposta,
    };
  });
}

/**
 * GET /atendimentos
 * Lista todos os atendimentos em formato de resumo.
 *
 * No index.ts esse router é montado em:
 *   app.use("/", authMiddleware, painelRoutes);
 * Então a URL final que o frontend chama é:
 *   GET /atendimentos
 */
router.get("/atendimentos", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const resumos = await carregarResumos(idcliente);
    res.json(resumos);
  } catch (err) {
    console.error("Erro ao listar atendimentos:", err);
    res.status(500).json({ error: "Erro ao listar atendimentos" });
  }
});

/**
 * GET /dashboard/resumo-atendimentos
 * Mesmo formato de /atendimentos, para o DashboardPage.tsx.
 *
 * No index.ts, esse router também é montado em "/dashboard", então:
 *   GET /dashboard/resumo-atendimentos
 */
router.get(
  "/resumo-atendimentos",
  async (req: Request, res: Response) => {
    try {
      const idcliente = getIdClienteFromRequest(req);
      const resumos = await carregarResumos(idcliente);
      res.json(resumos);
    } catch (err) {
      console.error("Erro ao carregar resumo para dashboard:", err);
      res
        .status(500)
        .json({ error: "Erro ao carregar resumo de atendimentos" });
    }
  }
);

/**
 * GET /atendimentos/:id/mensagens
 * Retorna a linha do tempo de mensagens de um atendimento, com metadados.
 *
 * O AtendimentoDetalhePage.tsx chama exatamente esta URL.
 */
router.get(
  "/atendimentos/:id/mensagens",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idcliente = getIdClienteFromRequest(req);

      const repoAt = AppDataSource.getRepository(Atendimento);
      const repoMsg = AppDataSource.getRepository(Mensagem);

      const atendimento = await repoAt.findOne({
        where: { id, idcliente },
        relations: ["departamento"],
      });

      if (!atendimento) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      const mensagens = await repoMsg
        .createQueryBuilder("m")
        .where("m.atendimento_id = :id", { id })
        .orderBy("m.criado_em", "ASC")
        .getMany();

      const anyA: any = atendimento;

      const criadoEm = anyA.criadoEm ?? anyA.criado_em;
      const encerradoEm = anyA.encerradoEm ?? anyA.encerrado_em ?? null;

      const foiResolvido =
        typeof anyA.foiResolvido === "boolean"
          ? anyA.foiResolvido
          : typeof anyA.foi_resolvido === "boolean"
          ? anyA.foi_resolvido
          : null;

      const tempoPrimeiraResposta =
        typeof anyA.tempoPrimeiraRespostaSegundos === "number"
          ? anyA.tempoPrimeiraRespostaSegundos
          : typeof anyA.tempo_primeira_resposta_segundos === "number"
          ? anyA.tempo_primeira_resposta_segundos
          : null;

      const notaSatisfacao =
        typeof anyA.notaSatisfacao === "number"
          ? anyA.notaSatisfacao
          : typeof anyA.nota_satisfacao === "number"
          ? anyA.nota_satisfacao
          : null;

      const dataMensagens = mensagens.map((m: any) => {
        const criadoEmMsg = m.criadoEm ?? m.criado_em;

        const tipo = m.tipo || "TEXT";
        const texto = m.conteudoTexto ?? m.conteudo_texto ?? null;
        const mediaId = m.whatsappMediaId ?? m.whatsapp_media_id ?? null;
        const mediaUrl = m.mediaUrl ?? m.media_url ?? null;
        const mimeType = m.mimeType ?? m.mime_type ?? null;
        const fileName = m.fileName ?? m.file_name ?? null;
        const fileSize = m.fileSize ?? m.file_size ?? null;

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

        const comandoCodigo =
          m.comandoCodigo ??
          m.comando_codigo ??
          null;

        const comandoDescricao =
          m.comandoDescricao ??
          m.comando_descricao ??
          null;

        const criadoEmIso = toIsoString(criadoEmMsg)!;

        return {
          id: m.id,
          atendimento_id: id,
          tipo,
          texto,
          media_id: mediaId,
          media_url: mediaUrl,
          mime_type: mimeType,
          file_name: fileName,
          file_size: fileSize,
          direcao,
          autor,
          comando_codigo: comandoCodigo,
          comando_descricao: comandoDescricao,
          criado_em: criadoEmIso,
        };
      });

      res.json({
        atendimento: {
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
          encerrado_em: encerradoEm ? toIsoString(encerradoEm)! : null,
          foi_resolvido: foiResolvido,
          nota_satisfacao: notaSatisfacao,
          tempo_primeira_resposta_segundos: tempoPrimeiraResposta,
        },
        mensagens: dataMensagens,
      });
    } catch (err) {
      console.error("Erro ao buscar mensagens do atendimento:", err);
      res
        .status(500)
        .json({ error: "Erro ao buscar mensagens do atendimento" });
    }
  }
);

/**
 * GET /atendimentos/:id
 * Cabeçalho detalhado de um atendimento (usado em AtendimentoDetalhePage.tsx)
 */
router.get(
  "/atendimentos/:id",
  async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const idcliente = getIdClienteFromRequest(req);

      const repo = AppDataSource.getRepository(Atendimento);

      const atendimento = await repo.findOne({
        where: { id, idcliente },
        relations: ["departamento"],
      });

      if (!atendimento) {
        return res.status(404).json({ error: "Atendimento não encontrado" });
      }

      res.json({
        id: atendimento.id,
        protocolo: atendimento.protocolo,
        status: atendimento.status,
        cidadao_nome: atendimento.cidadaoNome,
        cidadao_numero: atendimento.cidadaoNumero,
        departamento_nome: atendimento.departamento?.nome ?? null,
        agente_nome: atendimento.agenteNome ?? null,
        foi_resolvido: atendimento.foiResolvido,
        nota_satisfacao: atendimento.notaSatisfacao,
        criado_em: atendimento.criadoEm,
        encerrado_em: atendimento.encerradoEm,
      });
    } catch (err) {
      console.error("Erro ao buscar cabeçalho do atendimento:", err);
      res.status(500).json({ error: "Erro ao buscar cabeçalho do atendimento" });
    }
  }
);

export default router;
