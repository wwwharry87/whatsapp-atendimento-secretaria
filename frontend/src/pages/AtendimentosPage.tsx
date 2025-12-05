// src/pages/AtendimentosPage.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { AtendimentoResumo } from "../types";
import dayjs from "dayjs";
import "dayjs/locale/pt-br";

dayjs.locale("pt-br");

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export default function AtendimentosPage() {
  const navigate = useNavigate();
  const [itens, setItens] = useState<AtendimentoResumo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const resp = await api.get<AtendimentoResumo[]>("/atendimentos");
        setItens(resp.data);
      } catch (err) {
        console.error("Erro ao carregar atendimentos:", err);
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            Atendimentos
          </h1>
          <p className="text-xs text-slate-500">
            Clique em um atendimento para ver o histórico detalhado de
            mensagens, áudios, fotos e vídeos.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                Cidadão
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                Departamento
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                Agente
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                Início
              </th>
              <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">
                Status
              </th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-xs text-slate-500 text-center"
                >
                  Carregando atendimentos...
                </td>
              </tr>
            )}

            {!loading && itens.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-xs text-slate-500 text-center"
                >
                  Nenhum atendimento encontrado.
                </td>
              </tr>
            )}

            {!loading &&
              itens.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => navigate(`/atendimentos/${a.id}`)}
                >
                  <td className="px-3 py-2 text-xs">
                    <div className="font-semibold text-slate-800">
                      {a.cidadao_nome || a.cidadao_numero}
                    </div>
                    {a.protocolo && (
                      <div className="text-[11px] text-slate-500">
                        Protocolo {a.protocolo}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {a.departamento_nome || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {a.agente_nome || "-"}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {formatDateTime(a.criado_em)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full border border-slate-200 text-[11px] uppercase tracking-wide text-slate-600 bg-slate-50">
                      {a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/atendimentos/${a.id}`);
                      }}
                      className="text-emerald-600 hover:text-emerald-800 text-xs font-semibold"
                    >
                      Ver detalhes
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
