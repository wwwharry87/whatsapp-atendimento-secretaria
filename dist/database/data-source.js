"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppDataSource = void 0;
require("reflect-metadata");
const typeorm_1 = require("typeorm");
const env_1 = require("../config/env");
const Departamento_1 = require("../entities/Departamento");
const Atendimento_1 = require("../entities/Atendimento");
const Mensagem_1 = require("../entities/Mensagem");
const Usuario_1 = require("../entities/Usuario");
const UsuarioDepartamento_1 = require("../entities/UsuarioDepartamento");
const AtendimentoEvento_1 = require("../entities/AtendimentoEvento");
exports.AppDataSource = new typeorm_1.DataSource({
    type: "postgres",
    host: env_1.env.db.host,
    port: env_1.env.db.port,
    username: env_1.env.db.username,
    password: env_1.env.db.password,
    database: env_1.env.db.database,
    synchronize: true, // depois podemos trocar pra migrations
    logging: false,
    entities: [
        Departamento_1.Departamento,
        Atendimento_1.Atendimento,
        Mensagem_1.Mensagem,
        Usuario_1.Usuario,
        UsuarioDepartamento_1.UsuarioDepartamento,
        AtendimentoEvento_1.AtendimentoEvento
    ],
    ssl: {
        rejectUnauthorized: false
    }
});
