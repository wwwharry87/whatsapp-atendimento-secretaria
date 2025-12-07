// src/components/Layout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { getFormattedVersionInfo } from "../lib/version";

type ClienteInfo = {
  id?: number;
  nome?: string;
  // caso em algum momento você inclua mais campos no retorno,
  // eles podem ser aproveitados aqui:
  razao_social?: string;
  nome_fantasia?: string;
};

type UsuarioLogado = {
  id: string;
  nome: string;
  email?: string;
  tipo?: string;     // perfil amigável para exibir na UI
  perfil?: string;   // perfil técnico que vem do backend (ADMIN, SUPERVISOR, ATENDENTE)
  idcliente?: number;
  cliente?: ClienteInfo;
};

export default function Layout() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);
  const [clienteNome, setClienteNome] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("atende_token");
    const usuarioStr = localStorage.getItem("atende_usuario");

    if (!token || !usuarioStr) {
      navigate("/login");
      return;
    }

    try {
      const u: UsuarioLogado = JSON.parse(usuarioStr);

      setUsuario(u);

      // 1) tenta pegar do objeto do usuário salvo (usuario.cliente.nome)
      let nomeCliente: string | null =
        (u.cliente?.nome ||
          u.cliente?.nome_fantasia ||
          u.cliente?.razao_social) ??
        null;

      // 2) fallback: se em algum lugar você salvar cliente_nome no localStorage
      if (!nomeCliente) {
        nomeCliente =
          localStorage.getItem("cliente_nome") ||
          localStorage.getItem("nome_cliente");
      }

      setClienteNome(nomeCliente);
    } catch {
      setUsuario(null);
      setClienteNome(null);
    }
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("atende_token");
    localStorage.removeItem("atende_usuario");
    // se em algum momento você salvar cliente_nome em localStorage, já limpa:
    localStorage.removeItem("cliente_nome");
    localStorage.removeItem("nome_cliente");
    navigate("/login");
  }

  const versionInfo = getFormattedVersionInfo();

  return (
    <div className="h-screen flex bg-slate-100 overflow-hidden">
      {/* Sidebar fixa */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-200">
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">
            Atende Cidadão
          </h1>
          <p className="text-xs text-slate-500">
            Atendimento público pelo WhatsApp
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 text-sm overflow-y-auto">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2 transition",
                isActive
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/atendimentos"
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2 transition",
                isActive
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")
            }
          >
            Atendimentos
          </NavLink>

          <NavLink
            to="/departamentos"
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2 transition",
                isActive
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")
            }
          >
            Departamentos
          </NavLink>

          <NavLink
            to="/horarios"
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2 transition",
                isActive
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")
            }
          >
            Horários
          </NavLink>

          <NavLink
            to="/usuarios"
            className={({ isActive }) =>
              [
                "block rounded-lg px-3 py-2 transition",
                isActive
                  ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                  : "text-slate-700 hover:bg-slate-100",
              ].join(" ")
            }
          >
            Usuários
          </NavLink>
        </nav>

        {/* Rodapé da sidebar: info do usuário */}
        <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-500 bg-slate-50">
          {usuario ? (
            <>
              <p className="font-semibold text-slate-800 truncate">
                {usuario.nome || "Usuário"}
              </p>
              <p className="truncate">{usuario.email}</p>
              {(usuario.tipo || usuario.perfil) && (
                <p className="uppercase mt-1 text-[10px] tracking-wide text-slate-400">
                  {usuario.tipo || usuario.perfil}
                </p>
              )}
            </>
          ) : (
            <p>Usuário não identificado</p>
          )}
        </div>
      </aside>

      {/* Conteúdo principal: topbar fixa + conteúdo com scroll */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="text-sm text-slate-500">
            {clienteNome ? (
              <span>
                Cliente:{" "}
                <span className="font-semibold text-slate-700">
                  {clienteNome}
                </span>
              </span>
            ) : (
              <span>
                Cliente:{" "}
                <span className="font-semibold text-slate-400">
                  Não identificado
                </span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Info de atualização e versão */}
            <span className="hidden sm:inline-flex max-w-xs px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-[11px] text-slate-500 truncate">
              {versionInfo}
            </span>

            <button
              onClick={handleLogout}
              className="text-xs font-semibold text-red-600 border border-red-400 px-3 py-1.5 rounded-full hover:bg-red-50 transition"
            >
              Sair
            </button>
          </div>
        </header>

        {/* Área de páginas com scroll próprio */}
        <main className="flex-1 p-6 overflow-y-auto bg-slate-50">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
