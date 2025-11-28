import express from "express";
import { env } from "./config/env";
import webhookRouter from "./routes/webhook";
import { AppDataSource } from "./database/data-source";
import atendimentosRouter from "./routes/atendimentos";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API de Atendimento WhatsApp - Secretaria");
});

// Webhook em /webhook
app.use("/webhook", webhookRouter);

// Rotas de painel
app.use("/api", atendimentosRouter);

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
