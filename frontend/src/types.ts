// frontend/src/types.ts

export type Departamento = {
  id: number;
  nome: string;
  responsavel_nome: string | null;
  responsavel_numero: string | null;
  criado_em: string;
  atualizado_em: string;
};

export type UsuarioPerfil = "ADMIN" | "GESTOR" | "ATENDENTE";

export type Usuario = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null; // telefone/WhatsApp exibido no painel
  perfil: UsuarioPerfil;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
};

export type HorarioAtendimento = {
  id: number;
  departamento_id: number | null;
  dias_semana: string[]; // ["SEG", "TER", "QUA", "QUI", "SEX", ...]
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm"
  ativo: boolean;
};

export type AtendimentoStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
  | "FINISHED";

export type AtendimentoResumo = {
  id: string;
  protocolo: string | null;
  cidadao_nome: string | null;
  cidadao_numero: string;
  departamento_nome: string | null;
  agente_nome: string | null;
  status: AtendimentoStatus;
  criado_em: string;
  encerrado_em: string | null;
  foi_resolvido: boolean | null;
  nota_satisfacao: number | null;
  tempo_primeira_resposta_segundos?: number | null;
};
