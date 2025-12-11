// frontend/src/types.ts

// ======= DEPARTAMENTOS =======

export type DepartamentoAgente = {
  id?: number;
  nome: string;
  numero: string; // número do WhatsApp
  principal?: boolean;
};

export type Departamento = {
  id: number;
  nome: string;
  responsavel_nome: string | null;
  responsavel_numero: string | null;
  criado_em: string;
  atualizado_em: string;

  // novos: agentes adicionais do setor (opcional)
  agentes?: DepartamentoAgente[];
};

// ======= USUÁRIOS =======

export type UsuarioPerfil = "ADMIN" | "GESTOR" | "ATENDENTE";

export type Usuario = {
  id: string;
  nome: string;
  email: string | null;
  telefone: string | null;
  perfil: UsuarioPerfil;
  ativo: boolean;
  criado_em?: string;
  atualizado_em?: string;
};

// ======= HORÁRIOS DE ATENDIMENTO =======

export type HorarioAtendimento = {
  id: number;
  departamento_id: number | null;
  dias_semana: string[]; // ["SEG", "TER", "QUA", "QUI", "SEX", ...]
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm"
  ativo: boolean;
};

// ======= ATENDIMENTOS =======

export type AtendimentoStatus =
  | "ASK_NAME"
  | "ASK_DEPARTMENT"
  | "WAITING_AGENT_CONFIRMATION"
  | "ACTIVE"
  | "IN_QUEUE"
  | "ASK_ANOTHER_DEPARTMENT"
  | "LEAVE_MESSAGE_DECISION"
  | "LEAVE_MESSAGE"
  | "ASK_SATISFACTION_RESOLUTION"
  | "ASK_SATISFACTION_RATING"
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

// ======= MENSAGENS DO ATENDIMENTO =======

export type MensagemAtendimento = {
  id: string;

  // tipo da mensagem
  tipo: "TEXT" | "AUDIO" | "IMAGE" | "VIDEO" | "DOCUMENT" | string;

  // texto principal (se tiver)
  texto: string | null;

  // ex.: "CIDADÃO", "SISTEMA", nome do agente etc.
  autor: string | null;

  // direção padronizada vinda do backend:
  // "CITIZEN" | "AGENT" | "IA"
  // (mantive string | null pra não quebrar nada antigo)
  direction?: "CITIZEN" | "AGENT" | "IA" | string | null;

  media_id: string | null;
  media_mime: string | null;
  criado_em: string;

  // novos campos vindos do backend
  comando_codigo?: string | null;
  comando_descricao?: string | null;
};
