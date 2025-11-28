import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";
import { Departamento } from "../entities/Departamento";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  synchronize: true, // em produção depois trocamos para migrations
  logging: false,
  entities: [Departamento, Atendimento, Mensagem],
  ssl: {
    rejectUnauthorized: false
  }
});
