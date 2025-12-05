// src/routes/departamentos.ts
import { Router, Request, Response } from "express";
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";

const router = Router();
const repo = AppDataSource.getRepository(Departamento);

/**
 * GET /departamentos
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const departamentos = await repo.find({
      order: { nome: "ASC" }
    });

    const data = departamentos.map((d) => ({
      id: d.id,
      nome: d.nome,
      responsavel_nome: d.responsavelNome ?? "",
      responsavel_numero: d.responsavelNumero ?? "",
      criado_em: d.criadoEm.toISOString(),
      atualizado_em: d.atualizadoEm.toISOString()
    }));

    res.json(data);
  } catch (err) {
    console.error("Erro ao listar departamentos:", err);
    res.status(500).json({ error: "Erro ao listar departamentos" });
  }
});

/**
 * POST /departamentos
 */
router.post("/", async (req: Request, res: Response) => {
  try {
    const { nome, responsavel_nome, responsavel_numero } = req.body;

    if (!nome) {
      return res
        .status(400)
        .json({ error: "O campo nome é obrigatório." });
    }

    const departamento = repo.create({
      nome,
      responsavelNome: responsavel_nome ?? null,
      responsavelNumero: responsavel_numero ?? null
    });

    await repo.save(departamento);

    res.status(201).json({
      id: departamento.id,
      nome: departamento.nome,
      responsavel_nome: departamento.responsavelNome ?? "",
      responsavel_numero: departamento.responsavelNumero ?? "",
      criado_em: departamento.criadoEm.toISOString(),
      atualizado_em: departamento.atualizadoEm.toISOString()
    });
  } catch (err) {
    console.error("Erro ao criar departamento:", err);
    res.status(500).json({ error: "Erro ao criar departamento" });
  }
});

/**
 * PUT /departamentos/:id
 */
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const departamento = await repo.findOne({ where: { id } });
    if (!departamento) {
      return res.status(404).json({ error: "Departamento não encontrado" });
    }

    const { nome, responsavel_nome, responsavel_numero } = req.body;

    if (nome) departamento.nome = nome;
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
      atualizado_em: departamento.atualizadoEm.toISOString()
    });
  } catch (err) {
    console.error("Erro ao atualizar departamento:", err);
    res.status(500).json({ error: "Erro ao atualizar departamento" });
  }
});

export default router;
