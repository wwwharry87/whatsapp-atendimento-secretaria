import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Usuario } from "../types";
import { FiPlus, FiSave } from "react-icons/fi";

type Draft = Partial<Usuario> & { id?: string | "new" };


export default function UsuariosPage() {
  const [items, setItems] = useState<Usuario[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      const { data } = await api.get<Usuario[]>("/usuarios");
      setItems(data);
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao carregar usuários.");
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
      email: "",
      telefone: "",
      perfil: "GESTOR",
      ativo: true
    });
  }

  function startEdit(u: Usuario) {
    setDraft({ ...u });
  }

  async function handleSave() {
    if (!draft) return;
    if (!draft.nome || !draft.email || !draft.perfil) {
      setErro("Preencha nome, e-mail e perfil.");
      return;
    }
    setErro(null);
    setSaving(true);
    try {
      if (draft.id === "new" || !draft.id) {
        await api.post("/usuarios", draft);
      } else {
        await api.put(`/usuarios/${draft.id}`, draft);
      }
      setDraft(null);
      await load();
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao salvar usuário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Usuários & Perfis
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Controle quem acessa o painel, com perfis de ADMIN, GESTOR e ATENDENTE.
          </p>
        </div>
        <button
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-slate-950 text-xs font-medium px-3 py-2 transition-colors"
        >
          <FiPlus size={14} />
          Novo usuário
        </button>
      </div>

      {erro && (
        <div className="text-[11px] text-amber-300 bg-amber-950/40 border border-amber-700/60 rounded-xl px-3 py-2">
          {erro}
        </div>
      )}

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden text-xs">
        <div className="max-h-[420px] overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="bg-slate-900/80 sticky top-0 z-10">
              <tr className="[&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-medium [&>th]:text-slate-400">
                <th>#</th>
                <th>Nome</th>
                <th>E-mail</th>
                <th>Telefone</th>
                <th>Perfil</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-slate-400"
                  >
                    Carregando...
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-3 py-6 text-center text-slate-500"
                  >
                    Nenhum usuário cadastrado ainda.
                  </td>
                </tr>
              )}
              {!loading &&
                items.map((u) => {
                  const isEditing = draft && draft.id === u.id;
                  return (
                    <tr
                      key={u.id}
                      className="border-t border-slate-800/80 hover:bg-slate-900/60 transition-colors"
                    >
                      <td className="px-3 py-2 align-top text-[11px] text-slate-400">
                        {u.id}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <input
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                            value={draft!.nome || ""}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d!, nome: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="text-[11px] font-medium">
                            {u.nome}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <input
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                            value={draft!.email || ""}
                            onChange={(e) =>
                              setDraft((d) => ({ ...d!, email: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="text-[11px]">{u.email}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <input
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                            value={draft!.telefone || ""}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d!,
                                telefone: e.target.value
                              }))
                            }
                          />
                        ) : (
                          <span className="text-[11px]">
                            {u.telefone || "-"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <select
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                            value={draft!.perfil || "GESTOR"}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d!,
                                perfil: e.target.value as Usuario["perfil"]
                              }))
                            }
                          >
                            <option value="ADMIN">ADMIN</option>
                            <option value="GESTOR">GESTOR</option>
                            <option value="ATENDENTE">ATENDENTE</option>
                          </select>
                        ) : (
                          <span className="text-[11px]">{u.perfil}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {isEditing ? (
                          <select
                            className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                            value={draft!.ativo ? "1" : "0"}
                            onChange={(e) =>
                              setDraft((d) => ({
                                ...d!,
                                ativo: e.target.value === "1"
                              }))
                            }
                          >
                            <option value="1">Ativo</option>
                            <option value="0">Inativo</option>
                          </select>
                        ) : (
                          <span
                            className={
                              "inline-flex px-2 py-0.5 rounded-full text-[10px] border " +
                              (u.ativo
                                ? "bg-emerald-500/15 border-emerald-500/50 text-emerald-200"
                                : "bg-slate-800/60 border-slate-700 text-slate-300")
                            }
                          >
                            {u.ativo ? "Ativo" : "Inativo"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top text-right">
                        {isEditing ? (
                          <button
                            disabled={saving}
                            onClick={handleSave}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 px-3 py-1 text-[11px] font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <FiSave size={12} />
                            Salvar
                          </button>
                        ) : (
                          <button
                            onClick={() => startEdit(u)}
                            className="text-[11px] text-primary-300 hover:text-primary-200"
                          >
                            Editar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}

              {draft && draft.id === "new" && (
                <tr className="border-t border-slate-800/80 bg-slate-900/60">
                  <td className="px-3 py-2 align-top text-[11px] text-slate-500">
                    novo
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.nome || ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d!, nome: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.email || ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d!, email: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <input
                      className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.telefone || ""}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d!, telefone: e.target.value }))
                      }
                    />
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.perfil || "GESTOR"}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d!,
                          perfil: e.target.value as Usuario["perfil"]
                        }))
                      }
                    >
                      <option value="ADMIN">ADMIN</option>
                      <option value="GESTOR">GESTOR</option>
                      <option value="ATENDENTE">ATENDENTE</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top">
                    <select
                      className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-[11px]"
                      value={draft.ativo ? "1" : "0"}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d!,
                          ativo: e.target.value === "1"
                        }))
                      }
                    >
                      <option value="1">Ativo</option>
                      <option value="0">Inativo</option>
                    </select>
                  </td>
                  <td className="px-3 py-2 align-top text-right">
                    <button
                      disabled={saving}
                      onClick={handleSave}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/90 hover:bg-emerald-400 text-slate-950 px-3 py-1 text-[11px] font-medium disabled:opacity-60 disabled:cursor-not-allowed"
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
