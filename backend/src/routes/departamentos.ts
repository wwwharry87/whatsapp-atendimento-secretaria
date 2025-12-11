// src/routes/departamentos.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";
import { UsuarioDepartamento } from "../entities/UsuarioDepartamento";

const router = Router();
const repo = AppDataSource.getRepository(Departamento);
const usuarioDepartamentoRepo = AppDataSource.getRepository(UsuarioDepartamento);

/**
 * Identifica o idcliente a partir da requisição.
 * Prioridade:
 *  - header "x-id-cliente"
 *  - query string "idcliente"
 *  - body.idcliente
 *  - DEFAULT_CLIENTE_ID ou 1
 */
function getIdClienteFromRequest(req: Request): number {
  const headerVal = (req.headers["x-id-cliente"] || "").toString();
  if (headerVal && !isNaN(Number(headerVal))) {
    return Number(headerVal);
  }

  const queryVal = (req.query.idcliente || "").toString();
  if (queryVal && !isNaN(Number(queryVal))) {
    return Number(queryVal);
  }

  const bodyVal = (req.body?.idcliente || "").toString();
  if (bodyVal && !isNaN(Number(bodyVal))) {
    return Number(bodyVal);
  }

  const envVal = process.env.DEFAULT_CLIENTE_ID;
  if (envVal && !isNaN(Number(envVal))) {
    return Number(envVal);
  }

  return 1;
}

/**
 * GET /departamentos
 * Lista departamentos do cliente atual.
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);

    const departamentos = await repo.find({
      where: { idcliente },
      order: { nome: "ASC" },
    });

    const data = departamentos.map((d) => ({
      id: d.id,
      nome: d.nome,
      responsavel_nome: d.responsavelNome ?? "",
      responsavel_numero: d.responsavelNumero ?? "",
      criado_em: d.criadoEm.toISOString(),
      atualizado_em: d.atualizadoEm.toISOString(),
    }));

    res.json(data);
  } catch (err) {
    console.error("Erro ao listar departamentos:", err);
    res.status(500).json({ error: "Erro ao listar departamentos" });
  }
});

/**
 * POST /departamentos
 * Cria um departamento para o cliente atual.
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const { nome, responsavel_nome, responsavel_numero } = req.body;

    if (!nome) {
      return res
        .status(400)
        .json({ error: "O campo nome é obrigatório." });
    }

    const departamento = repo.create({
      idcliente,
      nome,
      responsavelNome: responsavel_nome ?? null,
      responsavelNumero: responsavel_numero ?? null,
    });

    await repo.save(departamento);

    res.status(201).json({
      id: departamento.id,
      nome: departamento.nome,
      responsavel_nome: departamento.responsavelNome ?? "",
      responsavel_numero: departamento.responsavelNumero ?? "",
      criado_em: departamento.criadoEm.toISOString(),
      atualizado_em: departamento.atualizadoEm.toISOString(),
    });
  } catch (err) {
    console.error("Erro ao criar departamento:", err);
    res.status(500).json({ error: "Erro ao criar departamento" });
  }
});

/**
 * PUT /departamentos/:id
 * Atualiza um departamento do cliente atual.
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const departamento = await repo.findOne({ where: { id, idcliente } });
    if (!departamento) {
      return res.status(404).json({ error: "Departamento não encontrado" });
    }

    const { nome, responsavel_nome, responsavel_numero } = req.body;

    if (nome) {
      departamento.nome = nome;
    }
    departamento.responsavelNome =
      responsavel_nome ?? departamento.responsavelNome ?? null;
    departamento.responsavelNumero =
      responsavel_numero ?? departamento.responsavelNumero ?? null;

    await repo.save(departamento);

    res.json({
      id: departamento.id,
      nome: departamento.nome,
      responsavel_nome: departamento.responsavelNome ?? "",
      responsavel_numero: departamento.responsavelNumero ?? "",
      criado_em: departamento.criadoEm.toISOString(),
      atualizado_em: departamento.atualizadoEm.toISOString(),
    });
  } catch (err) {
    console.error("Erro ao atualizar departamento:", err);
    res.status(500).json({ error: "Erro ao atualizar departamento" });
  }
});

/**
 * GET /departamentos/:id/agentes
 * Lista agentes vinculados a um departamento (cliente atual).
 */
router.get("/:id/agentes", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const departamentoId = Number(req.params.id);
    if (Number.isNaN(departamentoId)) {
      return res.status(400).json({ error: "ID de departamento inválido" });
    }

    const relacoes = await usuarioDepartamentoRepo.find({
      where: { idcliente, departamentoId },
      order: { principal: "DESC" },
    });

    const data = relacoes.map((r) => ({
      usuario_id: r.usuarioId,
      nome: r.usuario?.nome ?? "",
      telefone: (r.usuario as any)?.telefone ?? null,
      perfil: (r.usuario as any)?.perfil ?? null,
      principal: r.principal,
    }));

    res.json(data);
  } catch (err) {
    console.error("Erro ao listar agentes do departamento:", err);
    res
      .status(500)
      .json({ error: "Erro ao listar agentes do departamento" });
  }
});

/**
 * POST /departamentos/:id/agentes
 * Define os agentes de um departamento (sobrescreve vínculos antigos do cliente atual).
 * Body esperado:
 * {
 *   agentes: [
 *     { usuario_id: "uuid-do-usuario", principal?: boolean },
 *     ...
 *   ]
 * }
 */
router.post("/:id/agentes", async (req: Request, res: Response) => {
  try {
    const idcliente = getIdClienteFromRequest(req);
    const departamentoId = Number(req.params.id);
    if (Number.isNaN(departamentoId)) {
      return res.status(400).json({ error: "ID de departamento inválido" });
    }

    const { agentes } = req.body as {
      agentes: { usuario_id: string; principal?: boolean }[];
    };

    if (!Array.isArray(agentes)) {
      return res
        .status(400)
        .json({ error: "Campo 'agentes' deve ser um array." });
    }

    // Remove vínculos antigos deste departamento para este cliente
    await usuarioDepartamentoRepo.delete({ idcliente, departamentoId });

    const novasRelacoes: UsuarioDepartamento[] = [];

    for (const ag of agentes) {
      if (!ag.usuario_id) continue;

      const rel = usuarioDepartamentoRepo.create({
        idcliente,
        departamentoId,
        usuarioId: ag.usuario_id,
        principal: !!ag.principal,
      });

      novasRelacoes.push(await usuarioDepartamentoRepo.save(rel));
    }

    const data = novasRelacoes.map((r) => ({
      usuario_id: r.usuarioId,
      nome: r.usuario?.nome ?? "",
      telefone: (r.usuario as any)?.telefone ?? null,
      perfil: (r.usuario as any)?.perfil ?? null,
      principal: r.principal,
    }));

    res.json(data);
  } catch (err) {
    console.error("Erro ao salvar agentes do departamento:", err);
    res
      .status(500)
      .json({ error: "Erro ao salvar agentes do departamento" });
  }
});

export default router;
