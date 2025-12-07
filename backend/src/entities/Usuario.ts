// src/entities/Usuario.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";
import { Cliente } from "./Cliente";

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

  /**
   * Campo de login apenas em memória.
   * NÃO está mapeado como coluna, pois no banco atual não existe "login".
   * Se depois você criar a coluna no banco, a gente volta a mapear.
   */
  login?: string | null;

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
}
