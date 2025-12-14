// src/entities/Mensagem.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Check,
} from "typeorm";
import { Atendimento } from "./Atendimento";
import { Cliente } from "./Cliente";

export type MensagemDirecao = "CITIZEN" | "AGENT" | "IA";
export type MensagemTipo =
  | "TEXT"
  | "IMAGE"
  | "AUDIO"
  | "VIDEO"
  | "DOCUMENT"
  | "OUTRO";

/**
 * Regras fortes:
 * - Garante idempotência por (idcliente + whatsapp_message_id) quando houver whatsapp_message_id
 * - Índices para performance em timeline/conversas
 */
@Index("IDX_mensagens_atendimento_id", ["atendimentoId"])
@Index("IDX_mensagens_idcliente_criado_em", ["idcliente", "criadoEm"])
@Index("IDX_mensagens_whatsapp_media_id", ["idcliente", "whatsappMediaId"])
// UNIQUE parcial (Postgres): não permite duplicar msgId por cliente
@Index("UQ_mensagens_idcliente_whatsapp_message_id", ["idcliente", "whatsappMessageId"], {
  unique: true,
  where: `"whatsapp_message_id" IS NOT NULL`,
})
@Check(
  "CK_mensagens_direcao_valida",
  `"direcao" IN ('CITIZEN','AGENT','IA')`
)
@Check(
  "CK_mensagens_tipo_valido",
  `"tipo" IN ('TEXT','IMAGE','AUDIO','VIDEO','DOCUMENT','OUTRO')`
)
@Entity("mensagens")
export class Mensagem {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  // 🔹 Cliente (multi-tenant)
  @ManyToOne(() => Cliente, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "idcliente" })
  cliente!: Cliente;

  @Column({ name: "idcliente", type: "int" })
  idcliente!: number;

  @ManyToOne(() => Atendimento, { nullable: false, onDelete: "CASCADE" })
  @JoinColumn({ name: "atendimento_id" })
  atendimento!: Atendimento;

  @Column({ name: "atendimento_id", type: "uuid" })
  atendimentoId!: string;

  @Column({ type: "varchar", length: 20 })
  direcao!: MensagemDirecao;

  @Column({ type: "varchar", length: 20 })
  tipo!: MensagemTipo;

  @Column({ name: "conteudo_texto", type: "text", nullable: true })
  conteudoTexto?: string | null;

  // ids do WhatsApp podem ser longos — coloquei um tamanho mais seguro
  @Column({ name: "whatsapp_message_id", type: "varchar", length: 128, nullable: true })
  whatsappMessageId?: string | null;

  @Column({ name: "whatsapp_media_id", type: "varchar", length: 128, nullable: true })
  whatsappMediaId?: string | null;

  @Column({ name: "media_url", type: "text", nullable: true })
  mediaUrl?: string | null;

  @Column({ name: "mime_type", type: "varchar", length: 100, nullable: true })
  mimeType?: string | null;

  @Column({ name: "file_name", type: "varchar", length: 255, nullable: true })
  fileName?: string | null;

  // bigint no Postgres -> aqui mantenho string (compatível), mas o ideal é number se você nunca passa valores enormes
  @Column({ name: "file_size", type: "bigint", nullable: true })
  fileSize?: string | null;

  // 👇 IMPORTANTÍSSIMO:
  // Se você já tem dados antigos com NULL aqui, o "synchronize" pode falhar ao aplicar NOT NULL.
  // A correção ideal é um UPDATE no banco antes (te passei abaixo).
  @Column({ name: "remetente_numero", type: "varchar", length: 30, nullable: false })
  remetenteNumero!: string;

  @Column({ name: "comando_codigo", type: "varchar", length: 50, nullable: true })
  comandoCodigo?: string | null;

  @Column({ name: "comando_descricao", type: "text", nullable: true })
  comandoDescricao?: string | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;
}
