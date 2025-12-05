// src/pages/AtendimentoDetalhePage.tsx
import { useEffect, useState, useMemo } from "react";
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

  function getMediaUrl(msg: MensagemAtendimento) {
    if (!msg.media_id) return null;
    return `${import.meta.env.VITE_API_BASE_URL || ""}/api/media/${
      msg.media_id
    }`;
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
            <p className="text-xs text-slate-500 mt-1">
              Departamento:{" "}
              <span className="font-medium">
                {atendimento.departamento_nome || "Não informado"}
              </span>{" "}
              · Início: {formatDateTime(atendimento.criado_em)} · Status:{" "}
              <span className="uppercase text-[11px] bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                {atendimento.status}
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 rounded-2xl bg-white border border-slate-200 flex overflow-hidden">
        {/* Coluna de mensagens (chat) */}
        <div className="flex-1 flex flex-col bg-[radial-gradient(circle_at_top,_#f9fafb,_#e5e7eb)]">
          <div className="border-b border-slate-200 px-4 py-2 text-xs text-slate-500 flex justify-between bg-white/80">
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
                const autorNorm = normalizarAutor(msg.autor);
                const mediaUrl = getMediaUrl(msg);
                const cidadao = isCidadao(msg);
                const sistema = isSistema(msg);

                // alinhamento estilo WhatsApp
                let wrapperAlign = "items-end";
                let rowJustify = "justify-end";
                let bubbleColor =
                  "bg-emerald-500 text-white rounded-2xl rounded-br-sm";
                let metaAlign = "text-right";
                let nomeAutor = "AGENTE / SECRETARIA";

                if (cidadao) {
                  wrapperAlign = "items-start";
                  rowJustify = "justify-start";
                  bubbleColor =
                    "bg-white text-slate-900 rounded-2xl rounded-bl-sm border border-slate-200";
                  metaAlign = "text-left";
                  nomeAutor = "CIDADÃO";
                }

                if (sistema) {
                  wrapperAlign = "items-center";
                  rowJustify = "justify-center";
                  bubbleColor =
                    "bg-slate-200 text-slate-700 rounded-full px-3 py-1 text-[11px]";
                  metaAlign = "text-center";
                  nomeAutor = "SISTEMA";
                }

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${wrapperAlign} w-full`}
                  >
                    <div
                      className={`flex ${rowJustify} w-full px-1 mb-0.5 text-[10px] text-slate-500`}
                    >
                      {!sistema && (
                        <span
                          className={`max-w-[70%] ${
                            cidadao ? "ml-1" : "mr-1"
                          }`}
                        >
                          {nomeAutor}
                        </span>
                      )}
                    </div>

                    <div className={`flex w-full ${rowJustify}`}>
                      <div
                        className={`max-w-[80%] px-3 py-2 shadow-sm ${bubbleColor}`}
                      >
                        {/* Conteúdo */}
                        {!sistema && msg.tipo === "TEXT" && msg.texto && (
                          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                            {msg.texto}
                          </p>
                        )}

                        {!sistema &&
                          msg.tipo === "AUDIO" &&
                          mediaUrl && (
                            <audio
                              controls
                              className="mt-1 max-w-full"
                              preload="metadata"
                            >
                              <source src={mediaUrl} />
                              Seu navegador não suporta áudio.
                            </audio>
                          )}

                        {!sistema &&
                          msg.tipo === "IMAGE" &&
                          mediaUrl && (
                            <img
                              src={mediaUrl}
                              alt="Imagem do atendimento"
                              className="mt-1 max-w-xs rounded-lg border border-slate-200"
                            />
                          )}

                        {!sistema &&
                          msg.tipo === "VIDEO" &&
                          mediaUrl && (
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

                        {/* Fallback caso tipo venha fora do padrão */}
                        {!sistema &&
                          !["TEXT", "AUDIO", "IMAGE", "VIDEO", "DOCUMENT"].includes(
                            (msg.tipo || "").toUpperCase()
                          ) &&
                          msg.texto && (
                            <p className="whitespace-pre-wrap text-[13px] leading-relaxed">
                              {msg.texto}
                            </p>
                          )}

                        {/* Mensagem de sistema */}
                        {sistema && (
                          <span className="whitespace-pre-wrap text-[11px]">
                            {msg.texto}
                          </span>
                        )}

                        {/* Linha de horário dentro da bolha, estilo WhatsApp */}
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
            </>
          ) : (
            <p>Carregando informações do atendimento...</p>
          )}
        </aside>
      </div>
    </div>
  );
}
