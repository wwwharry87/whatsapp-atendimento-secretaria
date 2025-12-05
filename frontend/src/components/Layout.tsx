// src/Layout.tsx
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { FiGrid, FiMessageSquare, FiClock, FiUsers, FiLayers, FiLogOut, FiUser } from "react-icons/fi"; // Adicione react-icons se puder

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
      setUsuario(JSON.parse(usuarioStr));
    } catch {
      setUsuario(null);
    }
  }, [navigate]);

  function handleLogout() {
    localStorage.removeItem("atende_token");
    localStorage.removeItem("atende_usuario");
    navigate("/login");
  }

  // Estilo base para links do menu
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-emerald-50 text-emerald-700 shadow-sm ring-1 ring-emerald-100" // Ativo Suave
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900" // Inativo
    }`;

  return (
    <div className="min-h-screen flex bg-[#f8fafc]"> {/* Fundo cinza gelo muito suave */}
      
      {/* Sidebar Clara */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shadow-[2px_0_12px_-4px_rgba(0,0,0,0.05)] z-20">
        <div className="px-6 py-6 border-b border-slate-100 flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white font-bold">A</div>
          <div>
            <h1 className="text-base font-bold text-slate-800 tracking-tight leading-none">Atende Cidadão</h1>
            <p className="text-[10px] text-slate-400 mt-0.5">Gestão Municipal</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <NavLink to="/dashboard" className={navLinkClass}>
            <FiGrid size={18} /> Dashboard
          </NavLink>
          <NavLink to="/atendimentos" className={navLinkClass}>
            <FiMessageSquare size={18} /> Atendimentos
          </NavLink>
          <NavLink to="/departamentos" className={navLinkClass}>
            <FiLayers size={18} /> Departamentos
          </NavLink>
          <NavLink to="/horarios" className={navLinkClass}>
             <FiClock size={18} /> Horários
          </NavLink>
          <NavLink to="/usuarios" className={navLinkClass}>
            <FiUsers size={18} /> Usuários
          </NavLink>
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className="flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100">
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <FiUser size={14} />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-xs font-semibold text-slate-700 truncate">
                {usuario?.nome || "Usuário"}
              </p>
              <p className="text-[10px] text-slate-400 truncate">{usuario?.tipo}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white/80 backdrop-blur border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-10">
          <div className="text-sm text-slate-500">
             Bem-vindo ao painel administrativo.
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"
          >
            <FiLogOut size={14} /> Sair
          </button>
        </header>

        <main className="flex-1 p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}