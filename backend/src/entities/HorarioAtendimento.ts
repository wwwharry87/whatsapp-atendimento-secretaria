// src/entities/HorarioAtendimento.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn
  } from "typeorm";
  import { Departamento } from "./Departamento";
  
  @Entity("horarios_atendimento")
  export class HorarioAtendimento {
    @PrimaryGeneratedColumn()
    id!: number;
  
    @ManyToOne(() => Departamento, { nullable: true })
    @JoinColumn({ name: "departamento_id" })
    departamento?: Departamento | null;
  
    @Column({ name: "departamento_id", type: "int", nullable: true })
    departamentoId?: number | null;
  
    // armazenamos como string "SEG,TER,QUA"
    @Column({ name: "dias_semana", type: "text" })
    diasSemana!: string;
  
    @Column({ name: "inicio", type: "varchar", length: 5 })
    inicio!: string; // "HH:mm"
  
    @Column({ name: "fim", type: "varchar", length: 5 })
    fim!: string; // "HH:mm"
  
    @Column({ name: "ativo", type: "boolean", default: true })
    ativo!: boolean;
  
    @CreateDateColumn({ name: "criado_em" })
    criadoEm!: Date;
  
    @UpdateDateColumn({ name: "atualizado_em" })
    atualizadoEm!: Date;
  }
  