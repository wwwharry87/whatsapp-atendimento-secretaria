// src/pages/DepartamentosPage.tsx
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Departamento, Usuario } from "../types";
import { FiPlus, FiSave } from "react-icons/fi";

// Draft: todos campos opcionais e id pode ser number ou "new"
type Draft = Omit<Partial<Departamento>, "id"> & { id?: number | "new" };

type DepartamentoAgente = {
  usuario_id: string;
  nome: string;
  telefone?: string | null;
  perfil?: string | null;
  principal: boolean;
};

export default function DepartamentosPage() {
  const [items, setItems] = useState<Departamento[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [agentesPorDepartamento, setAgentesPorDepartamento] = useState<
    Record<number, DepartamentoAgente[]>
  >({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [loadingAgentesDep, setLoadingAgentesDep] = useState<number | null>(
    null
  );
  const [savingAgentesDep, setSavingAgentesDep] = useState<number | null>(
    null
  );

  async function load() {
    try {
      setLoading(true);
      const [depsRes, usuariosRes] = await Promise.all([
        api.get<Departamento[]>("/departamentos"),
        api.get<Usuario[]>("/usuarios"),
      ]);

      setItems(depsRes.data);
      setUsuarios(usuariosRes.data);
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao carregar departamentos/usuários. Verifique o backend.");
    } finally {
      setLoading(false);
    }
  }

  async function loadAgentesDepartamento(departamentoId: number) {
    try {
      setLoadingAgentesDep(departamentoId);
      const { data } = await api.get<DepartamentoAgente[]>(
        `/departamentos/${departamentoId}/agentes`
      );
      setAgentesPorDepartamento((prev) => ({
        ...prev,
        [departamentoId]: data,
      }));
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao carregar agentes do departamento.");
    } finally {
      setLoadingAgentesDep(null);
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

    // Carrega agentes do departamento se ainda não estiver em cache
    if (!agentesPorDepartamento[dep.id]) {
      loadAgentesDepartamento(dep.id);
    }
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

  function toggleAgenteDepartamento(departamentoId: number, usuario: Usuario) {
    setAgentesPorDepartamento((prev) => {
      const atual = prev[departamentoId] || [];
      const existe = atual.find((a) => a.usuario_id === usuario.id);

      if (existe) {
        // se já está, remove (desvincula)
        const novo = atual.filter((a) => a.usuario_id !== usuario.id);
        return { ...prev, [departamentoId]: novo };
      }

      // se não está, adiciona como novo agente
      const novoAgente: DepartamentoAgente = {
        usuario_id: usuario.id,
        nome: usuario.nome,
        telefone: (usuario as any).telefone ?? null,
        perfil: (usuario as any).perfil ?? null,
        principal: atual.length === 0, // se for o primeiro, já marca como principal
      };

      return { ...prev, [departamentoId]: [...atual, novoAgente] };
    });
  }

  function definirPrincipalDepartamento(
    departamentoId: number,
    usuarioId: string
  ) {
    setAgentesPorDepartamento((prev) => {
      const atual = prev[departamentoId] || [];
      const novo = atual.map((a) => ({
        ...a,
        principal: a.usuario_id === usuarioId,
      }));
      return { ...prev, [departamentoId]: novo };
    });
  }

  async function salvarAgentesDepartamento(departamentoId: number) {
    const agentes = agentesPorDepartamento[departamentoId] || [];
    setSavingAgentesDep(departamentoId);
    setErro(null);

    try {
      await api.post(`/departamentos/${departamentoId}/agentes`, {
        agentes: agentes.map((a) => ({
          usuario_id: a.usuario_id,
          principal: a.principal,
        })),
      });
    } catch (err: any) {
      console.error(err);
      setErro("Erro ao salvar agentes do departamento.");
    } finally {
      setSavingAgentesDep(null);
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
            atendimentos. Configure também os agentes que atendem cada setor.
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
                  const agentes = agentesPorDepartamento[dep.id] || [];

                  return (
                    <>
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
                                    ? {
                                        ...prev,
                                        responsavel_nome: e.target.value,
                                      }
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

                      {/* Editor de agentes do departamento (mostra só quando está editando) */}
                      {isEditing && (
                        <tr
                          key={`${dep.id}-agentes`}
                          className="border-t border-slate-100 bg-slate-50/60"
                        >
                          <td colSpan={5} className="px-3 py-3">
                            <AgentesDepartamentoEditor
                              departamento={dep}
                              usuarios={usuarios}
                              agentes={agentes}
                              carregando={loadingAgentesDep === dep.id}
                              salvando={savingAgentesDep === dep.id}
                              onToggleAgente={(usuario) =>
                                toggleAgenteDepartamento(dep.id, usuario)
                              }
                              onSetPrincipal={(usuarioId) =>
                                definirPrincipalDepartamento(dep.id, usuarioId)
                              }
                              onSalvar={() =>
                                salvarAgentesDepartamento(dep.id)
                              }
                            />
                          </td>
                        </tr>
                      )}
                    </>
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

type AgentesDepartamentoEditorProps = {
  departamento: Departamento;
  usuarios: Usuario[];
  agentes: DepartamentoAgente[];
  carregando: boolean;
  salvando: boolean;
  onToggleAgente: (usuario: Usuario) => void;
  onSetPrincipal: (usuarioId: string) => void;
  onSalvar: () => void;
};

function AgentesDepartamentoEditor({
  departamento,
  usuarios,
  agentes,
  carregando,
  salvando,
  onToggleAgente,
  onSetPrincipal,
  onSalvar,
}: AgentesDepartamentoEditorProps) {
  const agentesIds = new Set(agentes.map((a) => a.usuario_id));

  return (
    <div className="border border-slate-200 rounded-2xl bg-white p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-slate-900">
            Agentes do departamento: {departamento.nome}
          </div>
          <div className="text-[11px] text-slate-500">
            Selecione quais usuários podem atender este setor e defina o
            agente principal.
          </div>
        </div>
        <button
          type="button"
          onClick={onSalvar}
          disabled={salvando}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1 text-[11px] font-medium disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <FiSave size={12} />
          Salvar agentes
        </button>
      </div>

      {carregando ? (
        <div className="text-[11px] text-slate-500">Carregando agentes...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Lista de usuários disponíveis */}
          <div className="border border-slate-200 rounded-xl p-2">
            <div className="text-[11px] font-semibold text-slate-800 mb-1">
              Usuários disponíveis
            </div>
            <div className="max-h-48 overflow-auto space-y-1">
              {usuarios.length === 0 && (
                <div className="text-[11px] text-slate-500">
                  Nenhum usuário encontrado.
                </div>
              )}
              {usuarios.map((u) => {
                const selecionado = agentesIds.has(u.id);
                return (
                  <label
                    key={u.id}
                    className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] cursor-pointer border ${
                      selecionado
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                        : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                    }`}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium truncate">{u.nome}</span>
                      {(u as any).telefone && (
                        <span className="text-[10px] text-slate-500">
                          {(u as any).telefone}
                        </span>
                      )}
                    </span>
                    <input
                      type="checkbox"
                      checked={selecionado}
                      onChange={() => onToggleAgente(u)}
                      className="h-3 w-3"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Lista de agentes do departamento */}
          <div className="border border-slate-200 rounded-xl p-2">
            <div className="text-[11px] font-semibold text-slate-800 mb-1">
              Agentes deste departamento
            </div>
            <div className="max-h-48 overflow-auto space-y-1">
              {agentes.length === 0 && (
                <div className="text-[11px] text-slate-500">
                  Nenhum agente selecionado ainda.
                </div>
              )}
              {agentes.map((a) => (
                <div
                  key={a.usuario_id}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[11px] bg-slate-50 border border-slate-200"
                >
                  <div className="flex flex-col">
                    <span className="font-medium truncate">{a.nome}</span>
                    {a.telefone && (
                      <span className="text-[10px] text-slate-500">
                        {a.telefone}
                      </span>
                    )}
                  </div>
                  <label className="inline-flex items-center gap-1 text-[10px] text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name={`principal-${departamento.id}`}
                      checked={a.principal}
                      onChange={() => onSetPrincipal(a.usuario_id)}
                      className="h-3 w-3"
                    />
                    <span>Principal</span>
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
