// src/entities/Usuario.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { Departamento } from "./Departamento";
import { Atendimento } from "./Atendimento";
import { UsuarioDepartamento } from "./UsuarioDepartamento";
import { Cliente } from "./Cliente";

export type UsuarioPerfil = "ADMIN" | "GESTOR" | "ATENDENTE";

@Entity("usuarios")
export class Usuario {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @Column({ type: "varchar", length: 150 })
  nome!: string;

  @Column({ type: "varchar", length: 200, unique: true })
  email!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  telefone?: string | null;

  @Column({ name: "senha_hash", type: "varchar", length: 255 })
  senhaHash!: string;

  @Column({ type: "varchar", length: 20 })
  perfil!: UsuarioPerfil;

  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: "departamento_principal_id" })
  departamentoPrincipal?: Departamento | null;

  @Column({
    name: "departamento_principal_id",
    type: "int",
    nullable: true,
  })
  departamentoPrincipalId?: number | null;

  @OneToMany(() => Atendimento, (a) => a.agenteNumero)
  atendimentosAgente!: Atendimento[];

  @OneToMany(() => UsuarioDepartamento, (ud) => ud.usuario)
  departamentos!: UsuarioDepartamento[];

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;
}
