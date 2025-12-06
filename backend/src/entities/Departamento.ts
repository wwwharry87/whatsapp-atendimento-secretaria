// src/entities/Departamento.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Cliente } from "./Cliente";

@Entity("departamentos")
export class Departamento {
  @PrimaryGeneratedColumn()
  id!: number;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @Column({ type: "varchar", length: 120 })
  nome!: string;

  @Column({ name: "responsavel_nome", type: "varchar", length: 120, nullable: true })
  responsavelNome?: string | null;

  @Column({ name: "responsavel_numero", type: "varchar", length: 30, nullable: true })
  responsavelNumero?: string | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;
}
