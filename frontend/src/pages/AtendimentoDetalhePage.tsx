// src/pages/AtendimentoDetalhePage.tsx
import { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { AtendimentoResumo, MensagemAtendimento } from "../types";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";
import { FiArrowLeft, FiCheck, FiCheckCircle } from "react-icons/fi"; // Ícones opcionais

dayjs.locale("pt-br");

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export default function AtendimentoDetalhePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);

  const [atendimento, setAtendimento] = useState<AtendimentoResumo | null>(null);
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
        console.error("Erro ao carregar detalhes:", err);
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, [id]);

  // Rola para o final do chat sempre que carregar mensagens
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [mensagens]);

  const titulo = useMemo(() => {
    if (!atendimento) return "Atendimento";
    return atendimento.cidadao_nome || atendimento.cidadao_numero || "Cidadão";
  }, [atendimento]);

  function getMediaUrl(msg: MensagemAtendimento) {
    if (!msg.media_id) return null;
    return `${import.meta.env.VITE_API_BASE_URL || ""}/api/media/${msg.media_id}`;
  }

  // Helpers para identificar tipo de mensagem
  const isCidadao = (autor?: string | null) => 
    (autor || "").toUpperCase().includes("CIDAD");
  
  const isSistema = (autor?: string | null) => 
    (autor || "").toUpperCase().includes("SIST");

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4">
      {/* Cabeçalho Simplificado e Suave */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-slate-200/50 rounded-full transition-colors text-slate-500"
            title="Voltar"
          >
            <FiArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-700">{titulo}</h1>
            {atendimento && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <span className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md font-medium text-slate-600">
                  {atendimento.protocolo || "Sem protocolo"}
                </span>
                <span>•</span>
                <span>{atendimento.departamento_nome}</span>
              </div>
            )}
          </div>
        </div>
        
        {atendimento && (
          <div className={`px-3 py-1 rounded-full text-xs font-semibold border ${
            atendimento.status === 'FINISHED' 
              ? "bg-slate-100 text-slate-600 border-slate-200" 
              : "bg-emerald-50 text-emerald-600 border-emerald-100"
          }`}>
            {atendimento.status === 'FINISHED' ? 'Finalizado' : 'Em andamento'}
          </div>
        )}
      </div>

      {/* Área Principal (Chat + Sidebar) */}
      <div className="flex-1 flex overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        
        {/* CHAT AREA */}
        <div className="flex-1 flex flex-col bg-[#efeae2] relative">
            {/* Pattern de fundo opcional estilo Zap, ou cor sólida suave bg-slate-50 */}
            <div className="absolute inset-0 opacity-[0.06] bg-[url('https://user-images.githubusercontent.com/15075759/28719144-86dc0f70-73b1-11e7-911d-60d70fcded21.png')] pointer-events-none"></div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 z-10">
            {loading && <p className="text-center text-xs text-slate-400 mt-4">Carregando conversa...</p>}
            
            {!loading && mensagens.length === 0 && (
              <div className="flex justify-center mt-10">
                <span className="bg-white/80 backdrop-blur px-4 py-2 rounded-full text-xs text-slate-500 shadow-sm">
                  Nenhuma mensagem trocada ainda.
                </span>
              </div>
            )}

            {!loading && mensagens.map((msg) => {
              const ehSistema = isSistema(msg.autor);
              const ehCidadao = isCidadao(msg.autor);
              const ehAgente = !ehCidadao && !ehSistema;
              const mediaUrl = getMediaUrl(msg);

              // MENSAGEM DO SISTEMA (Centralizada)
              if (ehSistema) {
                return (
                  <div key={msg.id} className="flex justify-center my-2">
                    <span className="bg-slate-200/80 text-slate-600 text-[10px] px-3 py-1 rounded-full font-medium uppercase tracking-wide">
                      {msg.texto}
                    </span>
                  </div>
                );
              }

              // MENSAGENS NORMAIS (Esquerda vs Direita)
              return (
                <div
                  key={msg.id}
                  className={`flex w-full ${ehAgente ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`
                      relative max-w-[85%] md:max-w-[65%] px-3 py-2 text-sm shadow-sm
                      ${ehAgente 
                        ? "bg-[#d9fdd3] text-slate-800 rounded-l-lg rounded-tr-none rounded-br-lg" // Cor "Zap" Agente (Verde suave)
                        : "bg-white text-slate-800 rounded-r-lg rounded-tl-none rounded-bl-lg" // Cor "Zap" Cidadão (Branco)
                      }
                    `}
                  >
                    {/* Nome do Autor (Opcional, bom pra grupos, aqui pode ocultar se quiser limpar mais) */}
                    <div className={`text-[10px] font-bold mb-1 ${ehAgente ? "text-emerald-600" : "text-slate-400"}`}>
                        {ehAgente ? "Agente" : "Cidadão"}
                    </div>

                    {/* Conteúdo Textual */}
                    {msg.tipo === "TEXT" && (
                      <p className="whitespace-pre-wrap leading-relaxed text-[13px]">
                        {msg.texto}
                      </p>
                    )}

                    {/* Mídias */}
                    {mediaUrl && (
                      <div className="mt-1 mb-1">
                        {msg.tipo === "IMAGE" && <img src={mediaUrl} className="rounded-md max-w-full max-h-64 object-cover" />}
                        {msg.tipo === "AUDIO" && <audio controls src={mediaUrl} className="w-64 max-w-full h-8" />}
                        {msg.tipo === "VIDEO" && <video controls src={mediaUrl} className="rounded-md max-w-full" />}
                        {msg.tipo === "DOCUMENT" && (
                          <a href={mediaUrl} target="_blank" className="flex items-center gap-2 bg-black/5 p-2 rounded text-xs text-blue-600 hover:underline">
                             📄 Ver documento
                          </a>
                        )}
                      </div>
                    )}

                    {/* Hora e Status */}
                    <div className="flex items-center justify-end gap-1 mt-1">
                      <span className="text-[9px] text-slate-400/80">
                        {dayjs(msg.criado_em).format("HH:mm")}
                      </span>
                      {ehAgente && <FiCheckCircle size={10} className="text-emerald-500" />}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Área de Input (Fundo claro para separar) */}
          <div className="bg-[#f0f2f5] px-4 py-3 flex gap-2 items-center border-t border-slate-200">
             <input 
                type="text" 
                placeholder="Digite sua mensagem..." 
                disabled // Desabilitado pois é apenas visualização por enquanto
                className="flex-1 bg-white border-none outline-none rounded-lg px-4 py-2 text-sm shadow-sm placeholder:text-slate-400"
             />
             <button disabled className="bg-emerald-500 text-white p-2 rounded-full opacity-50 cursor-not-allowed">
               <span className="sr-only">Enviar</span>
               <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="ml-0.5"><path d="M1.101 21.757 23.8 12.028 1.101 2.3l.011 7.912 13.623 1.816-13.623 1.817-.011 7.912z"></path></svg>
             </button>
          </div>
        </div>

        {/* Sidebar de Detalhes (Direita) */}
        <aside className="w-72 bg-white border-l border-slate-200 hidden md:flex flex-col">
          <div className="p-6">
            <div className="flex flex-col items-center mb-6">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center text-2xl mb-3">
                 👤
              </div>
              <h2 className="font-semibold text-slate-700 text-center">{titulo}</h2>
              <p className="text-xs text-slate-400">{atendimento?.cidadao_numero}</p>
            </div>

            <div className="space-y-4 text-sm">
               <div>
                 <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Departamento</label>
                 <div className="text-slate-700">{atendimento?.departamento_nome || "-"}</div>
               </div>
               
               <div>
                 <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Agente Responsável</label>
                 <div className="text-slate-700">{atendimento?.agente_nome || "Fila de espera"}</div>
               </div>

               <div>
                 <label className="text-xs text-slate-400 font-medium uppercase tracking-wider">Criado em</label>
                 <div className="text-slate-700">{formatDateTime(atendimento?.criado_em)}</div>
               </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}