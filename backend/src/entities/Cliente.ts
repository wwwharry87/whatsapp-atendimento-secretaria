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

  // nome  | NO | character varying | 255
  @Column({ type: "varchar", length: 255 })
  nome!: string;

  // documento | YES | character varying | 20
  @Column({ type: "varchar", length: 20, nullable: true })
  documento?: string | null;

  // ativo | NO | boolean
  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  // whatsapp_phone_number | YES | character varying | 20
  @Column({
    name: "whatsapp_phone_number",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  whatsappPhoneNumber?: string | null;

  // whatsapp_phone_number_id | YES | character varying | 50
  @Column({
    name: "whatsapp_phone_number_id",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  whatsappPhoneNumberId?: string | null;

  // whatsapp_waba_id | YES | character varying | 50
  @Column({
    name: "whatsapp_waba_id",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  whatsappWabaId?: string | null;

  // whatsapp_access_token | YES | text
  @Column({
    name: "whatsapp_access_token",
    type: "text",
    nullable: true,
  })
  whatsappAccessToken?: string | null;

  // whatsapp_verify_token | YES | character varying | 255
  @Column({
    name: "whatsapp_verify_token",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  whatsappVerifyToken?: string | null;

  // whatsapp_webhook_secret | YES | character varying | 255
  @Column({
    name: "whatsapp_webhook_secret",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  whatsappWebhookSecret?: string | null;

  // criado_em | YES | timestamptz
  @CreateDateColumn({ name: "criado_em", type: "timestamptz", nullable: true })
  criadoEm!: Date;

  // atualizado_em | YES | timestamptz
  @UpdateDateColumn({
    name: "atualizado_em",
    type: "timestamptz",
    nullable: true,
  })
  atualizadoEm!: Date;
}
