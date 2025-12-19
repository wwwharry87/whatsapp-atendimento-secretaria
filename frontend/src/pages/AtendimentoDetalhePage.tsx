// frontend/src/pages/AtendimentoDetalhePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { AtendimentoResumo, MensagemAtendimento } from "../types";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import MediaPreview from "../components/MediaPreview";

dayjs.locale("pt-br");

// ----------------------
// Helpers de data / status
// ----------------------
function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

function getStatusLabel(status?: string | null) {
  if (!status) return "-";
  const map: Record<string, string> = {
    ASK_NAME: "Perguntando nome do cidadão",
    ASK_DEPARTMENT: "Cidadão escolhendo setor",
    WAITING_AGENT_CONFIRMATION: "Aguardando um agente assumir",
    ACTIVE: "Em atendimento",
    IN_QUEUE: "Na fila de espera",
    ASK_ANOTHER_DEPARTMENT: "Definindo outro setor ou encerrando",
    LEAVE_MESSAGE_DECISION: "Decidindo se quer deixar recado",
    LEAVE_MESSAGE: "Modo recado (mensagens registradas)",
    ASK_SATISFACTION_RESOLUTION: "Pesquisa: se foi resolvido",
    ASK_SATISFACTION_RATING: "Pesquisa: nota de satisfação",
    FINISHED: "Atendimento encerrado",
  };
  return map[status] || status;
}

