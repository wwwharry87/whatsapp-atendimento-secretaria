// src/pages/DashboardPage.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { AtendimentoResumo } from "../types";
import { formatDateTime, formatDurationSeconds } from "../lib/format";
import { FiActivity, FiClock, FiMessageCircle, FiSmile } from "react-icons/fi";

type StatusInfo = {
  label: string;
  classes: string;
  isPendencia: boolean;
};

function getStatusInfo(status: AtendimentoResumo["status"]): StatusInfo {
  const base: StatusInfo = {
    label: status || "-",
    classes:
      "bg-slate-50 text-slate-700 border border-slate-200",
    isPendencia: false,
  };

  switch (status) {
    case "ASK_NAME":
      return {
        ...base,
        label: "Perguntando nome",
        classes: "bg-sky-50 text-sky-700 border border-sky-200",
      };
    case "ASK_DEPARTMENT":
      return {
        ...base,
        label: "Escolhendo setor",
        classes: "bg-sky-50 text-sky-700 border border-sky-200",
      };
    case "WAITING_AGENT_CONFIRMATION":
      return {
        ...base,
        label: "Aguardando agente",
        classes: "bg-amber-50 text-amber-700 border border-amber-200",
        isPendencia: true,
      };
    case "ACTIVE":
      return {
        ...base,
        label: "Em atendimento",
        classes: "bg-emerald-50 text-emerald-700 border border-emerald-200",
      };
    case "IN_QUEUE":
      return {
        ...base,
        label: "Na fila",
        classes: "bg-amber-50 text-amber-700 border border-amber-200",
        isPendencia: true,
      };
    case "ASK_ANOTHER_DEPARTMENT":
      return {
        ...base,
        label: "Revendo setor/encerrando",
        classes: "bg-sky-50 text-sky-700 border border-sky-200",
      };
    case "LEAVE_MESSAGE_DECISION":
      return {
        ...base,
        label: "Decidindo recado",
        classes: "bg-violet-50 text-violet-700 border border-violet-200",
      };
    case "LEAVE_MESSAGE":
      return {
        ...base,
        label: "Modo recado",
        classes: "bg-violet-50 text-violet-700 border border-violet-200",
        isPendencia: true,
      };
    case "FINISHED":
      return {
        ...base,
        label: "Encerrado",
        classes: "bg-slate-100 text-slate-700 border border-slate-200",
      };
    default:
      return base;
  }
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [resumos, setResumos] = useState<AtendimentoResumo[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<AtendimentoResumo[]>(
          "/dashboard/resumo-atendimentos"
        );
        setResumos(data);
      } catch (err: any) {
        console.error(err);
        setErro(
          "Não foi possível carregar os dados. Verifique a conexão com o backend."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalHoje = resumos.length;
  const ativos = resumos.filter((r) => r.status === "ACTIVE").length;
  const fila = resumos.filter((r) => r.status === "IN_QUEUE").length;
  const pendentesAgente = resumos.filter(
    (r) => r.status === "WAITING_AGENT_CONFIRMATION"
  ).length;
  const concluidos = resumos.filter((r) => r.status === "FINISHED").length;

  const notas = resumos
    .map((r) => r.nota_satisfacao)
    .filter((n): n is number => typeof n === "number");
  const mediaSatisfacao =
    notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

  const pendenciasTotais = fila + pendentesAgente;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Visão geral de atendimentos
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          Acompanhe tudo que está chegando pelo WhatsApp em tempo real.
        </p>
      </div>

      {/* Faixa de alerta de pendências */}
      {pendenciasTotais > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex flex-wrap items-center gap-3">
          <span className="font-semibold">
            Pendências para intervenção da equipe:
          </span>
          <span>
            <strong>{fila}</strong> na fila ·{" "}
            <strong>{pendentesAgente}</strong> aguardando um agente assumir
          </span>
          {ativos > 0 && (
            <span>
              · <strong>{ativos}</strong> em atendimento neste momento
            </span>
          )}
        </div>
      )}

      {/* Cards de estatísticas */}
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
          label="Pendentes de agente/fila"
          value={pendenciasTotais}
          subtitle="Fila + aguardando agente"
        />
        <StatCard
          icon={<FiSmile size={18} />}
          label="Satisfação média"
          value={mediaSatisfacao ? mediaSatisfacao.toFixed(1) : "-"}
          subtitle={mediaSatisfacao ? "De 1 a 5" : "Ainda sem avaliações"}
        />
      </div>

      {/* Tabela de linha do tempo */}
      <div className="mt-2 bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Linha do tempo recente
            </h2>
            <p className="text-[11px] text-slate-500">
              Últimos atendimentos abertos e encerrados.
            </p>
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto text-xs">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:text-slate-500">
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
                    className="px-3 py-6 text-center text-slate-500"
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
                  const statusInfo = getStatusInfo(r.status);
                  const rowHighlight = statusInfo.isPendencia
                    ? "bg-amber-50/40"
                    : "";
                  return (
                    <tr
                      key={r.id}
                      className={
                        "border-t border-slate-100 hover:bg-slate-50 transition-colors " +
                        rowHighlight
                      }
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-[11px] text-slate-700">
                          {r.protocolo ?? "-"}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium text-[11px] text-slate-900">
                          {r.cidadao_nome ?? "Cidadão"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {r.cidadao_numero}
                        </div>
                      </td>
                      <td className="px-3 py-2 align-top text-[11px] text-slate-700">
                        {r.departamento_nome ?? "-"}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium " +
                            statusInfo.classes
                          }
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-[11px] text-slate-700">
                        {formatDateTime(r.criado_em)}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px] text-slate-700">
                        {formatDateTime(r.encerrado_em)}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px] text-slate-700">
                        {formatDurationSeconds(
                          r.tempo_primeira_resposta_segundos ?? null
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-[11px] text-slate-700">
                        {r.nota_satisfacao ?? "-"}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {erro && (
          <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-amber-800 bg-amber-50">
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
    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 flex flex-col gap-1 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-slate-500">{label}</span>
        <span className="h-7 w-7 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
          {icon}
        </span>
      </div>
      <div className="text-xl font-semibold leading-tight text-slate-900">
        {value}
      </div>
      {subtitle && (
        <div className="text-[11px] text-slate-500">{subtitle}</div>
      )}
    </div>
  );
}
