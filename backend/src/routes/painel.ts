// src/routes/painel.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Atendimento } from "../entities/Atendimento";

const router = Router();

/**
 * Monta a lista de resumos para o painel.
 * É o formato que o frontend espera em:
 * - /atendimentos
 * - /dashboard/resumo-atendimentos
 */
async function carregarResumos() {
  const repo = AppDataSource.getRepository(Atendimento);

  const atendimentos = await repo.find({
    relations: ["departamento"],
    order: { criadoEm: "DESC" },
    take: 200 // limita pra não explodir a tela
  });

  return atendimentos.map((a) => {
    // alguns campos vêm direto da entidade, outros são opcionais
    return {
      id: a.id,
      protocolo: (a as any).protocolo ?? null,
      cidadao_nome: (a as any).cidadaoNome ?? null,
      cidadao_numero: (a as any).cidadaoNumero ?? "",
      departamento_nome: a.departamento ? a.departamento.nome : null,
      agente_nome: (a as any).agenteNome ?? null,
      status: (a as any).status,
      criado_em: a.criadoEm.toISOString(),
      encerrado_em: a.encerradoEm ? a.encerradoEm.toISOString() : null,
      foi_resolvido: (a as any).foiResolvido ?? null,
      nota_satisfacao: (a as any).notaSatisfacao ?? null,
      tempo_primeira_resposta_segundos: null // podemos calcular depois
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
 * Usa a mesma lista da tela de atendimentos,
 * e o frontend calcula os cards (ativos, fila, concluídos, etc.)
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

export default router;
