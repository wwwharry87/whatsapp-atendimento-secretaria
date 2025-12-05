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

export type AtendimentoStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"               // 👈 NOVO STATUS
  | "ASK_ANOTHER_DEPARTMENT"   // cidadão decide outro setor ou encerrar
  | "LEAVE_MESSAGE_DECISION"   // perguntando se quer deixar recado
  | "LEAVE_MESSAGE"            // modo recado, registrando mensagens
  | "FINISHED";

@Entity("atendimentos")
export class Atendimento {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ name: "cidadao_numero", type: "varchar", length: 20 })
  cidadaoNumero!: string;

  @Column({
    name: "cidadao_nome",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  cidadaoNome?: string | null;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: "departamento_id" })
  departamento?: Departamento | null;

  @Column({ name: "departamento_id", type: "int", nullable: true })
  departamentoId?: number | null;

  @Column({ name: "agente_numero", type: "varchar", length: 20, nullable: true })
  agenteNumero?: string | null;

  @Column({
    name: "agente_nome",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  agenteNome?: string | null;

  @Column({ type: "varchar", length: 50 })
  status!: AtendimentoStatus;

  // número de protocolo para futura consulta
  @Column({
    name: "protocolo",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  protocolo?: string | null;

  // se o cidadão informou se foi resolvido (pesquisa de satisfação)
  @Column({
    name: "foi_resolvido",
    type: "boolean",
    nullable: true,
  })
  foiResolvido?: boolean | null;

  // nota de satisfação (1 a 5)
  @Column({
    name: "nota_satisfacao",
    type: "int",
    nullable: true,
  })
  notaSatisfacao?: number | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;

  @Column({ name: "encerrado_em", type: "timestamp", nullable: true })
  encerradoEm?: Date | null;
}
