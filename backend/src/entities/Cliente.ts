// src/entities/Cliente.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

@Entity("clientes")
export class Cliente {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 150 })
  nome!: string; // Nome do município / órgão / secretaria

  @Column({ type: "varchar", length: 20, nullable: true })
  documento?: string | null; // CNPJ ou similar

  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  // ==============================
  // ⚙️ Configuração de WhatsApp
  // ==============================

  // Número do WhatsApp exibido ao cidadão (formato E.164: +5594...)
  @Column({
    name: "whatsapp_phone_number",
    type: "varchar",
    length: 30,
    nullable: true,
  })
  whatsappPhoneNumber?: string | null;

  // ID do número no Cloud API (vem em metadata.phone_number_id)
  @Column({
    name: "whatsapp_phone_number_id",
    type: "varchar",
    length: 80,
    nullable: true,
  })
  whatsappPhoneNumberId?: string | null;

  // Opcional: ID da WhatsApp Business Account
  @Column({
    name: "whatsapp_waba_id",
    type: "varchar",
    length: 80,
    nullable: true,
  })
  whatsappWabaId?: string | null;

  // Token de acesso específico desse cliente (se quiser separar)
  // Se for null, você pode usar o token padrão do .env
  @Column({
    name: "whatsapp_access_token",
    type: "text",
    nullable: true,
  })
  whatsappAccessToken?: string | null;

  // Opcional: verify token do webhook (se quiser um por cliente)
  @Column({
    name: "whatsapp_verify_token",
    type: "varchar",
    length: 120,
    nullable: true,
  })
  whatsappVerifyToken?: string | null;

  // Opcional: segredo para validar assinatura (X-Hub-Signature-256)
  @Column({
    name: "whatsapp_webhook_secret",
    type: "varchar",
    length: 200,
    nullable: true,
  })
  whatsappWebhookSecret?: string | null;

  @CreateDateColumn({ name: "criado_em" })
  criadoEm!: Date;

  @UpdateDateColumn({ name: "atualizado_em" })
  atualizadoEm!: Date;
}
