"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const env_1 = require("./config/env");
const webhook_1 = __importDefault(require("./routes/webhook"));
const data_source_1 = require("./database/data-source");
const atendimentos_1 = __importDefault(require("./routes/atendimentos"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.get("/", (req, res) => {
    res.send("API de Atendimento WhatsApp - Secretaria");
});
// Webhook do WhatsApp
app.use("/", webhook_1.default);
// Rotas de gestão / painel
app.use("/api", atendimentos_1.default);
async function start() {
    try {
        await data_source_1.AppDataSource.initialize();
        console.log("Conectado ao banco de dados.");
        app.listen(env_1.env.port, () => {
            console.log(`Servidor rodando na porta ${env_1.env.port}`);
        });
    }
    catch (err) {
        console.error("Erro ao iniciar a aplicação:", err);
    }
}
start();
