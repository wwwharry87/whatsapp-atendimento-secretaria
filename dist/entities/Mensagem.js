"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mensagem = void 0;
const typeorm_1 = require("typeorm");
const Atendimento_1 = require("./Atendimento");
let Mensagem = class Mensagem {
};
exports.Mensagem = Mensagem;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], Mensagem.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Atendimento_1.Atendimento, { nullable: false }),
    (0, typeorm_1.JoinColumn)({ name: "atendimento_id" }),
    __metadata("design:type", Atendimento_1.Atendimento)
], Mensagem.prototype, "atendimento", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "atendimento_id" }),
    __metadata("design:type", String)
], Mensagem.prototype, "atendimentoId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", length: 20 }),
    __metadata("design:type", String)
], Mensagem.prototype, "direcao", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", length: 20 }),
    __metadata("design:type", String)
], Mensagem.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "conteudo_texto", type: "text", nullable: true }),
    __metadata("design:type", Object)
], Mensagem.prototype, "conteudoTexto", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "whatsapp_message_id", nullable: true }),
    __metadata("design:type", String)
], Mensagem.prototype, "whatsappMessageId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "whatsapp_media_id", nullable: true }),
    __metadata("design:type", String)
], Mensagem.prototype, "whatsappMediaId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "media_url", nullable: true }),
    __metadata("design:type", String)
], Mensagem.prototype, "mediaUrl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "mime_type", nullable: true }),
    __metadata("design:type", String)
], Mensagem.prototype, "mimeType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "file_name", nullable: true }),
    __metadata("design:type", String)
], Mensagem.prototype, "fileName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "file_size", type: "bigint", nullable: true }),
    __metadata("design:type", Object)
], Mensagem.prototype, "fileSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "remetente_numero" }),
    __metadata("design:type", String)
], Mensagem.prototype, "remetenteNumero", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "criado_em" }),
    __metadata("design:type", Date)
], Mensagem.prototype, "criadoEm", void 0);
exports.Mensagem = Mensagem = __decorate([
    (0, typeorm_1.Entity)("mensagens")
], Mensagem);
