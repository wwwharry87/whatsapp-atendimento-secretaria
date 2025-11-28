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
exports.Departamento = void 0;
const typeorm_1 = require("typeorm");
let Departamento = class Departamento {
};
exports.Departamento = Departamento;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], Departamento.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)(),
    __metadata("design:type", String)
], Departamento.prototype, "nome", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "responsavel_nome", nullable: true }),
    __metadata("design:type", String)
], Departamento.prototype, "responsavelNome", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "responsavel_numero", nullable: true }),
    __metadata("design:type", String)
], Departamento.prototype, "responsavelNumero", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "criado_em" }),
    __metadata("design:type", Date)
], Departamento.prototype, "criadoEm", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: "atualizado_em" }),
    __metadata("design:type", Date)
], Departamento.prototype, "atualizadoEm", void 0);
exports.Departamento = Departamento = __decorate([
    (0, typeorm_1.Entity)("departamentos")
], Departamento);
