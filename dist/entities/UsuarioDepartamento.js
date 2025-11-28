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
exports.UsuarioDepartamento = void 0;
const typeorm_1 = require("typeorm");
const Usuario_1 = require("./Usuario");
const Departamento_1 = require("./Departamento");
let UsuarioDepartamento = class UsuarioDepartamento {
};
exports.UsuarioDepartamento = UsuarioDepartamento;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], UsuarioDepartamento.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Usuario_1.Usuario, (u) => u.departamentos, { eager: true }),
    (0, typeorm_1.JoinColumn)({ name: "usuario_id" }),
    __metadata("design:type", Usuario_1.Usuario)
], UsuarioDepartamento.prototype, "usuario", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "usuario_id", type: "uuid" }),
    __metadata("design:type", String)
], UsuarioDepartamento.prototype, "usuarioId", void 0);
__decorate([
    (0, typeorm_1.ManyToOne)(() => Departamento_1.Departamento, { eager: true }),
    (0, typeorm_1.JoinColumn)({ name: "departamento_id" }),
    __metadata("design:type", Departamento_1.Departamento)
], UsuarioDepartamento.prototype, "departamento", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: "departamento_id", type: "int" }),
    __metadata("design:type", Number)
], UsuarioDepartamento.prototype, "departamentoId", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "boolean", default: true }),
    __metadata("design:type", Boolean)
], UsuarioDepartamento.prototype, "principal", void 0);
exports.UsuarioDepartamento = UsuarioDepartamento = __decorate([
    (0, typeorm_1.Entity)("usuarios_departamentos")
], UsuarioDepartamento);
