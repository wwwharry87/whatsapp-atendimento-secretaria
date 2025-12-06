// src/pages/DepartamentosPage.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Departamento } from "../types";
import { FiPlus, FiSave } from "react-icons/fi";

// Draft: todos campos opcionais e id pode ser number ou "new"
type Draft = Omit<Partial<Departamento>, "id"> & { id?: number | "new" };

export default function DepartamentosPage() {
  const [items, setItems] = useState<Departamento[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const { data } = await api.get<Departamento[]>("/departamentos");
      setItems(data);
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao carregar departamentos. Verifique o backend.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startNew() {
    setDraft({
      id: "new",
      nome: "",
      responsavel_nome: "",
      responsavel_numero: "",
    });
  }

  function startEdit(dep: Departamento) {
    setDraft({ ...dep }); // aqui id é number, tudo certo
  }

  async function handleSave() {
    if (!draft) return;

    if (!draft.nome || !draft.responsavel_nome || !draft.responsavel_numero) {
      setErro("Preencha nome, responsável e número de WhatsApp.");
      return;
    }

    setErro(null);
    setSaving(true);

    try {
      if (draft.id === "new" || draft.id === undefined) {
        // criar
        await api.post("/departamentos", {
          nome: draft.nome,
          responsavel_nome: draft.responsavel_nome,
          responsavel_numero: draft.responsavel_numero,
        });
      } else {
        // atualizar
        await api.put(`/departamentos/${draft.id}`, {
          nome: draft.nome,
          responsavel_nome: draft.responsavel_nome,
          responsavel_numero: draft.responsavel_numero,
        });
      }

      setDraft(null);
      await load();
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao salvar departamento.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Departamentos / Setores
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Defina o responsável e o número de WhatsApp que receberá os
            atendimentos.
          </p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium px-3 py-2 transition-colors"
        >
          <FiPlus size={14} />
          Novo departamento
        </button>
      </div>

      {erro && (
        <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
          {erro}
        </div>
      )}

      {/* Tabela */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden text-xs">
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-50 sticky top-0 z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:text-slate-500">
                <th>#</th>
                <th>Nome</th>
                <th>Responsável</th>
                <th>Número WhatsApp</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Carregando...
                  </td>
                </tr>
              )}

              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Nenhum departamento cadastrado ainda.
                  </td>
                </tr>
              )}

              {!loading &&
                items.map((dep) => {
                  const isEditing = draft && draft.id === dep.id;

                  return (
                    <tr
                      key={dep.id}
                      className="border-t border-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-3 py-2 align-top text-[11px] text-slate-400">
                        {dep.id}
                      </td>

                      {/* Nome */}
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <input
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
                            value={draft?.nome ?? ""}
                            onChange={(e) =>
                              setDraft((prev) =>
                                (prev
                                  ? { ...prev, nome: e.target.value }
                                  : {
                                      id: dep.id,
                                      nome: e.target.value,
                                      responsavel_nome:
                                        dep.responsavel_nome ?? "",
                                      responsavel_numero:
                                        dep.responsavel_numero ?? "",
                                    }) as Draft
                              )
                            }
                          />
                        ) : (
                          <span className="text-[11px] font-medium text-slate-900">
                            {dep.nome}
                          </span>
                        )}
                      </td>

                      {/* Responsável */}
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <input
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
                            value={draft?.responsavel_nome ?? ""}
                            onChange={(e) =>
                              setDraft((prev) =>
                                (prev
                                  ? { ...prev, responsavel_nome: e.target.value }
                                  : {
                                      id: dep.id,
                                      nome: dep.nome,
                                      responsavel_nome: e.target.value,
                                      responsavel_numero:
                                        dep.responsavel_numero ?? "",
                                    }) as Draft
                              )
                            }
                          />
                        ) : (
                          <span className="text-[11px] text-slate-800">
                            {dep.responsavel_nome}
                          </span>
                        )}
                      </td>

                      {/* Número WhatsApp */}
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <input
                            className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
                            value={draft?.responsavel_numero ?? ""}
                            onChange={(e) =>
                              setDraft((prev) =>
                                (prev
                                  ? {
                                      ...prev,
                                      responsavel_numero: e.target.value,
                                    }
                                  : {
                                      id: dep.id,
                                      nome: dep.nome,
                                      responsavel_nome:
                                        dep.responsavel_nome ?? "",
                                      responsavel_numero: e.target.value,
                                    }) as Draft
                              )
                            }
                          />
                        ) : (
                          <span className="text-[11px] text-slate-800">
                            {dep.responsavel_numero}
                          </span>
                        )}
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-2 align-top text-right">
                        {isEditing ? (
                          <button
                            disabled={saving}
                            onClick={handleSave}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 text-[11px] font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <FiSave size={12} />
                            Salvar
                          </button>
                        ) : (
                          <button
                            onClick={() => startEdit(dep)}
                            className="text-[11px] text-emerald-600 hover:text-emerald-800"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {/* Linha de novo departamento */}
              {draft && draft.id === "new" && (
                <tr className="border-t border-slate-100 bg-slate-50/60">
                  <td className="px-3 py-2 align-top text-[11px] text-slate-500">
                    novo
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.nome ?? ""}
                      onChange={(e) =>
                        setDraft((prev) =>
                          ({
                            ...(prev ?? { id: "new" }),
                            nome: e.target.value,
                          }) as Draft
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.responsavel_nome ?? ""}
                      onChange={(e) =>
                        setDraft((prev) =>
                          ({
                            ...(prev ?? { id: "new" }),
                            responsavel_nome: e.target.value,
                          }) as Draft
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.responsavel_numero ?? ""}
                      onChange={(e) =>
                        setDraft((prev) =>
                          ({
                            ...(prev ?? { id: "new" }),
                            responsavel_numero: e.target.value,
                          }) as Draft
                        )
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <button
                      disabled={saving}
                      onClick={handleSave}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 text-[11px] font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <FiSave size={12} />
                      Salvar
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
