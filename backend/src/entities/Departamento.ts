// src/entities/Departamento.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
} from "typeorm";
import { Cliente } from "./Cliente";
import { Atendimento } from "./Atendimento";
import { UsuarioDepartamento } from "./UsuarioDepartamento";

@Entity("departamentos")
export class Departamento {
  @PrimaryGeneratedColumn()
  id!: number;

  // FK para clientes.id
  @ManyToOne(() => Cliente)
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "integer" })
  idcliente!: number;

  // ATENÇÃO: deixei nullable: true para evitar o erro do NOT NULL no sync
  @Column({ type: "varchar", length: 120, nullable: true })
  nome!: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  descricao?: string | null;

  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  @Column({
    name: "responsavel_nome",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  responsavelNome?: string | null;

  @Column({
    name: "responsavel_numero",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  responsavelNumero?: string | null;

  @CreateDateColumn({ name: "criado_em", type: "timestamptz", nullable: true })
  criadoEm!: Date;

  @UpdateDateColumn({
    name: "atualizado_em",
    type: "timestamptz",
    nullable: true,
  })
  atualizadoEm!: Date;

  @OneToMany(() => Atendimento, (at) => at.departamento)
  atendimentos?: Atendimento[];

  @OneToMany(() => UsuarioDepartamento, (ud) => ud.departamento)
  usuariosDepartamentos?: UsuarioDepartamento[];
}
