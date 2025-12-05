// src/Layout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";

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
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-100 flex flex-col shadow-lg">
        <div className="px-4 py-4 border-b border-slate-800">
          <h1 className="text-lg font-bold tracking-tight">Atende Cidadão</h1>
          <p className="text-xs text-slate-400">
            Atendimento público via WhatsApp
          </p>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            Dashboard
          </NavLink>

          <NavLink
            to="/atendimentos"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            Atendimentos
          </NavLink>

          <NavLink
            to="/departamentos"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            Departamentos
          </NavLink>

          <NavLink
            to="/horarios"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            Horários
          </NavLink>

          <NavLink
            to="/usuarios"
            className={({ isActive }) =>
              `block rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive
                  ? "bg-emerald-500 text-white shadow-sm"
                  : "text-slate-200 hover:bg-slate-800"
              }`
            }
          >
            Usuários
          </NavLink>
        </nav>

        <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-400">
          {usuario ? (
            <>
              <p className="font-semibold text-slate-100 truncate">
                {usuario.nome || "Usuário"}
              </p>
              <p className="truncate">{usuario.email}</p>
              <p className="uppercase mt-1 text-[10px] tracking-wide">
                {usuario.tipo}
              </p>
            </>
          ) : (
            <p>Usuário não identificado</p>
          )}
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 flex flex-col">
        {/* Topbar */}
        <header className="h-14 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-10">
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
            className="text-sm font-semibold text-red-600 border border-red-500 px-3 py-1.5 rounded-full hover:bg-red-50 transition"
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
