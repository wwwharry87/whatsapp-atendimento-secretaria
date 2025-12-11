// src/pages/RecadoDetalhePage.tsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  RecadoDetalhe,
  RecadoMensagem,
  RecadoStatus,
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

  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviandoAnexo, setEnviandoAnexo] = useState(false);

  const [concluindo, setConcluindo] = useState(false);

  const isEncerrado = recado?.status === "FINISHED";

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

  async function handleResponder(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !resposta.trim() || isEncerrado) return;

    try {
      setEnviando(true);
      await api.post(`/recados/${id}/responder`, {
        mensagem: resposta,
        agenteNome: recado?.agenteNome || undefined,
        agenteNumero: recado?.agenteNumero || undefined,
      });

      setResposta("");
      await carregar();
    } catch (err) {
      console.error("Erro ao responder recado:", err);
      alert("Erro ao enviar resposta.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleEnviarAnexo() {
    if (!id || !arquivo || isEncerrado) return;

    try {
      setEnviandoAnexo(true);

      // 1) Upload do arquivo para o backend (rota de mídia já existente)
      const formData = new FormData();
      formData.append("file", arquivo);

      const uploadResp = await api.post("/media/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const media = uploadResp.data;

      const mimeType: string = media.mimeType || arquivo.type || "application/octet-stream";
      let tipoMidia: "IMAGE" | "DOCUMENT" | "AUDIO" | "VIDEO" = "DOCUMENT";

      if (mimeType.startsWith("image/")) tipoMidia = "IMAGE";
      else if (mimeType.startsWith("audio/")) tipoMidia = "AUDIO";
      else if (mimeType.startsWith("video/")) tipoMidia = "VIDEO";
      else tipoMidia = "DOCUMENT";

      // 2) Registra e envia resposta de recado com mídia
      await api.post(`/recados/${id}/responder`, {
        mensagem: resposta?.trim() || undefined, // opcional: observação
        tipoMidia,
        mediaId: media.mediaId || media.id, // depende de como o /media/upload responde
        mimeType,
        fileName: media.fileName || arquivo.name,
        fileSize: media.fileSize || arquivo.size,
        mediaUrl: media.url, // se o backend retornar
        agenteNome: recado?.agenteNome || undefined,
        agenteNumero: recado?.agenteNumero || undefined,
      });

      setArquivo(null);
      setResposta("");
      await carregar();
    } catch (err) {
      console.error("Erro ao enviar anexo:", err);
      alert("Erro ao enviar anexo.");
    } finally {
      setEnviandoAnexo(false);
    }
  }

  async function handleConcluir() {
    if (!id || !recado) return;
    const confirmar = window.confirm(
      "Deseja marcar este recado como CONCLUÍDO? Após isso não será possível enviar novas respostas."
    );
    if (!confirmar) return;

    try {
      setConcluindo(true);
      await api.patch(`/recados/${id}/concluir`);
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
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
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

          {recado && !isEncerrado && (
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

              {isEncerrado && (
                <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  Este recado foi marcado como <strong>concluído</strong>. Não
                  é possível enviar novas respostas.
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
                        {m.conteudoTexto ? (
                          <p className="whitespace-pre-wrap text-slate-800">
                            {m.conteudoTexto}
                          </p>
                        ) : (
                          <p className="italic text-slate-500">
                            (mensagem sem texto – mídia ou outro tipo)
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
                className="mt-4 border-t border-slate-200 pt-3 flex flex-col gap-3"
              >
                <label className="text-xs font-semibold text-slate-700">
                  Responder ao cidadão (via WhatsApp)
                </label>

                <textarea
                  className={`border border-slate-300 rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y ${
                    isEncerrado ? "bg-slate-100 cursor-not-allowed" : ""
                  }`}
                  placeholder={
                    isEncerrado
                      ? "Recado concluído. Não é possível enviar novas respostas."
                      : "Digite aqui a resposta que será enviada para o WhatsApp do cidadão..."
                  }
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  disabled={isEncerrado}
                />

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-medium text-slate-700">
                      Anexar arquivo:
                    </label>
                    <input
                      type="file"
                      disabled={isEncerrado}
                      onChange={(e) =>
                        setArquivo(e.target.files?.[0] || null)
                      }
                      className="text-xs"
                    />
                    {arquivo && (
                      <span className="text-[10px] text-slate-500">
                        {arquivo.name}
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={handleEnviarAnexo}
                      disabled={
                        isEncerrado || !arquivo || enviandoAnexo
                      }
                      className="px-4 py-2 text-xs rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {enviandoAnexo ? "Enviando anexo..." : "Enviar anexo"}
                    </button>

                    <button
                      type="submit"
                      disabled={
                        isEncerrado || enviando || !resposta.trim()
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
