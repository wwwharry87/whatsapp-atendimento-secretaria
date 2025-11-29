// src/index.ts
import express from "express";
import { env } from "./config/env";
import webhookRouter from "./routes/webhook";
import { AppDataSource } from "./database/data-source";
import atendimentosRouter from "./routes/atendimentos";
import mediaRouter from "./routes/media";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API de Atendimento WhatsApp - Secretaria");
});

// Webhook do WhatsApp
app.use("/webhook", webhookRouter);

// Rotas de painel (lista de atendimentos, detalhes, etc.)
app.use("/api", atendimentosRouter);

// Rota para servir mídias (proxy WhatsApp)
app.use("/media", mediaRouter);

async function start() {
  try {
    await AppDataSource.initialize();
    console.log("Conectado ao banco de dados.");

    app.listen(env.port, () => {
      console.log(`Servidor rodando na porta ${env.port}`);
    });
  } catch (err) {
    console.error("Erro ao iniciar a aplicação:", err);
  }
}

start();
