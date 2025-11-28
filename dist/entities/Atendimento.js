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
exports.Atendimento = void 0;
const typeorm_1 = require("typeorm");
const Departamento_1 = require("./Departamento");
let Atendimento = class Atendimento {
};
exports.Atendimento = Atendimento;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], Atendimento.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "cidadao_numero" }),
    __metadata("design:type", String)
], Atendimento.prototype, "cidadaoNumero", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "cidadao_nome", nullable: true }),
    __metadata("design:type", String)
], Atendimento.prototype, "cidadaoNome", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Departamento_1.Departamento, { nullable: true }),
    (0, typeorm_1.JoinColumn)({ name: "departamento_id" }),
    __metadata("design:type", Object)
], Atendimento.prototype, "departamento", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "departamento_id", nullable: true }),
    __metadata("design:type", Object)
], Atendimento.prototype, "departamentoId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "agente_numero", nullable: true }),
    __metadata("design:type", String)
], Atendimento.prototype, "agenteNumero", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "agente_nome", nullable: true }),
    __metadata("design:type", String)
], Atendimento.prototype, "agenteNome", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "varchar", length: 50 }),
    __metadata("design:type", String)
], Atendimento.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: "protocolo",
        type: "varchar",
        length: 50,
        nullable: true
    }),
    __metadata("design:type", Object)
], Atendimento.prototype, "protocolo", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "criado_em" }),
    __metadata("design:type", Date)
], Atendimento.prototype, "criadoEm", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: "atualizado_em" }),
    __metadata("design:type", Date)
], Atendimento.prototype, "atualizadoEm", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "encerrado_em", type: "timestamp", nullable: true }),
    __metadata("design:type", Object)
], Atendimento.prototype, "encerradoEm", void 0);
exports.Atendimento = Atendimento = __decorate([
    (0, typeorm_1.Entity)("atendimentos")
], Atendimento);
