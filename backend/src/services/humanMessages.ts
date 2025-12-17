/* src/services/humanMessages.ts
 * Humanização de mensagens do "Atende Cidadão"
 * - Sem dependências externas
 * - Sem alteração de banco/rotas/assinaturas
 * - Compatível com WhatsApp (texto simples + 1-2 emojis)
 */

export type MessageTone = "normal" | "urgent" | "frustrated" | "question" | "happy";

export type OrgTipo = "EDUCACAO" | "SAUDE" | "PREFEITURA" | "ESCOLA" | "OUTRO";

export type OrganizationStyle = {
  tipo: OrgTipo;
  /** Nome amigável do órgão (ex.: "SEMED Tucuruí-PA", "Prefeitura de X") */
  displayName: string;
  /** Nível de formalidade (0=mais casual, 2=mais formal) */
  formality: 0 | 1 | 2;
  /** Vocabulário sugerido */
  vocab: {
    saudacao: string; // ex.: "atendimento", "nossa escola", "unidade de saúde"
    setor: string; // ex.: "setor", "secretaria", "coordenação"
    protocolo: string; // ex.: "protocolo", "número do atendimento"
  };
};

export type OrgInfoLike = {
  /** Nome do cliente/órgão que você tiver em mãos */
  displayName?: string | null;
  /** Tipo (quando você souber explicitamente) */
  orgTipo?: string | null;
};

/**
 * Timezone padrão do sistema.
 * - Render/Node costuma rodar em UTC
 * - então precisamos forçar o timezone "do Brasil" aqui
 */
function getDefaultTimeZone(): string {
  return (process.env.DEFAULT_TIMEZONE || "America/Fortaleza").trim() || "America/Fortaleza";
}

function getHourInTimeZone(date: Date, timeZone: string): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      hour12: false,
    }).format(date);
    const h = Number(String(s).trim());
    if (Number.isFinite(h)) return h;
  } catch {}
  // fallback seguro (horário do servidor)
  return date.getHours();
}