function getStatusChipClasses(status?: string | null) {
  switch (status) {
    case "IN_QUEUE":
    case "WAITING_AGENT_CONFIRMATION":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "ACTIVE":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "ASK_NAME":
    case "ASK_DEPARTMENT":
    case "ASK_ANOTHER_DEPARTMENT":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "LEAVE_MESSAGE_DECISION":
    case "LEAVE_MESSAGE":
    case "ASK_SATISFACTION_RESOLUTION":
    case "ASK_SATISFACTION_RATING":
      return "bg-violet-50 text-violet-700 border-violet-200";
    case "FINISHED":
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

// ----------------------
// Helpers de autor/direção
// ----------------------
function normalizarAutor(autor?: string | null) {
  if (!autor) return "";
  return autor.toUpperCase();
}

/**
 * Usa primeiro o campo direction ("CITIZEN" | "AGENT" | "IA"),
 * ou direcao (vindo direto da API), e só cai pro autor em texto como fallback.
 */
function normalizarDirecao(msg: MensagemAtendimento) {
  // Suporta tanto "direction" quanto "direcao"
  const rawDirection = (msg as any).direction ?? (msg as any).direcao ?? "";

  const dir = rawDirection.toString().toUpperCase().trim();

  if (dir === "CITIZEN" || dir === "CIDADAO" || dir === "CIDADÃO") {
    return "CIDADAO";
  }
  if (dir === "AGENT" || dir === "AGENTE") {
    return "AGENTE";
  }
  if (dir === "IA" || dir === "BOT") {
    return "IA";
  }

  // Fallback usando o autor
  const a = normalizarAutor((msg as any).autor);
  if (a.includes("CIDAD")) return "CIDADAO";
  if (a.includes("SIST")) return "SISTEMA";
  if (a.includes("IA") || a.includes("BOT")) return "IA";

  return "AGENTE";
}

function isCidadao(msg: MensagemAtendimento) {
  return normalizarDirecao(msg) === "CIDADAO";
}

function isSistema(msg: MensagemAtendimento) {
  return normalizarDirecao(msg) === "SISTEMA";
}

function isIA(msg: MensagemAtendimento) {
  return normalizarDirecao(msg) === "IA";
}

// ----------------------
// Componente principal
// ----------------------
export default function AtendimentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [atendimento, setAtendimento] = useState<AtendimentoResumo | null>(null);
  const [mensagens, setMensagens] = useState<MensagemAtendimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function carregar() {
      try {
        setLoading(true);

        const [cabResp, msgResp] = await Promise.all([
          api.get<AtendimentoResumo>(`/atendimentos/${id}`),
          api.get(`/atendimentos/${id}/mensagens`),
        ]);

        setAtendimento(cabResp.data);

        const raw = msgResp.data as any;

        const lista: MensagemAtendimento[] = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.mensagens)
          ? raw.mensagens
          : [];

        setMensagens(lista);
      } catch (err) {
        console.error("Erro ao carregar detalhes do atendimento:", err);
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, [id]);

  const titulo = useMemo(() => {
    if (!atendimento) return "Atendimento";
    const nome = atendimento.cidadao_nome || atendimento.cidadao_numero;
    const protocolo = atendimento.protocolo ? ` · Protocolo ${atendimento.protocolo}` : "";
    return `${nome}${protocolo}`;
  }, [atendimento]);

  // Ordena cronologicamente (só por segurança)
  const mensagensOrdenadas = useMemo(
    () =>
      [...mensagens].sort(
        (a, b) => new Date((a as any).criado_em).getTime() - new Date((b as any).criado_em).getTime()
      ),
    [mensagens]
  );

  // ----------------------
  // Helpers de mensagens
  // ----------------------

  function getRotuloAutor(msg: MensagemAtendimento) {
    if (!atendimento) return "Autor não identificado";

    const direcao = normalizarDirecao(msg);

    if (direcao === "CIDADAO") {
      const nome = atendimento.cidadao_nome || atendimento.cidadao_numero || "Cidadão";
      return `CIDADÃO – ${nome}`;
    }

    if (direcao === "IA") {
      return "IA – Atende Cidadão";
    }

    if (direcao === "SISTEMA") {
      return "SISTEMA";
    }

    const agente = atendimento.agente_nome || "Agente / Secretaria";
    return `AGENTE – ${agente}`;
  }

  function getDescricaoComando(msg: MensagemAtendimento): string | null {
    const codigo = (msg as any).comando_codigo || undefined;
    const descricao = (msg as any).comando_descricao || undefined;

    if (descricao && codigo) return descricao;
    if (descricao) return descricao;
    if (codigo) return `Comando interpretado pelo sistema: ${codigo}`;
    return null;
  }

  const apiBaseUrl =
    (api.defaults.baseURL as string | undefined) ||
    ((import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "");

  // IMPORTANTE: esse token precisa ser o MESMO que você usa no axios interceptor
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // ----------------------
  // Render
  // ----------------------
  return (
    <div className="flex flex-col h-full gap-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-xs text-slate-500 hover:text-slate-700 mb-1"
          >
            ← Voltar para Atendimentos
          </button>
          <h1 className="text-xl font-semibold text-slate-800">{titulo}</h1>
          {atendimento && (
            <p className="text-xs text-slate-500 mt-1 flex flex-wrap gap-1 items-center">
              <span>Departamento: {atendimento.departamento_nome || "Não informado"}</span>
              <span className="mx-1">•</span>
              <span>
                Criado em: {formatDateTime(atendimento.criado_em)}{" "}
                {atendimento.encerrado_em &&
                  ` · Encerrado em: ${formatDateTime(atendimento.encerrado_em)}`}
              </span>
            </p>
          )}
        </div>

        {atendimento && (
          <div
            className={
              "inline-flex items-center px-2.5 py-1 rounded-full border text-xs font-medium " +
              getStatusChipClasses(atendimento.status)
            }
          >
            {getStatusLabel(atendimento.status)}
          </div>
        )}
      </div>

      {/* Conteúdo principal: chat + resumo lateral */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Coluna do chat */}
        <div className="flex-1 flex flex-col bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 flex items-center justify-between">
            <span>Linha do tempo de mensagens</span>
            <div className="flex items-center gap-2 text-[10px]">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-white border border-slate-300" />
                Cidadão
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-200 border border-emerald-300" />
                Agente
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-violet-200 border border-violet-300" />
                IA
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
            {loading && (
              <p className="text-xs text-slate-500 px-2">Carregando mensagens...</p>
            )}

            {!loading && mensagensOrdenadas.length === 0 && (
              <p className="text-xs text-slate-500 px-2">
                Nenhuma mensagem registrada neste atendimento.
              </p>
            )}

            {!loading &&
              mensagensOrdenadas.map((msg) => {
                // Campos extras podem vir da API mesmo não estando no type TS
                const mediaId = (msg as any).media_id ?? (msg as any).whatsapp_media_id ?? null;
                const mimeType = (msg as any).mime_type ?? null;
                const fileName = (msg as any).file_name ?? null;
                const fileSize = (msg as any).file_size ?? null;

                const cidadao = isCidadao(msg);
                const sistema = isSistema(msg);
                const ia = isIA(msg);
                const descricaoComando = getDescricaoComando(msg);

                // alinhamento/cores padrão = AGENTE
                let wrapperAlign = "items-end";
                let rowJustify = "justify-end";
                let bubbleClasses =
                  "bg-emerald-50 text-emerald-900 rounded-2xl rounded-br-sm border border-emerald-100";
                let metaAlign = "text-right";

                // CIDADÃO → esquerda (branco)
                if (cidadao) {
                  wrapperAlign = "items-start";
                  rowJustify = "justify-start";
                  bubbleClasses =
                    "bg-white text-slate-900 rounded-2xl rounded-bl-sm border border-slate-200";
                  metaAlign = "text-left";
                }

                // SISTEMA → centro (cinza, sem “bolha” tradicional)
                if (sistema) {
                  wrapperAlign = "items-center";
                  rowJustify = "justify-center";
                  bubbleClasses = "bg-transparent text-slate-500 text-[11px] px-3 py-1";
                  metaAlign = "text-center";
                }

                // IA → mesmo alinhamento do AGENTE (direita), só muda a cor
                if (ia && !sistema && !cidadao) {
                  bubbleClasses =
                    "bg-violet-50 text-violet-900 rounded-2xl rounded-br-sm border border-violet-100";
                }

                const texto = (msg as any).texto ?? (msg as any).conteudo_texto ?? "";

                return (
                  <div key={(msg as any).id} className={`flex flex-col ${wrapperAlign} w-full`}>
                    {/* Rótulo de quem falou (esconde pro SISTEMA) */}
                    {!sistema && (
                      <div
                        className={`flex ${rowJustify} w-full px-1 mb-0.5 text-[10px] text-slate-500`}
                      >
                        <span className="max-w-[80%] truncate">{getRotuloAutor(msg)}</span>
                      </div>
                    )}

                    {/* Bolha */}
                    <div className={`flex w-full ${rowJustify}`}>
                      <div className={`max-w-[80%] px-3 py-2 shadow-sm ${bubbleClasses}`}>
                        {/* Etiqueta IA */}
                        {ia && !sistema && !cidadao && (
                          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-700 flex items-center justify-center gap-1">
                            <span>🤖</span>
                            <span>Atende Cidadão (IA)</span>
                          </div>
                        )}

                        {/* Conteúdo principal */}
                        {sistema && <span className="whitespace-pre-wrap">{texto}</span>}

                        {!sistema && (msg as any).tipo === "TEXT" && texto && (
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{texto}</p>
                        )}

                        {/* MÍDIAS (com auth via fetch -> blob) */}
                        {!sistema && (msg as any).tipo !== "TEXT" && (
                          <MediaPreview
                            apiBaseUrl={apiBaseUrl}
                            token={token}
                            tipo={(msg as any).tipo}
                            whatsappMediaId={mediaId}
                            mediaUrl={(msg as any).media_url ?? null}
                            mimeType={mimeType}
                            fileName={fileName}
                            fileSize={fileSize}
                          />
                        )}

                        {descricaoComando && (
                          <div className="mt-1 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                            <div className="flex items-start gap-1">
                              <span>💡</span>
                              <span className="whitespace-pre-wrap">{descricaoComando}</span>
                            </div>
                          </div>
                        )}

                        {/* Horário */}
                        <div className={`mt-1 text-[10px] opacity-70 ${metaAlign}`}>
                          {formatDateTime((msg as any).criado_em)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Coluna lateral com resumo do atendimento */}
        <aside className="w-72 shrink-0 bg-white rounded-xl border border-slate-200 shadow-sm p-4 text-sm space-y-2">
          <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Resumo do atendimento
          </h2>

          {atendimento ? (
            <>
              <p>
                <span className="font-semibold">Protocolo:</span> {atendimento.protocolo || "-"}
              </p>
              <p>
                <span className="font-semibold">Cidadão:</span>{" "}
                {atendimento.cidadao_nome || atendimento.cidadao_numero}
              </p>
              <p>
                <span className="font-semibold">Departamento:</span>{" "}
                {atendimento.departamento_nome || "-"}
              </p>
              <p>
                <span className="font-semibold">Agente:</span> {atendimento.agente_nome || "-"}
              </p>
              <p>
                <span className="font-semibold">Início:</span> {formatDateTime(atendimento.criado_em)}
              </p>
              <p>
                <span className="font-semibold">Encerrado:</span>{" "}
                {formatDateTime(atendimento.encerrado_em)}
              </p>
              <p>
                <span className="font-semibold">Foi resolvido?</span>{" "}
                {atendimento.foi_resolvido === null
                  ? "-"
                  : atendimento.foi_resolvido
                  ? "Sim"
                  : "Não"}
              </p>
              <p>
                <span className="font-semibold">Nota de satisfação:</span>{" "}
                {atendimento.nota_satisfacao ?? "-"}
              </p>
              <p>
                <span className="font-semibold">Status detalhado:</span> {getStatusLabel(atendimento.status)}
              </p>
            </>
          ) : (
            <p>Carregando informações do atendimento...</p>
          )}
        </aside>
      </div>
    </div>
  );
}
