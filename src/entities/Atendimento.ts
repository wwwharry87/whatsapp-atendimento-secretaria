import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn
} from "typeorm";
import { Departamento } from "./Departamento";

export type AtendimentoStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "FINISHED";

@Entity("atendimentos")
export class Atendimento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "cidadao_numero" })
  cidadaoNumero!: string;

  @Column({ name: "cidadao_nome", nullable: true })
  cidadaoNome?: string;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: "departamento_id" })
  departamento?: Departamento | null;

  @Column({ name: "departamento_id", nullable: true })
  departamentoId?: number | null;

  @Column({ name: "agente_numero", nullable: true })
  agenteNumero?: string;

  @Column({ name: "agente_nome", nullable: true })
  agenteNome?: string;

  @Column({ type: "varchar", length: 50 })
  status!: AtendimentoStatus;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;

  @Column({ name: "encerrado_em", type: "timestamp", nullable: true })
  encerradoEm?: Date | null;
}
