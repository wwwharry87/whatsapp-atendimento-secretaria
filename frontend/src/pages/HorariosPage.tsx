// src/pages/HorariosPage.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Departamento, HorarioAtendimento } from "../types";
import { FiSave } from "react-icons/fi";

const DIAS = [
  { id: "SEG", label: "Seg" },
  { id: "TER", label: "Ter" },
  { id: "QUA", label: "Qua" },
  { id: "QUI", label: "Qui" },
  { id: "SEX", label: "Sex" },
  { id: "SAB", label: "Sáb" },
  { id: "DOM", label: "Dom" },
];

export default function HorariosPage() {
  const [departamentos, setDepartamentos] = useState<Departamento[]>([]);
  const [horarios, setHorarios] = useState<HorarioAtendimento[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const [depsRes, horariosRes] = await Promise.all([
          api.get<Departamento[]>("/departamentos"),
          api.get<HorarioAtendimento[]>("/horarios"),
        ]);
        setDepartamentos(depsRes.data);
        setHorarios(horariosRes.data);
      } catch (err: any) {
        console.error(err);
        setErro("Erro ao carregar horários / departamentos.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function getHorarioGeral(): HorarioAtendimento {
    const h =
      horarios.find((h) => h.departamento_id === null) ||
      ({
        id: 0,
        departamento_id: null,
        dias_semana: ["SEG", "TER", "QUA", "QUI", "SEX"],
        inicio: "08:00",
        fim: "18:00",
        ativo: true,
      } as HorarioAtendimento);
    return h;
  }

  function toggleDia(
    entrada: HorarioAtendimento,
    diaId: string,
    isGeral: boolean
  ) {
    const updated = { ...entrada };
    const has = updated.dias_semana.includes(diaId);
    updated.dias_semana = has
      ? updated.dias_semana.filter((d) => d !== diaId)
      : [...updated.dias_semana, diaId];

    if (isGeral) {
      setHorarios((prev) => {
        const rest = prev.filter((h) => h.departamento_id !== null);
        return [...rest, updated];
      });
    } else {
      setHorarios((prev) =>
        prev.map((h) => (h.id === entrada.id ? updated : h))
      );
    }
  }

  function updateCampo(
    entrada: HorarioAtendimento,
    field: "inicio" | "fim" | "ativo",
    value: string | boolean,
    isGeral: boolean
  ) {
    const updated = { ...entrada, [field]: value };
    if (isGeral) {
      setHorarios((prev) => {
        const rest = prev.filter((h) => h.departamento_id !== null);
        return [...rest, updated];
      });
    } else {
      setHorarios((prev) =>
        prev.map((h) => (h.id === entrada.id ? updated : h))
      );
    }
  }

  async function salvarTudo() {
    setSaving(true);
    setErro(null);
    try {
      await api.post("/horarios/salvar-todos", { horarios });
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao salvar horários de atendimento.");
    } finally {
      setSaving(false);
    }
  }

  const geral = getHorarioGeral();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Horários de atendimento
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure o horário geral da Secretaria e, se necessário, horários
            específicos por setor.
          </p>
        </div>

        <button
          onClick={salvarTudo}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <FiSave size={14} />
          Salvar alterações
        </button>
      </div>

      {erro && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {erro}
        </div>
      )}

      <div className="space-y-4 text-xs">
        <section className="bg-white border border-slate-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-2 text-slate-900">
            Horário geral da Secretaria
          </h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Aplica-se a todos os departamentos, exceto aqueles que tiverem
            horário próprio configurado.
          </p>

          <HorarioLinha
            entrada={geral}
            titulo="Geral"
            descricao="Atendimento padrão de todos os setores."
            isGeral
            onToggleDia={toggleDia}
            onChangeCampo={updateCampo}
          />
        </section>

        <section className="bg-white border border-slate-200 rounded-2xl p-4">
          <h2 className="text-sm font-semibold mb-2 text-slate-900">
            Horários por setor
          </h2>
          <p className="text-[11px] text-slate-500 mb-3">
            Use para definir exceções, por exemplo um setor que só atende pela
            manhã.
          </p>
          

          <div className="space-y-3">
            {loading && (
              <div className="text-slate-500 text-xs">Carregando...</div>
            )}
            {!loading &&
              departamentos.map((dep) => {
                const entrada =
                  horarios.find((h) => h.departamento_id === dep.id) ||
                  ({
                    id: dep.id,
                    departamento_id: dep.id,
                    nome_departamento: dep.nome,
                    dias_semana: geral.dias_semana,
                    inicio: geral.inicio,
                    fim: geral.fim,
                    ativo: true,
                  } as HorarioAtendimento);

                return (
                  <HorarioLinha
                    key={dep.id}
                    entrada={entrada}
                    titulo={dep.nome}
                    descricao={`Responsável: ${dep.responsavel_nome}`}
                    isGeral={false}
                    onToggleDia={toggleDia}
                    onChangeCampo={updateCampo}
                  />
                );
              })}
          </div>
        </section>
      </div>
    </div>
  );
}

type LinhaProps = {
  entrada: HorarioAtendimento;
  titulo: string;
  descricao?: string;
  isGeral: boolean;
  onToggleDia: (
    entrada: HorarioAtendimento,
    diaId: string,
    isGeral: boolean
  ) => void;
  onChangeCampo: (
    entrada: HorarioAtendimento,
    field: "inicio" | "fim" | "ativo",
    value: string | boolean,
    isGeral: boolean
  ) => void;
};

function HorarioLinha({
  entrada,
  titulo,
  descricao,
  isGeral,
  onToggleDia,
  onChangeCampo,
}: LinhaProps) {
  return (
    <div className="border border-slate-200 rounded-2xl p-3 flex flex-col md:flex-row md:items-center gap-3 md:gap-4 bg-slate-50/40">
      <div className="flex-1">
        <div className="text-xs font-semibold text-slate-900">{titulo}</div>
        {descricao && (
          <div className="text-[11px] text-slate-500">{descricao}</div>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {DIAS.map((d) => {
          const selected = entrada.dias_semana.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onToggleDia(entrada, d.id, isGeral)}
              className={`px-2 py-1 rounded-full text-[10px] border ${
                selected
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-white text-slate-500 border-slate-300 hover:border-slate-400"
              }`}
            >
              {d.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-slate-500">Das</span>
        <input
          type="time"
          value={entrada.inicio}
          onChange={(e) =>
            onChangeCampo(entrada, "inicio", e.target.value, isGeral)
          }
          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] text-slate-900"
        />
        <span className="text-slate-500">às</span>
        <input
          type="time"
          value={entrada.fim}
          onChange={(e) =>
            onChangeCampo(entrada, "fim", e.target.value, isGeral)
          }
          className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px] text-slate-900"
        />
      </div>

      <div className="flex items-center gap-2 text-[11px]">
        <label className="inline-flex items-center gap-1 cursor-pointer">
          <input
            type="checkbox"
            checked={entrada.ativo}
            onChange={(e) =>
              onChangeCampo(entrada, "ativo", e.target.checked, isGeral)
            }
            className="h-3 w-3 rounded border-slate-400 bg-white"
          />
          <span className="text-slate-700">Ativo</span>
        </label>
      </div>
    </div>
  );
}
