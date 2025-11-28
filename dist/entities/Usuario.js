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
exports.Usuario = void 0;
const typeorm_1 = require("typeorm");
const UsuarioDepartamento_1 = require("./UsuarioDepartamento");
let Usuario = class Usuario {
};
exports.Usuario = Usuario;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)("uuid"),
    __metadata("design:type", String)
], Usuario.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ length: 150 }),
    __metadata("design:type", String)
], Usuario.prototype, "nome", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: "telefone_whatsapp",
        type: "varchar",
        length: 30,
        nullable: true
    }),
    __metadata("design:type", Object)
], Usuario.prototype, "telefoneWhatsapp", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "varchar",
        length: 150,
        nullable: true
    }),
    __metadata("design:type", Object)
], Usuario.prototype, "email", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: "login",
        type: "varchar",
        length: 50,
        unique: true
    }),
    __metadata("design:type", String)
], Usuario.prototype, "login", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: "senha_hash",
        type: "varchar",
        length: 255
    }),
    __metadata("design:type", String)
], Usuario.prototype, "senhaHash", void 0);
__decorate([
    (0, typeorm_1.Column)({
        type: "varchar",
        length: 20,
        default: "SETOR"
    }),
    __metadata("design:type", String)
], Usuario.prototype, "tipo", void 0);
__decorate([
    (0, typeorm_1.Column)({ type: "boolean", default: true }),
    __metadata("design:type", Boolean)
], Usuario.prototype, "ativo", void 0);
__decorate([
    (0, typeorm_1.OneToMany)(() => UsuarioDepartamento_1.UsuarioDepartamento, (ud) => ud.usuario),
    __metadata("design:type", Array)
], Usuario.prototype, "departamentos", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: "criado_em" }),
    __metadata("design:type", Date)
], Usuario.prototype, "criadoEm", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: "atualizado_em" }),
    __metadata("design:type", Date)
], Usuario.prototype, "atualizadoEm", void 0);
exports.Usuario = Usuario = __decorate([
    (0, typeorm_1.Entity)("usuarios")
], Usuario);
