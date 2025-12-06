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

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @ManyToOne(() => Usuario, (u) => u.departamentos, { eager: true })
  @JoinColumn({ name: "usuario_id" })
  usuario!: Usuario;

  @Column({ name: "usuario_id", type: "uuid" })
  usuarioId!: string;

  @ManyToOne(() => Departamento, { eager: true })
  @JoinColumn({ name: "departamento_id" })
  departamento!: Departamento;

  @Column({ name: "departamento_id", type: "int" })
  departamentoId!: number;
}
