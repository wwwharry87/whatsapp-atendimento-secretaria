// src/entities/HorarioAtendimento.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Departamento } from "./Departamento";
import { Cliente } from "./Cliente";

@Entity("horarios_atendimento")
export class HorarioAtendimento {
  @PrimaryGeneratedColumn()
  id!: number;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @ManyToOne(() => Departamento, { nullable: true })
  @JoinColumn({ name: "departamento_id" })
  departamento?: Departamento | null;

  @Column({ name: "departamento_id", type: "int", nullable: true })
  departamentoId?: number | null;

  // JSON com array de dias ["SEG","TER",...]
  @Column({ name: "dias_semana", type: "text" })
  diasSemana!: string;

  @Column({ type: "varchar", length: 5 })
  inicio!: string; // HH:mm

  @Column({ type: "varchar", length: 5 })
  fim!: string; // HH:mm

  @Column({ type: "boolean", default: true })
  ativo!: boolean;
}
