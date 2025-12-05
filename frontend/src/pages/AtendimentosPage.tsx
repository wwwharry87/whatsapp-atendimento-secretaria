import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AtendimentoResumo } from "../types";
import { badgeStatus, formatDateTime, formatDurationSeconds, formatPhone } from "../lib/format";

export default function AtendimentosPage() {
  const [items, setItems] = useState<AtendimentoResumo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<string>("TODOS");

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<AtendimentoResumo[]>("/atendimentos");
        setItems(data);
      } catch (err: any) {
        console.error(err);
        setErro("Erro ao carregar atendimentos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtrados =
    filtroStatus === "TODOS"
      ? items
      : items.filter((i) => i.status === filtroStatus);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Atendimentos
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Histório das conversas, fila e status em tempo real.
          </p>
        </div>

        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-400">Filtrar status:</span>
          <select
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value)}
            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1"
          >
            <option value="TODOS">Todos</option>
            <option value="ACTIVE">Em atendimento</option>
            <option value="WAITING_AGENT_CONFIRMATION">
              Aguardando agente
            </option>
            <option value="IN_QUEUE">Fila</option>
            <option value="FINISHED">Finalizado</option>
          </select>
        </div>
      </div>

      {erro && (
        <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-700/60 rounded-xl px-3 py-2">
          {erro}
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden text-xs">
        <div className="max-h-[480px] overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-900/80 sticky top-0 z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:text-slate-400">
                <th>Protocolo</th>
                <th>Munícipe</th>
                <th>Departamento</th>
                <th>Agente</th>
                <th>Status</th>
                <th>Abertura</th>
                <th>Encerramento</th>
                <th>1ª resposta</th>
                <th>Resolvido</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && filtrados.length === 0 && (
                <tr>
                  <td
                    colSpan={10}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Nenhum atendimento encontrado com esse filtro.
                  </td>
                </tr>
              )}
              {!loading &&
                filtrados.map((a) => {
                  const badge = badgeStatus(a.status);
                  return (
                    <tr
                      key={a.id}
                      className="border-t border-slate-800/80 hover:bg-slate-900/60 transition-colors"
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-[11px] text-primary-200">
                          {a.protocolo ?? "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="text-[11px] font-medium">
                          {a.cidadao_nome ?? "Cidadão"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {formatPhone(a.cidadao_numero)}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {a.departamento_nome ?? "-"}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {a.agente_nome ?? "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.color}`}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {formatDateTime(a.criado_em)}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {formatDateTime(a.encerrado_em)}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {formatDurationSeconds(
                          a.tempo_primeira_resposta_segundos ?? null
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {a.foi_resolvido == null
                          ? "-"
                          : a.foi_resolvido
                          ? "Sim"
                          : "Não"}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {a.nota_satisfacao ?? "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
