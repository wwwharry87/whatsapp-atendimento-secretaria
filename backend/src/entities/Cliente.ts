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

  @Column({ type: "varchar", length: 255 })
  nome!: string;

  @Column({ type: "varchar", length: 20, nullable: true })
  documento?: string | null;

  @Column({ type: "boolean", default: true })
  ativo!: boolean;

  @Column({
    name: "whatsapp_phone_number",
    type: "varchar",
    length: 20,
    nullable: true,
  })
  whatsappPhoneNumber?: string | null;

  @Column({
    name: "whatsapp_phone_number_id",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  whatsappPhoneNumberId?: string | null;

  @Column({
    name: "whatsapp_waba_id",
    type: "varchar",
    length: 50,
    nullable: true,
  })
  whatsappWabaId?: string | null;

  @Column({
    name: "whatsapp_access_token",
    type: "text",
    nullable: true,
  })
  whatsappAccessToken?: string | null;

  @Column({
    name: "whatsapp_verify_token",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  whatsappVerifyToken?: string | null;

  @Column({
    name: "whatsapp_webhook_secret",
    type: "varchar",
    length: 255,
    nullable: true,
  })
  whatsappWebhookSecret?: string | null;

  @CreateDateColumn({
    name: "criado_em",
    type: "timestamptz",
    nullable: true,
  })
  criadoEm!: Date;

  @UpdateDateColumn({
    name: "atualizado_em",
    type: "timestamptz",
    nullable: true,
  })
  atualizadoEm!: Date;
}
