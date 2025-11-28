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
exports.AtendimentoEvento = void 0;
const typeorm_1 = require("typeorm");
const Atendimento_1 = require("./Atendimento");
let AtendimentoEvento = class AtendimentoEvento {
};
exports.AtendimentoEvento = AtendimentoEvento;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], AtendimentoEvento.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Atendimento_1.Atendimento, { onDelete: "CASCADE" }),
    (0, typeorm_1.JoinColumn)({ name: "atendimento_id" }),
    __metadata("design:type", Atendimento_1.Atendimento)
], AtendimentoEvento.prototype, "atendimento", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "atendimento_id" }),
    __metadata("design:type", String)
], AtendimentoEvento.prototype, "atendimentoId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "status_anterior", type: "varchar", length: 50, nullable: true }),
    __metadata("design:type", Object)
], AtendimentoEvento.prototype, "statusAnterior", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "status_novo", type: "varchar", length: 50, nullable: true }),
    __metadata("design:type", Object)
], AtendimentoEvento.prototype, "statusNovo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "descricao", type: "text", nullable: true }),
    __metadata("design:type", Object)
], AtendimentoEvento.prototype, "descricao", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "autor_tipo", type: "varchar", length: 20 }),
    __metadata("design:type", String)
], AtendimentoEvento.prototype, "autorTipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "autor_identificacao", type: "varchar", length: 150, nullable: true }),
    __metadata("design:type", Object)
], AtendimentoEvento.prototype, "autorIdentificacao", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "criado_em" }),
    __metadata("design:type", Date)
], AtendimentoEvento.prototype, "criadoEm", void 0);
exports.AtendimentoEvento = AtendimentoEvento = __decorate([
    (0, typeorm_1.Entity)("atendimentos_eventos")
], AtendimentoEvento);
