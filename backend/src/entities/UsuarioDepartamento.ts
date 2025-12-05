import {
    Entity,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    Column
  } from "typeorm";
  import { Usuario } from "./Usuario";
  import { Departamento } from "./Departamento";
  
  @Entity("usuarios_departamentos")
  export class UsuarioDepartamento {
    @PrimaryGeneratedColumn("uuid")
    id!: string;
  
    @ManyToOne(() => Usuario, (u) => u.departamentos, { eager: true })
    @JoinColumn({ name: "usuario_id" })
    usuario!: Usuario;
  
    @Column({ name: "usuario_id", type: "uuid" })
    usuarioId!: string;
  
    @ManyToOne(() => Departamento, { eager: true })
    @JoinColumn({ name: "departamento_id" })
    departamento!: Departamento;
  
    @Column({ name: "departamento_id", type: "int" })
    departamentoId!: number;
  
    @Column({ type: "boolean", default: true })
    principal!: boolean;
  }
  