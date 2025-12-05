import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn
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

  @Column({ name: "whatsapp_message_id", nullable: true })
  whatsappMessageId?: string;

  @Column({ name: "whatsapp_media_id", nullable: true })
  whatsappMediaId?: string;

  @Column({ name: "media_url", nullable: true })
  mediaUrl?: string;

  @Column({ name: "mime_type", nullable: true })
  mimeType?: string;

  @Column({ name: "file_name", nullable: true })
  fileName?: string;

  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize?: string | null;

  @Column({ name: "remetente_numero" })
  remetenteNumero!: string;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;
}
