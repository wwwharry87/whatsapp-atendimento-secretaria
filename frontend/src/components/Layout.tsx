// src/components/Layout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { APP_VERSION, APP_BUILD_DATETIME } from "../lib/version";

type UsuarioLogado = {
  id: string;
  nome: string;
  email?: string;
  tipo?: string;
};

export default function Layout() {
  const navigate = useNavigate();
  const [usuario, setUsuario] = useState<UsuarioLogado | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("atende_token");
    const usuarioStr = localStorage.getItem("atende_usuario");

    if (!token || !usuarioStr) {
      navigate("/login");
      return;
    }

    try {
      const u = JSON.parse(usuarioStr);
      setUsuario(u);
    } catch {
      setUsuario(null);
    }
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("atende_token");
    localStorage.removeItem("atende_usuario");
    navigate("/login");
  }

  return (
    <div className="min-h-screen flex bg-slate-100">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-4 py-4 border-b border-slate-200">
          <h1 className="text-lg font-semibold tracking-tight text-slate-800">
            Atende Cidadão
          </h1>
          <p className="text-xs text-slate-500">
            Atendimento público pelo WhatsApp
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
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

        {/* Rodapé da sidebar: usuário + versão */}
        <div className="px-4 py-3 border-t border-slate-200 text-xs text-slate-500 bg-slate-50">
          {usuario ? (
            <>
              <p className="font-semibold text-slate-800 truncate">
                {usuario.nome || "Usuário"}
              </p>
              <p className="truncate">{usuario.email}</p>
              {usuario.tipo && (
                <p className="uppercase mt-1 text-[10px] tracking-wide text-slate-400">
                  {usuario.tipo}
                </p>
              )}
            </>
          ) : (
            <p>Usuário não identificado</p>
          )}

          {/* Linha separadora para info de versão */}
          <div className="mt-2 pt-2 border-t border-slate-200 text-[10px] leading-relaxed text-slate-400">
            <p className="truncate">{APP_BUILD_DATETIME}</p>
            <p className="mt-0.5">Versão interna: {APP_VERSION}</p>
          </div>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6">
          <div className="text-sm text-slate-500">
            {usuario ? (
              <span>
                Logado como{" "}
                <span className="font-semibold text-slate-700">
                  {usuario.nome}
                </span>
              </span>
            ) : (
              <span>Carregando usuário...</span>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="text-xs font-semibold text-red-600 border border-red-400 px-3 py-1.5 rounded-full hover:bg-red-50 transition"
          >
            Sair
          </button>
        </header>

        {/* Área de páginas */}
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
