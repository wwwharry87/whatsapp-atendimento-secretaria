// src/pages/RecadoDetalhePage.tsx
import { useEffect, useState, ChangeEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  RecadoStatus,
  RecadoDetalhe,
  RecadoMensagem,
} from "../types";

function formatarDataBr(valor?: string | null) {
  if (!valor) return "-";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function statusLabel(status: RecadoStatus) {
  switch (status) {
    case "LEAVE_MESSAGE":
      return "Recado em análise";
    case "LEAVE_MESSAGE_DECISION":
      return "Aguardando decisão de recado";
    case "FINISHED":
      return "Encerrado";
    default:
      return status;
  }
}

function direcaoLabel(msg: RecadoMensagem) {
  const d = msg.direcao?.toUpperCase();
  if (d === "CITIZEN") return "Cidadão";
  if (d === "AGENT") return "Agente";
  if (d === "IA") return "Assistente Virtual";
  return d || "Outro";
}

export default function RecadoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [recado, setRecado] = useState<RecadoDetalhe | null>(null);
  const [loading, setLoading] = useState(false);

  const [resposta, setResposta] = useState("");
  const [enviando, setEnviando] = useState(false);

  const [fileToUpload, setFileToUpload] = useState<File | null>(null);
  const [filePreviewName, setFilePreviewName] = useState<string | null>(null);

  const [concluindo, setConcluindo] = useState(false);

  const podeResponder =
    !!recado && recado.status !== "FINISHED";

  async function carregar() {
    if (!id) return;
    try {
      setLoading(true);
      const resp = await api.get<RecadoDetalhe>(`/recados/${id}`);
      setRecado(resp.data);
    } catch (err) {
      console.error("Erro ao carregar recado:", err);
      alert("Erro ao carregar recado.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setFileToUpload(file);
    setFilePreviewName(file ? file.name : null);
  }

  async function handleResponder(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;

    const texto = resposta.trim();
    if (!texto && !fileToUpload) {
      // nada pra enviar
      return;
    }

    try {
      setEnviando(true);

      let mediaPayload:
        | {
            mediaId?: string;
            mimeType?: string;
            fileName?: string;
            fileSize?: number;
            mediaUrl?: string;
            tipoMidia?: "TEXT" | "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO";
            tipo?: string;
          }
        | null = null;

      // 1) Se tiver arquivo, faz upload AGORA
      if (fileToUpload) {
        const formData = new FormData();
        formData.append("file", fileToUpload);

        const uploadResp = await api.post("/media/upload", formData, {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        });

        mediaPayload = uploadResp.data;
      }

      // 2) Envia recado (texto + anexo junto)
      await api.post(`/recados/${id}/responder`, {
        mensagem: texto || undefined,
        agenteNome: recado?.agenteNome || undefined,
        agenteNumero: recado?.agenteNumero || undefined,
        tipoMidia:
          mediaPayload?.tipoMidia ||
          (mediaPayload?.tipo as
            | "TEXT"
            | "IMAGE"
            | "DOCUMENT"
            | "AUDIO"
            | "VIDEO"
            | undefined),
        mediaId: mediaPayload?.mediaId,
        mimeType: mediaPayload?.mimeType,
        fileName: mediaPayload?.fileName,
        fileSize: mediaPayload?.fileSize,
        mediaUrl: mediaPayload?.mediaUrl,
      });

      setResposta("");
      setFileToUpload(null);
      setFilePreviewName(null);

      await carregar();
    } catch (err) {
      console.error("Erro ao responder recado:", err);
      alert("Erro ao enviar resposta.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleConcluir() {
    if (!id) return;
    if (!window.confirm("Marcar este recado como concluído?")) return;

    try {
      setConcluindo(true);
      await api.patch(`/recados/${id}/concluir`, {});
      await carregar();
    } catch (err) {
      console.error("Erro ao concluir recado:", err);
      alert("Erro ao concluir recado.");
    } finally {
      setConcluindo(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-2 py-1 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            Voltar
          </button>
          <h1 className="text-xl font-semibold text-slate-800">
            Detalhe do Recado
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {recado?.status && (
            <span
              className={`text-xs px-2 py-1 rounded-full border ${
                recado.status === "LEAVE_MESSAGE"
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : recado.status === "FINISHED"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-slate-300 bg-slate-50 text-slate-700"
              }`}
            >
              {statusLabel(recado.status)}
            </span>
          )}

          {recado && recado.status !== "FINISHED" && (
            <button
              type="button"
              onClick={handleConcluir}
              disabled={concluindo}
              className="px-3 py-1.5 text-xs rounded-lg border border-emerald-500 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {concluindo ? "Concluindo..." : "Concluir recado"}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 px-6 py-4 max-w-5xl w-full mx-auto flex flex-col gap-4">
        {loading && (
          <div className="text-sm text-slate-500">Carregando recado...</div>
        )}

        {!loading && !recado && (
          <div className="text-sm text-red-500">
            Recado não encontrado ou erro ao carregar.
          </div>
        )}

        {recado && (
          <>
            {/* Cabeçalho */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm text-slate-500">Cidadão</div>
                  <div className="text-base font-semibold text-slate-800">
                    {recado.cidadaoNome || "Cidadão sem nome"}
                  </div>
                  <div className="text-xs text-slate-500">
                    Telefone: {recado.cidadaoNumero}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-sm text-slate-500">Setor</div>
                  <div className="text-base font-semibold text-slate-800">
                    {recado.departamentoNome || "Não definido"}
                  </div>
                  {recado.protocolo && (
                    <div className="text-xs text-slate-500">
                      Protocolo:{" "}
                      <span className="font-mono font-semibold">
                        {recado.protocolo}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs text-slate-500 mt-2">
                <div>
                  <span className="font-semibold">Criado em:</span>{" "}
                  {formatarDataBr(recado.criadoEm)}
                </div>
                <div>
                  <span className="font-semibold">Última atualização:</span>{" "}
                  {formatarDataBr(recado.atualizadoEm)}
                </div>
                <div>
                  <span className="font-semibold">Encerrado em:</span>{" "}
                  {formatarDataBr(recado.encerradoEm)}
                </div>
              </div>

              {(recado.foiResolvido !== null ||
                recado.notaSatisfacao !== null) && (
                <div className="mt-2 text-xs text-slate-600 flex flex-wrap gap-3">
                  {recado.foiResolvido !== null && (
                    <span>
                      Situação declarada pelo cidadão:{" "}
                      <strong>
                        {recado.foiResolvido ? "Resolvido" : "Não resolvido"}
                      </strong>
                    </span>
                  )}
                  {recado.notaSatisfacao !== null && (
                    <span>
                      Nota de satisfação:{" "}
                      <strong>{recado.notaSatisfacao}/5</strong>
                    </span>
                  )}
                </div>
              )}
            </section>

            {/* Timeline de mensagens */}
            <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex-1 flex flex-col">
              <h2 className="text-sm font-semibold text-slate-800 mb-3">
                Histórico de mensagens
              </h2>
              <div className="flex-1 overflow-auto max-h-[400px] pr-1 space-y-3">
                {recado.mensagens.length === 0 && (
                  <div className="text-xs text-slate-500">
                    Ainda não há mensagens registradas neste recado.
                  </div>
                )}

                {recado.mensagens.map((m) => {
                  const isCitizen = m.direcao?.toUpperCase() === "CITIZEN";
                  const isAgent = m.direcao?.toUpperCase() === "AGENT";
                  const isIA = m.direcao?.toUpperCase() === "IA";

                  return (
                    <div
                      key={m.id}
                      className={`flex ${
                        isCitizen
                          ? "justify-start"
                          : isAgent
                          ? "justify-end"
                          : "justify-center"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] rounded-xl px-3 py-2 text-xs shadow-sm border ${
                          isCitizen
                            ? "bg-slate-50 border-slate-200"
                            : isAgent
                            ? "bg-blue-50 border-blue-200"
                            : "bg-emerald-50 border-emerald-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="font-semibold text-slate-700">
                            {direcaoLabel(m)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatarDataBr(m.criadoEm)}
                          </span>
                        </div>

                        {m.tipo && m.tipo !== "TEXT" && (
                          <div className="text-[11px] text-slate-500 mb-1">
                            Anexo: <strong>{m.tipo}</strong>
                          </div>
                        )}

                        {m.conteudoTexto ? (
                          <p className="whitespace-pre-wrap text-slate-800">
                            {m.conteudoTexto}
                          </p>
                        ) : !m.tipo || m.tipo === "TEXT" ? (
                          <p className="italic text-slate-500">
                            (mensagem sem texto)
                          </p>
                        ) : (
                          <p className="italic text-slate-500">
                            (mensagem com anexo, sem texto)
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Responder */}
              <form
                onSubmit={handleResponder}
                className="mt-4 border-t border-slate-200 pt-3 flex flex-col gap-2"
              >
                <label className="text-xs font-semibold text-slate-700">
                  Responder ao cidadão (via WhatsApp)
                </label>
                <textarea
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y"
                  placeholder="Digite aqui a resposta que será enviada para o WhatsApp do cidadão..."
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  disabled={!podeResponder || enviando}
                />

                {/* Anexo */}
                <div className="flex items-center justify-between gap-3 mt-1">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                    <span className="px-2 py-1 rounded-lg border border-slate-300 bg-slate-50 cursor-pointer hover:bg-slate-100">
                      Escolher arquivo
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileChange}
                      disabled={!podeResponder || enviando}
                    />
                    {filePreviewName && (
                      <span className="text-[11px] text-slate-500 truncate max-w-[220px]">
                        {filePreviewName}
                      </span>
                    )}
                  </label>

                  <div className="flex justify-end">
                    <button
                      type="submit"
                      disabled={
                        enviando ||
                        !podeResponder ||
                        (!resposta.trim() && !fileToUpload)
                      }
                      className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {enviando ? "Enviando..." : "Enviar resposta"}
                    </button>
                  </div>
                </div>
              </form>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
