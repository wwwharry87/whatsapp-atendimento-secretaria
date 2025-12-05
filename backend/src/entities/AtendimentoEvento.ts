import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    ManyToOne,
    JoinColumn
  } from "typeorm";
  import { Atendimento } from "./Atendimento";
  
  export type EventoAutorTipo = "CITIZEN" | "AGENT" | "SYSTEM";
  
  @Entity("atendimentos_eventos")
  export class AtendimentoEvento {
    @PrimaryGeneratedColumn("uuid")
    id!: string;
  
    @ManyToOne(() => Atendimento, { onDelete: "CASCADE" })
    @JoinColumn({ name: "atendimento_id" })
    atendimento!: Atendimento;
  
    @Column({ name: "atendimento_id" })
    atendimentoId!: string;
  
    @Column({ name: "status_anterior", type: "varchar", length: 50, nullable: true })
    statusAnterior?: string | null;
  
    @Column({ name: "status_novo", type: "varchar", length: 50, nullable: true })
    statusNovo?: string | null;
  
    @Column({ name: "descricao", type: "text", nullable: true })
    descricao?: string | null;
  
    @Column({ name: "autor_tipo", type: "varchar", length: 20 })
    autorTipo!: EventoAutorTipo;
  
    @Column({ name: "autor_identificacao", type: "varchar", length: 150, nullable: true })
    autorIdentificacao?: string | null;
  
    @CreateDateColumn({ name: "criado_em" })
    criadoEm!: Date;
  }
  