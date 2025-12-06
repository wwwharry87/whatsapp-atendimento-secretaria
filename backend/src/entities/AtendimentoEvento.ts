// src/entities/AtendimentoEvento.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Atendimento } from "./Atendimento";
import { Cliente } from "./Cliente";

@Entity("atendimentos_eventos")
export class AtendimentoEvento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @ManyToOne(() => Atendimento, { nullable: false })
  @JoinColumn({ name: "atendimento_id" })
  atendimento!: Atendimento;

  @Column({ name: "atendimento_id", type: "uuid" })
  atendimentoId!: string;

  @Column({ type: "varchar", length: 50 })
  tipo!: string;

  @Column({ type: "text", nullable: true })
  detalhe?: string | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;
}
