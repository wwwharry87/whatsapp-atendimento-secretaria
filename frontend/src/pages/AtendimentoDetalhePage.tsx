// src/pages/AtendimentoDetalhePage.tsx
import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  AtendimentoResumo,
  MensagemAtendimento,
} from "../types";
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
      ? ` - Protocolo ${atendimento.protocolo}`
      : "";
    return `${nome}${protocolo}`;
  }, [atendimento]);

  function getBubbleClasses(msg: MensagemAtendimento) {
    const isCidadao = (msg.autor || "").toUpperCase().includes("CIDAD");
    if (isCidadao) {
      return "self-start bg-white border border-slate-200 text-slate-800";
    }
    const isSistema = (msg.autor || "").toUpperCase().includes("SIST");
    if (isSistema) {
      return "self-center bg-slate-200 text-slate-700 text-xs";
    }
    // agente / secretaria
    return "self-end bg-emerald-600 text-white";
  }

  function getMediaUrl(msg: MensagemAtendimento) {
    if (!msg.media_id) return null;
    // o axios já está com baseURL = API; aqui só complemento
    return `${import.meta.env.VITE_API_BASE_URL || ""}/api/media/${
      msg.media_id
    }`;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Cabeçalho */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-slate-500 hover:text-slate-700 mb-1"
          >
            ← Voltar para lista de atendimentos
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
      <div className="flex-1 rounded-xl bg-white border border-slate-200 flex overflow-hidden">
        {/* Coluna da timeline de mensagens */}
        <div className="flex-1 flex flex-col">
          <div className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500 flex justify-between">
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

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {loading && <p className="text-xs text-slate-500">Carregando...</p>}

            {!loading && mensagens.length === 0 && (
              <p className="text-xs text-slate-500">
                Nenhuma mensagem registrada para este atendimento.
              </p>
            )}

            {!loading &&
              mensagens.map((msg) => {
                const bubbleClass = getBubbleClasses(msg);
                const mediaUrl = getMediaUrl(msg);
                const autor =
                  (msg.autor || "")
                    .replace(/_/g, " ")
                    .toUpperCase() || "DESCONHECIDO";

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col max-w-[80%] ${
                      bubbleClass.includes("self-end")
                        ? "ml-auto items-end"
                        : bubbleClass.includes("self-start")
                        ? "items-start"
                        : "mx-auto items-center"
                    }`}
                  >
                    <div
                      className={`px-3 py-2 rounded-2xl text-sm shadow-sm ${bubbleClass}`}
                    >
                      {/* Autor + horário */}
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] uppercase tracking-wide opacity-80">
                          {autor}
                        </span>
                        <span className="text-[10px] opacity-60">
                          {formatDateTime(msg.criado_em)}
                        </span>
                      </div>

                      {/* Conteúdo principal */}
                      {msg.tipo === "TEXT" && msg.texto && (
                        <p className="whitespace-pre-wrap text-[13px]">
                          {msg.texto}
                        </p>
                      )}

                      {msg.tipo === "AUDIO" && mediaUrl && (
                        <audio controls className="mt-1 max-w-full">
                          <source src={mediaUrl} />
                          Seu navegador não suporta áudio.
                        </audio>
                      )}

                      {msg.tipo === "IMAGE" && mediaUrl && (
                        <img
                          src={mediaUrl}
                          alt="Imagem do atendimento"
                          className="mt-1 max-w-xs rounded-lg border border-slate-200"
                        />
                      )}

                      {msg.tipo === "VIDEO" && mediaUrl && (
                        <video
                          controls
                          className="mt-1 max-w-xs rounded-lg border border-slate-200"
                        >
                          <source src={mediaUrl} />
                          Seu navegador não suporta vídeo.
                        </video>
                      )}

                      {msg.tipo === "DOCUMENT" && mediaUrl && (
                        <a
                          href={mediaUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 text-xs underline"
                        >
                          Abrir documento
                        </a>
                      )}

                      {/* Fallback caso tipo não venha preenchido direito */}
                      {!["TEXT", "AUDIO", "IMAGE", "VIDEO", "DOCUMENT"].includes(
                        (msg.tipo || "").toUpperCase()
                      ) &&
                        msg.texto && (
                          <p className="whitespace-pre-wrap text-[13px]">
                            {msg.texto}
                          </p>
                        )}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Coluna lateral para resumo / metadados (podemos evoluir depois) */}
        <aside className="w-64 border-l border-slate-200 p-4 text-xs text-slate-600 space-y-2 bg-slate-50">
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
