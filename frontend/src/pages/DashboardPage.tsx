import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AtendimentoResumo } from "../types";
import { badgeStatus, formatDateTime, formatDurationSeconds } from "../lib/format";
import { FiActivity, FiClock, FiMessageCircle, FiSmile } from "react-icons/fi";

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<AtendimentoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<AtendimentoResumo[]>("/dashboard/resumo-atendimentos");
        setResumos(data);
      } catch (err: any) {
        console.error(err);
        setErro("Não foi possível carregar os dados. Depois conectamos com o backend.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalHoje = resumos.length;
  const ativos = resumos.filter((r) => r.status === "ACTIVE").length;
  const fila = resumos.filter((r) => r.status === "IN_QUEUE").length;
  const concluidos = resumos.filter((r) => r.status === "FINISHED").length;

  const notas = resumos
    .map((r) => r.nota_satisfacao)
    .filter((n): n is number => typeof n === "number");
  const mediaSatisfacao =
    notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          Visão geral de atendimentos
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Acompanhe tudo que está chegando pelo WhatsApp em tempo real.
        </p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <StatCard
          icon={<FiMessageCircle size={18} />}
          label="Atendimentos hoje"
          value={totalHoje}
          subtitle="Total registrados no sistema"
        />
        <StatCard
          icon={<FiActivity size={18} />}
          label="Em atendimento"
          value={ativos}
          subtitle="Conversas em andamento"
        />
        <StatCard
          icon={<FiClock size={18} />}
          label="Em fila"
          value={fila}
          subtitle="Aguardando agente"
        />
        <StatCard
          icon={<FiSmile size={18} />}
          label="Satisfação média"
          value={mediaSatisfacao ? mediaSatisfacao.toFixed(1) : "-"}
          subtitle={mediaSatisfacao ? "De 1 a 5" : "Ainda sem avaliações"}
        />
      </div>

      <div className="mt-2 bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Linha do tempo recente</h2>
            <p className="text-[11px] text-slate-400">
              Últimos atendimentos abertos e encerrados.
            </p>
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto text-xs">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-900/80 sticky top-0 z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:text-slate-400">
                <th>Protocolo</th>
                <th>Munícipe</th>
                <th>Departamento</th>
                <th>Status</th>
                <th>Aberto em</th>
                <th>Fechado em</th>
                <th>1ª resposta</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && resumos.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Ainda não há registros para exibir.
                  </td>
                </tr>
              )}
              {!loading &&
                resumos.map((r) => {
                  const statusInfo = badgeStatus(r.status);
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-slate-800/80 hover:bg-slate-900/60 transition-colors"
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-[11px] text-primary-200">
                          {r.protocolo ?? "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-[11px]">
                          {r.cidadao_nome ?? "Cidadão"}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {r.cidadao_numero}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {r.departamento_nome ?? "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {formatDateTime(r.criado_em)}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {formatDateTime(r.encerrado_em)}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {formatDurationSeconds(
                          r.tempo_primeira_resposta_segundos ?? null
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px]">
                        {r.nota_satisfacao ?? "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {erro && (
          <div className="border-t border-slate-800 px-4 py-2 text-[11px] text-amber-300/80 bg-amber-950/30">
            {erro}
          </div>
        )}
      </div>
    </div>
  );
}

type StatProps = {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
};

function StatCard({ icon, label, value, subtitle }: StatProps) {
  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-2xl px-4 py-3 flex flex-col gap-1 shadow-sm shadow-black/40">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-400">{label}</span>
        <span className="h-7 w-7 rounded-xl bg-primary-500/10 border border-primary-500/40 flex items-center justify-center text-primary-300">
          {icon}
        </span>
      </div>
      <div className="text-xl font-semibold leading-tight">{value}</div>
      {subtitle && (
        <div className="text-[11px] text-slate-500">{subtitle}</div>
      )}
    </div>
  );
}
