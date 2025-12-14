import "reflect-metadata";
import { DataSource } from "typeorm";
import { env } from "../config/env";
import { Departamento } from "../entities/Departamento";
import { Atendimento } from "../entities/Atendimento";
import { Mensagem } from "../entities/Mensagem";
import { Usuario } from "../entities/Usuario";
import { UsuarioDepartamento } from "../entities/UsuarioDepartamento";
import { AtendimentoEvento } from "../entities/AtendimentoEvento";
import { HorarioAtendimento } from "../entities/HorarioAtendimento";
import { Cliente } from "../entities/Cliente";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: env.db.host,
  port: env.db.port,
  username: env.db.username,
  password: env.db.password,
  database: env.db.database,
  entities: [
    Departamento,
    Atendimento,
    Mensagem,
    Usuario,
    UsuarioDepartamento,
    AtendimentoEvento,
    HorarioAtendimento,
    Cliente,
  ],
  synchronize: true, // usamos a DDL que você já aplicou
  logging: false,
  ssl: {
    rejectUnauthorized: false,
  },
});
