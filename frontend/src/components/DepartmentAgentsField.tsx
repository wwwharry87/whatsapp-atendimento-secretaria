// frontend/src/components/DepartmentAgentsField.tsx
import { ChangeEvent } from "react";
import { DepartamentoAgente } from "../types";

type Props = {
  value: DepartamentoAgente[];
  onChange: (value: DepartamentoAgente[]) => void;
};

export default function DepartmentAgentsField({ value, onChange }: Props) {
  const agentes = value ?? [];

  function updateField(
    index: number,
    field: keyof DepartamentoAgente,
    val: string | boolean
  ) {
    const clone = [...agentes];
    clone[index] = {
      ...clone[index],
      [field]: val,
    };
    onChange(clone);
  }

  function handleAdd() {
    onChange([
      ...agentes,
      {
        nome: "",
        numero: "",
        principal: false,
      },
    ]);
  }

  function handleRemove(index: number) {
    const clone = [...agentes];
    clone.splice(index, 1);
    onChange(clone);
  }

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          Agentes adicionais do setor
        </h3>
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
        >
          + Adicionar agente
        </button>
      </div>

      <p className="mb-3 text-[11px] text-slate-500">
        O responsável principal do setor continua sendo definido nos
        campos de “Responsável”. Aqui você pode cadastrar outros agentes
        que também podem receber atendimentos ou acessar o painel.
      </p>

      {agentes.length === 0 && (
        <p className="text-xs italic text-slate-500">
          Nenhum agente adicional cadastrado.
        </p>
      )}

      <div className="space-y-3">
        {agentes.map((agente, index) => (
          <div
            key={agente.id ?? index}
            className="rounded-md bg-white p-3 shadow-sm"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-700">
                Agente #{index + 1}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="text-xs text-red-500 hover:underline"
              >
                Remover
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-[2fr_1.3fr]">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-slate-600">
                  Nome
                </label>
                <input
                  type="text"
                  value={agente.nome}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateField(index, "nome", e.target.value)
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Nome do agente"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] font-medium text-slate-600">
                  Número (WhatsApp)
                </label>
                <input
                  type="tel"
                  value={agente.numero}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    updateField(index, "numero", e.target.value)
                  }
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="(94) 9XXXX-XXXX"
                />
              </div>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                id={`principal-${index}`}
                type="checkbox"
                checked={!!agente.principal}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  updateField(index, "principal", e.target.checked)
                }
                className="h-3 w-3 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <label
                htmlFor={`principal-${index}`}
                className="text-[11px] text-slate-600"
              >
                Marcar como agente principal (opcional – o responsável
                oficial ainda é o configurado nos campos principais).
              </label>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
