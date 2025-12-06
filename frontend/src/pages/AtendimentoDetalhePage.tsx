// frontend/src/pages/AtendimentoDetalhePage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { AtendimentoResumo, MensagemAtendimento } from "../types";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

dayjs.locale("pt-br");

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

export default function AtendimentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [atendimento, setAtendimento] = useState<AtendimentoResumo | null>(
    null
  );
  const [mensagens, setMensagens] = useState<MensagemAtendimento[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function carregar() {
      try {
        setLoading(true);

        const [cabResp, msgResp] = await Promise.all([
          api.get(`/atendimentos/${id}`),
          api.get(`/atendimentos/${id}/mensagens`),
        ]);

        setAtendimento(cabResp.data);
        setMensagens(msgResp.data);
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
    const protocolo = atendimento.protocolo
      ? ` · Protocolo ${atendimento.protocolo}`
      : "";
    return `${nome}${protocolo}`;
  }, [atendimento]);

  function normalizarAutor(autor?: string | null) {
    if (!autor) return "";
    return autor.toUpperCase();
  }

  function isCidadao(msg: MensagemAtendimento) {
    const a = normalizarAutor(msg.autor);
    return a.includes("CIDAD");
  }

  function isSistema(msg: MensagemAtendimento) {
    const a = normalizarAutor(msg.autor);
    return a.includes("SIST");
  }

  function isAgente(msg: MensagemAtendimento) {
    const a = normalizarAutor(msg.autor);
    return !isCidadao(msg) && !isSistema(msg);
  }

  function getMediaUrl(msg: MensagemAtendimento) {
    if (!msg.media_id) return null;
    return `${
      import.meta.env.VITE_API_BASE_URL || ""
    }/api/media/${msg.media_id}`;
  }

  function getRotuloAutor(msg: MensagemAtendimento) {
    if (!atendimento) return "Autor não identificado";

    if (isCidadao(msg)) {
      const nome =
        atendimento.cidadao_nome || atendimento.cidadao_numero || "Cidadão";
      return `CIDADÃO – ${nome}`;
    }

    if (isSistema(msg)) {
      return "SISTEMA";
    }

    const agente = atendimento.agente_nome || "Agente / Secretaria";
    return `AGENTE – ${agente}`;
  }

  function getDescricaoComando(msg: MensagemAtendimento): string | null {
    const codigo = msg.comando_codigo || undefined;
    const descricao = msg.comando_descricao || undefined;

    if (descricao && codigo) {
      // ex.: "Opção 4 – cidadão escolheu o setor X"
      return `${descricao}`;
    }

    if (descricao) return descricao;
    if (codigo) return `Comando interpretado pelo sistema: ${codigo}`;

    return null;
  }

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
              <span>
                Departamento:{" "}
                <span className="font-medium">
                  {atendimento.departamento_nome || "Não informado"}
                </span>
              </span>
              <span>·</span>
              <span>Início: {formatDateTime(atendimento.criado_em)}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                Status:
                <span
                  className={
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] " +
                    getStatusChipClasses(atendimento.status)
                  }
                >
                  {getStatusLabel(atendimento.status)}
                </span>
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 rounded-2xl bg-white border border-slate-200 flex overflow-hidden">
        {/* Coluna de mensagens */}
        <div className="flex-1 flex flex-col bg-slate-50">
          <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500 flex justify-between bg-white">
            <span>Histórico de mensagens do WhatsApp</span>
            {atendimento && (
              <span>
                Cidadão:{" "}
                <span className="font-semibold">
                  {atendimento.cidadao_nome || atendimento.cidadao_numero}
                </span>
              </span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-4 space-y-2">
            {loading && (
              <p className="text-xs text-slate-500 px-2">
                Carregando mensagens...
              </p>
            )}

            {!loading && mensagens.length === 0 && (
              <p className="text-xs text-slate-500 px-2">
                Nenhuma mensagem registrada neste atendimento.
              </p>
            )}

            {!loading &&
              mensagens.map((msg) => {
                const mediaUrl = getMediaUrl(msg);
                const cidadao = isCidadao(msg);
                const sistema = isSistema(msg);
                const descricaoComando = getDescricaoComando(msg);

                // alinhamento/cores
                let wrapperAlign = "items-end";
                let rowJustify = "justify-end";
                let bubbleClasses =
                  "bg-emerald-50 text-emerald-900 rounded-2xl rounded-br-sm border border-emerald-100";
                let metaAlign = "text-right";

                if (cidadao) {
                  wrapperAlign = "items-start";
                  rowJustify = "justify-start";
                  bubbleClasses =
                    "bg-white text-slate-900 rounded-2xl rounded-bl-sm border border-slate-200";
                  metaAlign = "text-left";
                }

                if (sistema) {
                  wrapperAlign = "items-center";
                  rowJustify = "justify-center";
                  bubbleClasses =
                    "bg-transparent text-slate-500 text-[11px] px-3 py-1";
                  metaAlign = "text-center";
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${wrapperAlign} w-full`}
                  >
                    {/* Rótulo de quem falou */}
                    {!sistema && (
                      <div
                        className={`flex ${rowJustify} w-full px-1 mb-0.5 text-[10px] text-slate-500`}
                      >
                        <span className="max-w-[80%] truncate">
                          {getRotuloAutor(msg)}
                        </span>
                      </div>
                    )}

                    {/* Bolha */}
                    <div className={`flex w-full ${rowJustify}`}>
                      <div
                        className={`max-w-[80%] px-3 py-2 shadow-sm ${bubbleClasses}`}
                      >
                        {/* Conteúdo principal */}
                        {sistema && (
                          <span className="whitespace-pre-wrap">
                            {msg.texto}
                          </span>
                        )}

                        {!sistema && msg.tipo === "TEXT" && msg.texto && (
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                            {msg.texto}
                          </p>
                        )}

                        {!sistema && msg.tipo === "AUDIO" && mediaUrl && (
                          <audio
                            controls
                            className="mt-1 max-w-full"
                            preload="metadata"
                          >
                            <source src={mediaUrl} />
                            Seu navegador não suporta áudio.
                          </audio>
                        )}

                        {!sistema && msg.tipo === "IMAGE" && mediaUrl && (
                          <img
                            src={mediaUrl}
                            alt="Imagem do atendimento"
                            className="mt-1 max-w-xs rounded-lg border border-slate-200"
                          />
                        )}

                        {!sistema && msg.tipo === "VIDEO" && mediaUrl && (
                          <video
                            controls
                            className="mt-1 max-w-xs rounded-lg border border-slate-200"
                          >
                            <source src={mediaUrl} />
                            Seu navegador não suporta vídeo.
                          </video>
                        )}

                        {!sistema &&
                          msg.tipo === "DOCUMENT" &&
                          mediaUrl && (
                            <a
                              href={mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-1 text-[12px] underline"
                            >
                              Abrir documento
                            </a>
                          )}

                        {/* Fallback para tipos desconhecidos com texto */}
                        {!sistema &&
                          ![
                            "TEXT",
                            "AUDIO",
                            "IMAGE",
                            "VIDEO",
                            "DOCUMENT",
                          ].includes((msg.tipo || "").toUpperCase()) &&
                          msg.texto && (
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                              {msg.texto}
                            </p>
                          )}

                        {/* Interpretação do comando (nota, encerramento, etc.) */}
                        {!sistema && descricaoComando && (
                          <div className="mt-1 pt-1 border-t border-slate-100 text-[11px] text-slate-500">
                            <div className="flex items-start gap-1">
                              <span>💡</span>
                              <span className="whitespace-pre-wrap">
                                {descricaoComando}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Horário */}
                        <div
                          className={`mt-1 text-[10px] opacity-70 ${metaAlign}`}
                        >
                          {formatDateTime(msg.criado_em)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Coluna lateral de resumo */}
        <aside className="w-64 border-l border-slate-200 p-4 text-xs text-slate-600 space-y-2 bg-white">
          <h2 className="text-xs font-semibold text-slate-800 mb-2">
            Resumo do atendimento
          </h2>
          {atendimento ? (
            <>
              <p>
                <span className="font-semibold">Protocolo:</span>{" "}
                {atendimento.protocolo || "-"}
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
                <span className="font-semibold">Agente:</span>{" "}
                {atendimento.agente_nome || "-"}
              </p>
              <p>
                <span className="font-semibold">Início:</span>{" "}
                {formatDateTime(atendimento.criado_em)}
              </p>
              <p>
                <span className="font-semibold">Encerrado em:</span>{" "}
                {formatDateTime(atendimento.encerrado_em)}
              </p>
              <p>
                <span className="font-semibold">Resolvido?</span>{" "}
                {atendimento.foi_resolvido == null
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
                <span className="font-semibold">Status detalhado:</span>{" "}
                {getStatusLabel(atendimento.status)}
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
