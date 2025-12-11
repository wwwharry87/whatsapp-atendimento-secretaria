// src/pages/RecadosPage.tsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { RecadoListItem, RecadoStatus } from "../types";

type StatusFiltro = "abertos" | "encerrados" | "todos";

type ApiResponse = {
  data: RecadoListItem[];
  total: number;
  page: number;
  perPage: number;
};

function formatarDataBr(valor?: string | null) {
  if (!valor) return "-";
  const d = new Date(valor);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR");
}

function statusLabel(status: RecadoStatus) {
  switch (status) {
    case "LEAVE_MESSAGE":
      return "Recado em análise";
    case "LEAVE_MESSAGE_DECISION":
      return "Aguardando decisão de recado";
    case "FINISHED":
      return "Encerrado";
    default:
      return status;
  }
}

export default function RecadosPage() {
  const [itens, setItens] = useState<RecadoListItem[]>([]);
  // 👉 agora começa em "todos"
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>("todos");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [perPage] = useState(20);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  async function carregar() {
    try {
      setLoading(true);
      const response = await api.get<ApiResponse>("/recados", {
        params: {
          status: statusFiltro,
          search: search || undefined,
          page,
          perPage,
        },
      });

      setItens(response.data.data);
      setTotal(response.data.total);
    } catch (err) {
      console.error("Erro ao carregar recados:", err);
      alert("Erro ao carregar recados.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFiltro, page]);

  function onSubmitFiltro(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    carregar();
  }

  function goPrev() {
    setPage((old) => (old > 1 ? old - 1 : old));
  }

  function goNext() {
    setPage((old) => (old < totalPages ? old + 1 : old));
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">
          Painel de Recados
        </h1>
        <span className="text-sm text-slate-500">
          Atende Cidadão – modo recado
        </span>
      </header>

      <main className="flex-1 px-6 py-4 max-w-6xl w-full mx-auto">
        <form
          onSubmit={onSubmitFiltro}
          className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"
        >
          <div className="flex gap-2">
            {/* 👉 Ordem: Todos, Abertos, Encerrados */}
            <button
              type="button"
              onClick={() => {
                setStatusFiltro("todos");
                setPage(1);
              }}
              className={`px-3 py-1.5 text-sm rounded-full border ${
                statusFiltro === "todos"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              Todos
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFiltro("abertos");
                setPage(1);
              }}
              className={`px-3 py-1.5 text-sm rounded-full border ${
                statusFiltro === "abertos"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              Abertos
            </button>

            <button
              type="button"
              onClick={() => {
                setStatusFiltro("encerrados");
                setPage(1);
              }}
              className={`px-3 py-1.5 text-sm rounded-full border ${
                statusFiltro === "encerrados"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-slate-700 border-slate-300"
              }`}
            >
              Encerrados
            </button>
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou protocolo..."
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full md:w-80"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
            >
              Filtrar
            </button>
          </div>
        </form>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm text-slate-600">
              {loading
                ? "Carregando..."
                : `Total: ${total} recado(s) – página ${page} de ${totalPages}`}
            </span>
          </div>

          <div className="divide-y divide-slate-100">
            {itens.length === 0 && !loading && (
              <div className="px-4 py-6 text-sm text-slate-500 text-center">
                Nenhum recado encontrado para o filtro atual.
              </div>
            )}

            {itens.map((item) => (
              <Link
                key={item.id}
                to={`/recados/${item.id}`}
                className="px-4 py-3 flex flex-col gap-1 hover:bg-slate-50 transition"
              >
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-slate-800">
                      {item.cidadaoNome || "Cidadão sem nome"}
                    </span>
                    <span className="text-xs text-slate-500">
                      Tel: {item.cidadaoNumero}
                    </span>
                  </div>

                  <span
                    className={`text-xs px-2 py-1 rounded-full border ${
                      item.status === "LEAVE_MESSAGE"
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : item.status === "FINISHED"
                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                        : "border-slate-300 bg-slate-50 text-slate-700"
                    }`}
                  >
                    {statusLabel(item.status)}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>
                    Setor:{" "}
                    <strong>{item.departamentoNome || "Não definido"}</strong>
                  </span>
                  {item.protocolo && (
                    <span>
                      Protocolo: <strong>{item.protocolo}</strong>
                    </span>
                  )}
                  <span>
                    Criado em: <strong>{formatarDataBr(item.criadoEm)}</strong>
                  </span>
                  {item.atualizadoEm && (
                    <span>
                      Última atualização:{" "}
                      <strong>{formatarDataBr(item.atualizadoEm)}</strong>
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <div className="px-4 py-2 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={page <= 1 || loading}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {page} de {totalPages}
            </span>
            <button
              type="button"
              onClick={goNext}
              disabled={page >= totalPages || loading}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Próxima
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
