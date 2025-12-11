// src/entities/UsuarioDepartamento.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Usuario } from "./Usuario";
import { Departamento } from "./Departamento";
import { Cliente } from "./Cliente";

@Entity("usuarios_departamentos")
export class UsuarioDepartamento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // 🔹 Usuário que atende naquele departamento
  @ManyToOne(() => Usuario, { eager: true })
  @JoinColumn({ name: "usuario_id" })
  usuario!: Usuario;

  @Column({ name: "usuario_id", type: "uuid" })
  usuarioId!: string;

  // 🔹 Departamento
  @ManyToOne(() => Departamento, { eager: true })
  @JoinColumn({ name: "departamento_id" })
  departamento!: Departamento;

  @Column({ name: "departamento_id", type: "int" })
  departamentoId!: number;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  // 🔹 Se é o agente principal daquele departamento
  @Column({ type: "boolean", default: true })
  principal!: boolean;
}
