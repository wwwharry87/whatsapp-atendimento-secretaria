// src/entities/Mensagem.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { Atendimento } from "./Atendimento";

export type MensagemDirecao = "CITIZEN" | "AGENT";
export type MensagemTipo =
  | "TEXT"
  | "IMAGE"
  | "AUDIO"
  | "VIDEO"
  | "DOCUMENT"
  | "OUTRO";

@Entity("mensagens")
export class Mensagem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @ManyToOne(() => Atendimento, { nullable: false })
  @JoinColumn({ name: "atendimento_id" })
  atendimento!: Atendimento;

  @Column({ name: "atendimento_id" })
  atendimentoId!: string;

  @Column({ type: "varchar", length: 20 })
  direcao!: MensagemDirecao;

  @Column({ type: "varchar", length: 20 })
  tipo!: MensagemTipo;

  @Column({ name: "conteudo_texto", type: "text", nullable: true })
  conteudoTexto?: string | null;

  @Column({ name: "whatsapp_message_id", type: "varchar", nullable: true })
  whatsappMessageId?: string | null;

  @Column({ name: "whatsapp_media_id", type: "varchar", nullable: true })
  whatsappMediaId?: string | null;

  @Column({ name: "media_url", type: "varchar", nullable: true })
  mediaUrl?: string | null;

  @Column({ name: "mime_type", type: "varchar", nullable: true })
  mimeType?: string | null;

  @Column({ name: "file_name", type: "varchar", nullable: true })
  fileName?: string | null;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize?: string | null;

  @Column({ name: "remetente_numero", type: "varchar" })
  remetenteNumero!: string;

  // 👇 novos campos pros comandos (1 = falar com agente, 2 = encerrar, nota etc.)
  @Column({
    name: "comando_codigo",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  comandoCodigo?: string | null;

  @Column({
    name: "comando_descricao",
    type: "text",
    nullable: true,
  })
  comandoDescricao?: string | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;
}
