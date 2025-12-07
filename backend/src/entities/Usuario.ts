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
import { Cliente } from "./Cliente";
import { UsuarioDepartamento } from "./UsuarioDepartamento";
import { Atendimento } from "./Atendimento";

export type PerfilUsuario = "ADMIN" | "SUPERVISOR" | "ATENDENTE";

@Entity("usuarios")
export class Usuario {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ type: "varchar", length: 150 })
  nome!: string;

  @Column({ type: "varchar", length: 30, nullable: true })
  telefone?: string | null;

  @Column({ type: "varchar", length: 150, nullable: true })
  email?: string | null;

  @Column({ type: "varchar", length: 50, unique: true })
  login!: string;

  @Column({ name: "senha_hash", type: "varchar", length: 255 })
  senhaHash!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "ATENDENTE",
  })
  perfil!: PerfilUsuario | string;

  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  @ManyToOne(() => Cliente, { eager: true })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;

  // Relacionamentos opcionais (usados em outras partes do sistema)
  @OneToMany(() => UsuarioDepartamento, (ud) => ud.usuario)
  departamentos!: UsuarioDepartamento[];

  @OneToMany(() => Atendimento, (a) => a.agenteNumero)
  atendimentosAgente!: Atendimento[];
}
