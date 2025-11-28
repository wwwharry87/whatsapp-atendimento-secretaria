"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listarDepartamentos = listarDepartamentos;
exports.montarMenuDepartamentos = montarMenuDepartamentos;
exports.getDepartamentoPorIndice = getDepartamentoPorIndice;
const data_source_1 = require("../database/data-source");
const Departamento_1 = require("../entities/Departamento");
async function listarDepartamentos() {
    const repo = data_source_1.AppDataSource.getRepository(Departamento_1.Departamento);
    return repo.find({ order: { id: "ASC" } });
}
async function montarMenuDepartamentos() {
    const deps = await listarDepartamentos();
    if (!deps.length) {
        return "Nenhum departamento foi configurado ainda. Entre em contato com o administrador do sistema.";
    }
    let msg = "Selecione o número do Departamento / Setor que deseja falar:\n\n";
    deps.forEach((dep, index) => {
        msg += `${index + 1}. ${dep.nome}\n`;
    });
    msg += "\nDigite apenas o número desejado.";
    return msg;
}
async function getDepartamentoPorIndice(indice) {
    const deps = await listarDepartamentos();
    const dep = deps[indice - 1];
    return dep || null;
}
