// src/entities/Atendimento.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Departamento } from "./Departamento";
import { Cliente } from "./Cliente";

export type AtendimentoStatus =
  | "ASK_NAME"
  | "ASK_PROFILE"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
  | "OFFLINE_POST_AGENT_RESPONSE" // <--- ADICIONADO: Fluxo pós-conclusão do painel
  | "OFFLINE_RATING"              // <--- ADICIONADO: Coleta de nota pela IA
  | "ASK_SATISFACTION_RESOLUTION"
  | "ASK_SATISFACTION_RATING"
  | "FINISHED";

@Entity("atendimentos")
export class Atendimento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @Column({ name: "cidadao_numero", type: "varchar", length: 20 })
  cidadaoNumero!: string;

  @Column({ name: "cidadao_nome", type: "varchar", length: 200, nullable: true })
  cidadaoNome?: string | null;

  @Column({ name: "protocolo", type: "varchar", length: 50, nullable: true })
  protocolo?: string | null;

  @Column({ name: "status", type: "varchar", length: 50 })
  status!: AtendimentoStatus;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: "departamento_id" })
  departamento?: Departamento | null;

  @Column({ name: "departamento_id", type: "int", nullable: true })
  departamentoId?: number | null;

  @Column({ name: "agente_numero", type: "varchar", length: 30, nullable: true })
  agenteNumero?: string | null;

  @Column({ name: "agente_nome", type: "varchar", length: 200, nullable: true })
  agenteNome?: string | null;

  @Column({ name: "foi_resolvido", type: "boolean", nullable: true })
  foiResolvido?: boolean | null;

  @Column({ name: "nota_satisfacao", type: "int", nullable: true })
  notaSatisfacao?: number | null;

  @Column({
    name: "tempo_primeira_resposta_segundos",
    type: "int",
    nullable: true,
  })
  tempoPrimeiraRespostaSegundos?: number | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;

  @Column({ name: "encerrado_em", type: "timestamp", nullable: true })
  encerradoEm?: Date | null;
}