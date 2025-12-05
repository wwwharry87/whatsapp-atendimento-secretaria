// backend/src/entities/Usuario.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from "typeorm";
import { UsuarioDepartamento } from "./UsuarioDepartamento";

export type UsuarioTipo = "ADMIN" | "GESTOR" | "ATENDENTE";

@Entity("usuarios")
export class Usuario {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @Column({ length: 150 })
  nome!: string;

  @Column({
    name: "telefone_whatsapp",
    type: "varchar",
    length: 30,
    nullable: true,
  })
  telefoneWhatsapp?: string | null;

  @Column({
    type: "varchar",
    length: 150,
    nullable: true,
  })
  email?: string | null;

  @Column({
    name: "login",
    type: "varchar",
    length: 50,
    unique: true,
  })
  login!: string;

  @Column({
    name: "senha_hash",
    type: "varchar",
    length: 255,
  })
  senhaHash!: string;

  @Column({
    type: "varchar",
    length: 20,
    default: "ATENDENTE",
  })
  tipo!: UsuarioTipo;

  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  @OneToMany(() => UsuarioDepartamento, (ud) => ud.usuario)
  departamentos!: UsuarioDepartamento[];

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;
}
