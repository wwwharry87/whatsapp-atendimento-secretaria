// frontend/src/types.ts

// ================== DEPARTAMENTOS ==================

export type Departamento = {
  id: number;
  nome: string;
  responsavel_nome: string | null;
  responsavel_numero: string | null;
  criado_em: string;
  atualizado_em: string;
};

// ================== USUÁRIOS ==================

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

// ================== HORÁRIOS ==================

export type HorarioAtendimento = {
  id: number;
  departamento_id: number | null;
  dias_semana: string[]; // ["SEG", "TER", "QUA", "QUI", "SEX", ...]
  inicio: string; // "HH:mm"
  fim: string; // "HH:mm"
  ativo: boolean;
};

// ================== ATENDIMENTOS ==================

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

// ================== MENSAGENS ==================

export type MensagemDirecao = "CITIZEN" | "AGENT" | null;

export type MensagemAtendimento = {
  id: string;

  tipo: "TEXT" | "AUDIO" | "IMAGE" | "VIDEO" | "DOCUMENT" | string;

  texto: string | null;

  // Quem "fala" do ponto de vista do painel
  autor: string | null; // CIDADÃO / AGENTE / SISTEMA (calculado no backend)

  // Direção bruta vinda do backend ("CITIZEN" / "AGENT")
  direcao?: MensagemDirecao;

  // Mantido para compatibilidade, caso o backend use "direction"
  direction?: string | null;

  media_id: string | null;
  media_mime: string | null;

  criado_em: string;

  // 🔹 novos campos: interpretação dos comandos (1,2,3, etc.)
  comando_codigo?: string | null;
  comando_descricao?: string | null;
};
