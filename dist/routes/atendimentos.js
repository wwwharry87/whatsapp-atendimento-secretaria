"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const data_source_1 = require("../database/data-source");
const Atendimento_1 = require("../entities/Atendimento");
const Mensagem_1 = require("../entities/Mensagem");
const AtendimentoEvento_1 = require("../entities/AtendimentoEvento");
const router = (0, express_1.Router)();
/**
 * GET /atendimentos
 * Lista atendimentos com filtros e paginação
 * Query params:
 *  - page (default 1)
 *  - limit (default 20)
 *  - status
 *  - departamentoId
 *  - protocolo
 *  - cidadaoNome
 *  - telefone
 */
router.get("/atendimentos", async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(Atendimento_1.Atendimento);
        const { page = "1", limit = "20", status, departamentoId, protocolo, cidadaoNome, telefone } = req.query;
        const pageNum = Math.max(parseInt(page || "1", 10), 1);
        const pageSize = Math.min(Math.max(parseInt(limit || "20", 10), 1), 100);
        const qb = repo
            .createQueryBuilder("a")
            .leftJoinAndSelect("a.departamento", "d")
            .orderBy("a.criado_em", "DESC")
            .skip((pageNum - 1) * pageSize)
            .take(pageSize);
        if (status) {
            qb.andWhere("a.status = :status", { status });
        }
        if (departamentoId) {
            qb.andWhere("a.departamento_id = :departamentoId", {
                departamentoId: Number(departamentoId)
            });
        }
        if (protocolo) {
            qb.andWhere("a.protocolo ILIKE :protocolo", {
                protocolo: `%${protocolo}%`
            });
        }
        if (cidadaoNome) {
            qb.andWhere("a.cidadao_nome ILIKE :cidadaoNome", {
                cidadaoNome: `%${cidadaoNome}%`
            });
        }
        if (telefone) {
            qb.andWhere("a.cidadao_numero ILIKE :telefone", {
                telefone: `%${telefone}%`
            });
        }
        const [items, total] = await qb.getManyAndCount();
        res.json({
            page: pageNum,
            limit: pageSize,
            total,
            items
        });
    }
    catch (err) {
        console.error("Erro ao listar atendimentos:", err);
        res.status(500).json({ error: "Erro ao listar atendimentos" });
    }
});
/**
 * GET /atendimentos/:id
 * Detalhe de um atendimento
 */
router.get("/atendimentos/:id", async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(Atendimento_1.Atendimento);
        const { id } = req.params;
        const atendimento = await repo.findOne({
            where: { id },
            relations: ["departamento"]
        });
        if (!atendimento) {
            return res.status(404).json({ error: "Atendimento não encontrado" });
        }
        res.json(atendimento);
    }
    catch (err) {
        console.error("Erro ao buscar atendimento:", err);
        res.status(500).json({ error: "Erro ao buscar atendimento" });
    }
});
/**
 * GET /atendimentos/protocolo/:protocolo
 * Buscar atendimento por número de protocolo
 */
router.get("/atendimentos/protocolo/:protocolo", async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(Atendimento_1.Atendimento);
        const { protocolo } = req.params;
        const atendimento = await repo.findOne({
            where: { protocolo },
            relations: ["departamento"]
        });
        if (!atendimento) {
            return res.status(404).json({ error: "Atendimento não encontrado" });
        }
        res.json(atendimento);
    }
    catch (err) {
        console.error("Erro ao buscar atendimento por protocolo:", err);
        res.status(500).json({ error: "Erro ao buscar atendimento por protocolo" });
    }
});
/**
 * GET /atendimentos/:id/mensagens
 * Lista mensagens de um atendimento em ordem cronológica
 */
router.get("/atendimentos/:id/mensagens", async (req, res) => {
    try {
        const { id } = req.params;
        const repoMsg = data_source_1.AppDataSource.getRepository(Mensagem_1.Mensagem);
        const mensagens = await repoMsg.find({
            where: { atendimentoId: id },
            order: { criadoEm: "ASC" }
        });
        res.json(mensagens);
    }
    catch (err) {
        console.error("Erro ao listar mensagens do atendimento:", err);
        res
            .status(500)
            .json({ error: "Erro ao listar mensagens do atendimento" });
    }
});
/**
 * GET /atendimentos/:id/eventos
 * Linha do tempo de eventos do atendimento
 */
router.get("/atendimentos/:id/eventos", async (req, res) => {
    try {
        const { id } = req.params;
        const repoEvt = data_source_1.AppDataSource.getRepository(AtendimentoEvento_1.AtendimentoEvento);
        const eventos = await repoEvt.find({
            where: { atendimentoId: id },
            order: { criadoEm: "ASC" }
        });
        res.json(eventos);
    }
    catch (err) {
        console.error("Erro ao listar eventos do atendimento:", err);
        res.status(500).json({ error: "Erro ao listar eventos do atendimento" });
    }
});
/**
 * GET /dashboard/resumo
 * Indicadores básicos para painel
 * Query:
 *  - dataInicio (YYYY-MM-DD)
 *  - dataFim (YYYY-MM-DD)
 */
router.get("/dashboard/resumo", async (req, res) => {
    try {
        const repo = data_source_1.AppDataSource.getRepository(Atendimento_1.Atendimento);
        const { dataInicio, dataFim } = req.query;
        const qb = repo.createQueryBuilder("a");
        if (dataInicio) {
            qb.andWhere("a.criado_em >= :dataInicio", { dataInicio });
        }
        if (dataFim) {
            qb.andWhere("a.criado_em <= :dataFim", { dataFim: `${dataFim} 23:59:59` });
        }
        const total = await qb.getCount();
        const porStatus = await repo
            .createQueryBuilder("a")
            .select("a.status", "status")
            .addSelect("COUNT(*)", "quantidade")
            .groupBy("a.status")
            .getRawMany();
        const porDepartamento = await repo
            .createQueryBuilder("a")
            .leftJoin("a.departamento", "d")
            .select("COALESCE(d.nome, 'Sem setor')", "departamento")
            .addSelect("COUNT(*)", "quantidade")
            .groupBy("d.nome")
            .getRawMany();
        res.json({
            totalAtendimentos: total,
            porStatus,
            porDepartamento
        });
    }
    catch (err) {
        console.error("Erro ao montar resumo do dashboard:", err);
        res.status(500).json({ error: "Erro ao montar resumo do dashboard" });
    }
});
exports.default = router;