function getDayKeyInTimeZone(date: Date, timeZone: string): string {
  try {
    // en-CA costuma retornar YYYY-MM-DD
    const s = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
    // normalmente já vem YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  } catch {}
  // fallback (UTC) — mas só se Intl falhar
  return date.toISOString().slice(0, 10);
}

export function analyzeMessageTone(text: string): MessageTone {
  const t = (text || "").trim().toLowerCase();
  if (!t) return "normal";

  // feliz / agradecimento
  if (/\b(obrigad|valeu|show|top|perfeito|maravilha|legal|ótim|excelente)\b/i.test(t)) return "happy";

  // urgência
  if (
    /\b(urgente|agora|imediat|socorro|rápido|o quanto antes|hoje|já|ja)\b/i.test(t) ||
    /!!!+/.test(t) ||
    /\b(não posso esperar|preciso hoje)\b/i.test(t)
  ) {
    return "urgent";
  }

  // frustração
  if (
    /\b(não funciona|nao funciona|de novo|denovo|cansei|ridículo|ridiculo|péssimo|pessimo|demora|ninguém responde|ninguem responde|não respondem|nao respondem)\b/i.test(
      t
    ) ||
    /\b(reclama|insatisfeit)\b/i.test(t)
  ) {
    return "frustrated";
  }

  // pergunta
  if (/\?$/.test(t) || /\b(como|quando|onde|por que|pq|qual|quais|tem como|pode)\b/i.test(t)) return "question";

  return "normal";
}

function normalizeOrgName(name: string): string {
  return (name || "").trim().replace(/\s+/g, " ");
}

function inferOrgTipoByName(name: string): OrgTipo {
  const n = normalizeOrgName(name).toLowerCase();

  // educação
  if (/(semed|secretaria.*educa|educa[cç][aã]o|escola|creche)/i.test(n)) {
    if (/(escola|creche)/i.test(n)) return "ESCOLA";
    return "EDUCACAO";
  }

  // saúde
  if (/(sms|secretaria.*sa[uú]de|sa[uú]de|posto|ubs|upa|hospital|consulta|exame)/i.test(n)) return "SAUDE";

  // prefeitura
  if (/(prefeitura|gabinete|administra[cç][aã]o|finan[cç]as|tributos)/i.test(n)) return "PREFEITURA";

  return "OUTRO";
}

export function getOrganizationStyle(orgInfo: OrgInfoLike): OrganizationStyle {
  const displayName = normalizeOrgName(orgInfo.displayName || "Atendimento");
  const explicit = (orgInfo.orgTipo || "").toUpperCase();

  let tipo: OrgTipo = "OUTRO";
  if (explicit === "EDUCACAO" || explicit === "SAUDE" || explicit === "PREFEITURA" || explicit === "ESCOLA") {
    tipo = explicit as OrgTipo;
  } else {
    tipo = inferOrgTipoByName(displayName);
  }

  if (tipo === "EDUCACAO") {
    return {
      tipo,
      displayName,
      formality: 1,
      vocab: { saudacao: "atendimento da Educação", setor: "setor", protocolo: "protocolo" },
    };
  }
  if (tipo === "ESCOLA") {
    return {
      tipo,
      displayName,
      formality: 0,
      vocab: { saudacao: "nossa escola", setor: "setor", protocolo: "número do atendimento" },
    };
  }
  if (tipo === "SAUDE") {
    return {
      tipo,
      displayName,
      formality: 1,
      vocab: { saudacao: "atendimento da Saúde", setor: "setor", protocolo: "protocolo" },
    };
  }
  if (tipo === "PREFEITURA") {
    return {
      tipo,
      displayName,
      formality: 2,
      vocab: { saudacao: "atendimento da Prefeitura", setor: "setor", protocolo: "protocolo" },
    };
  }

  return {
    tipo,
    displayName,
    formality: 1,
    vocab: { saudacao: "atendimento", setor: "setor", protocolo: "protocolo" },
  };
}

function safeName(name?: string | null): string | undefined {
  const n = (name || "").trim();
  if (!n) return undefined;
  // usa só o primeiro nome pra soar mais humano
  const first = n.split(/\s+/)[0];
  return first || undefined;
}

function greetingByHour(date = new Date(), timeZone?: string): string {
  const tz = (timeZone || getDefaultTimeZone()).trim() || getDefaultTimeZone();
  const h = getHourInTimeZone(date, tz);

  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

function stableHash(input: string): number {
  // djb2
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

function pickVariant(key: string, variants: string[], seed?: string | number): string {
  if (!variants.length) return "";

  const tz = getDefaultTimeZone();
  const dayKey = getDayKeyInTimeZone(new Date(), tz); // YYYY-MM-DD no timezone correto
  const raw = `${key}|${String(seed ?? "")}|${dayKey}`;
  const idx = stableHash(raw) % variants.length;
  return variants[idx];
}

function joinLines(lines: Array<string | undefined | null>): string {
  return lines.filter((l) => !!(l && String(l).trim())).join("\n");
}

function orgLabel(org: OrganizationStyle): string {
  // evita duplicação "atendimento do atendimento"
  return org.displayName ? `*${org.displayName}*` : "*Atendimento*";
}

export class HumanMessagesService {
  /** 3 variações de saudação pedindo nome */
  static greetingAskName(args: { org: OrganizationStyle; seed?: string | number; now?: Date }): string {
    const { org, seed } = args;
    const g = greetingByHour(args.now, getDefaultTimeZone());

    // Variantes mais amigáveis e menos robóticas
    const variants = [
      `${g}! 👋 Sou o assistente virtual da ${orgLabel(org)}.\nPara começarmos, qual é o seu nome? 🙂`,
      `${g}! 👋 Bem-vindo(a) ao atendimento da ${orgLabel(org)}.\nComo posso te chamar?`,
      `${g}! 👋 Aqui é do atendimento digital da ${orgLabel(org)}.\nMe diz seu nome para eu registrar aqui, por favor? 🙂`,
    ];

    return pickVariant("greetingAskName", variants, seed);
  }

  /**
   * Pergunta se é funcionário ou comunidade (Novo)
   */
  static askProfile(args: { citizenName: string; org: OrganizationStyle; seed?: string | number }): string {
    const { citizenName, org, seed } = args;
    const name = safeName(citizenName) || "cidadão";

    const variants = [
      `Prazer, ${name}! Para eu te direcionar melhor, me conta uma coisa:\n\nVocê faz parte da equipe da *${org.displayName}* ou é da comunidade (pai, aluno, cidadão)?`,
      `Obrigado, ${name}. Antes de prosseguirmos: você é servidor/funcionário da casa ou busca atendimento como cidadão?`,
      `Certo, ${name}! 📝\nPara agilizar seu atendimento, selecione seu perfil abaixo:`,
    ];

    return pickVariant("askProfile", variants, seed);
  }

  /** Menu humanizado (varia texto e inclui nome se houver) */
  static menuMessage(args: {
    org: OrganizationStyle;
    citizenName?: string | null;
    menuText: string; // texto já montado pelo departmentService
    seed?: string | number;
  }): string {
    const name = safeName(args.citizenName);

    // Saudação mais rica
    const headerVariants = [
      `Tudo pronto, ${name}. Aqui estão os setores disponíveis para te ajudar:`,
      `Agora sim! ${name}, com qual setor você gostaria de falar?`,
      `Perfeito. Veja onde podemos te atender hoje:`,
    ];
    const header = pickVariant("menuHeader", headerVariants, args.seed);

    const hint = "\n💡 *Dica:* Se você sabe o nome da escola ou setor específico, pode escrever direto (ex: 'Escola Dom Pedro').";

    return joinLines([header, "", args.menuText, hint]);
  }

  /** Confirmação de setor selecionado */
  static sectorSelectedAck(args: {
    org: OrganizationStyle;
    citizenName?: string | null;
    departamentoNome: string;
    protocolo?: string | null;
    tone?: MessageTone;
    seed?: string | number;
  }): string {
    const name = safeName(args.citizenName);
    const dep = args.departamentoNome?.trim() || "o setor escolhido";

    const baseVariants = [
      `Perfeito${name ? `, ${name}` : ""}! 👍 Já direcionei para *${dep}*.`,
      `Certo${name ? `, ${name}` : ""}! ✅ Encaminhei para *${dep}*.`,
      `Beleza${name ? `, ${name}` : ""}! 🙂 Já chamei o setor *${dep}*.`,
    ];

    let msg = pickVariant("sectorSelectedAck", baseVariants, args.seed);

    if (args.tone === "urgent") msg += `\nVou sinalizar como prioridade.`;
    if (args.tone === "frustrated") msg += `\nEntendo a chateação — vamos resolver o quanto antes.`;

    if (args.protocolo) msg += `\n${args.org.vocab.protocolo}: *${args.protocolo}*`;

    return msg;
  }

  /** Confirmação de recado registrado (5 variações) */
  static leaveMessageRegisteredAck(args: {
    org: OrganizationStyle;
    citizenName?: string | null;
    protocolo?: string | null;
    tone?: MessageTone;
    seed?: string | number;
  }): string {
    const name = safeName(args.citizenName);

    const variants = [
      `Perfeito${name ? `, ${name}` : ""}! ✅ Já registrei sua solicitação para a equipe.`,
      `Entendi${name ? `, ${name}` : ""}! ✅ Ficou anotado aqui e já vai para a equipe.`,
      `Certo${name ? `, ${name}` : ""}! 📝 Já deixei registrado para o time responsável.`,
      `Beleza${name ? `, ${name}` : ""}! ✅ Sua mensagem já está com a gente.`,
      `Obrigado${name ? `, ${name}` : ""}! ✅ Já encaminhei seu recado para a equipe.`,
    ];

    let msg = pickVariant("leaveMessageRegisteredAck", variants, args.seed);

    if (args.tone === "urgent") msg += `\nVou marcar como prioridade.`;
    if (args.tone === "frustrated") msg += `\nSinto muito por isso — vamos tentar agilizar.`;
    if (args.tone === "happy") msg += `\nFico feliz em ajudar! 🙂`;

    if (args.protocolo) msg += `\n${args.org.vocab.protocolo}: *${args.protocolo}*`;
    msg += `\nSe quiser, pode mandar mais detalhes por aqui.`;

    return msg;
  }

  /** Mensagem “fora do horário” (empática, com opções claras) */
  static outOfHoursDecision(args: {
    org: OrganizationStyle;
    citizenName?: string | null;
    horarioLabel?: string | null; // ex.: "Seg a Sex 08:00-17:00"
    seed?: string | number;
  }): string {
    const name = safeName(args.citizenName);
    const header = `${greetingByHour(new Date(), getDefaultTimeZone())}${name ? `, ${name}` : ""}! 👋`;

    const horario = args.horarioLabel
      ? `🕘 Horário de atendimento: *${args.horarioLabel}*`
      : `🕘 No momento estamos fora do horário de atendimento humano.`;

    const variants = [
      joinLines([
        header,
        `Você está falando com ${orgLabel(args.org)}.`,
        horario,
        "",
        "O que você prefere fazer agora?",
        "1 - Deixar um recado detalhado",
        "2 - Ver a lista de setores",
        "3 - Encerrar",
      ]),
      joinLines([
        header,
        `Atendimento: ${orgLabel(args.org)}.`,
        "Agora a equipe humana não está online 😕",
        horarioLabelLine(args.horarioLabel),
        "",
        "Pra eu te ajudar melhor, escolha uma opção:",
        "1 - Deixar um recado",
        "2 - Ver setores",
        "3 - Encerrar",
      ]),
      joinLines([
        header,
        `Você está no ${orgLabel(args.org)}.`,
        "A gente já está fora do expediente, mas posso guardar sua mensagem ✅",
        horarioLabelLine(args.horarioLabel),
        "",
        "Me diz como você quer seguir:",
        "1 - Deixar recado",
        "2 - Menu de setores",
        "3 - Encerrar",
      ]),
    ];

    return pickVariant("outOfHoursDecision", variants, args.seed);
  }

  /** Mensagem para cidadão quando recebe recado (mais humana) */
  static recadoToCitizen(args: {
    org: OrganizationStyle;
    citizenName?: string | null;
    departamentoNome?: string | null;
    protocolo?: string | null;
    seed?: string | number;
  }): string {
    const name = safeName(args.citizenName);
    const dep = (args.departamentoNome || "").trim();
    const proto = (args.protocolo || "").trim();

    const headerVariants = [
      `Oi${name ? `, ${name}` : ""}! 👋 Chegou um recado pra você.`,
      `Olá${name ? `, ${name}` : ""}! 👋 Tenho uma atualização pra você.`,
      `Oi${name ? `, ${name}` : ""}! 🙂 Vim te passar um recado.`,
    ];

    const header = pickVariant("recadoToCitizenHeader", headerVariants, args.seed);

    const fromLine = dep ? `📍 Setor: *${dep}*` : `📍 Origem: ${orgLabel(args.org)}`;
    const protoLine = proto ? `🔎 ${args.org.vocab.protocolo}: *${proto}*` : undefined;

    const footerVariants = [
      "Você pode responder por aqui normalmente que eu repasso pra equipe. 🙂",
      "Se quiser, me responda aqui com mais detalhes ou dúvidas. 🙂",
      "Pode responder esta mensagem — a equipe recebe na sequência. 🙂",
    ];

    const footer = pickVariant("recadoToCitizenFooter", footerVariants, args.seed);

    return joinLines([header, `Canal: ${orgLabel(args.org)}`, fromLine, protoLine, "", footer]);
  }
}

function horarioLabelLine(label?: string | null): string | undefined {
  const t = (label || "").trim();
  if (!t) return undefined;
  return `🕘 Horário: *${t}*`;
}
