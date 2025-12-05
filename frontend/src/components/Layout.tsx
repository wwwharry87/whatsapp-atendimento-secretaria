import { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { FiMessageCircle, FiClock, FiUsers, FiSettings, FiHome } from "react-icons/fi";

type Props = {
  children: ReactNode;
};

export default function Layout({ children }: Props) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-slate-800 bg-slate-950/80 backdrop-blur-xl">
        <div className="px-6 py-5 border-b border-slate-800 flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-primary-500/10 border border-primary-500/60 flex items-center justify-center text-primary-300 font-bold">
            AC
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">
              Atende Cidadão
            </div>
            <div className="text-[11px] text-slate-400">
              Painel de Atendimento
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 text-sm">
          <NavItem to="/" icon={<FiHome size={16} />} label="Visão geral" />
          <NavItem
            to="/atendimentos"
            icon={<FiMessageCircle size={16} />}
            label="Atendimentos"
          />
          <NavItem
            to="/departamentos"
            icon={<FiUsers size={16} />}
            label="Departamentos"
          />
          <NavItem
            to="/horarios"
            icon={<FiClock size={16} />}
            label="Horários de atendimento"
          />
          <NavItem
            to="/usuarios"
            icon={<FiSettings size={16} />}
            label="Usuários & Perfis"
          />
        </nav>

        <div className="px-4 py-4 border-t border-slate-800 text-[11px] text-slate-500">
          v0.1 • BW Soluções Inteligentes
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="md:hidden sticky top-0 z-20 bg-slate-950/90 backdrop-blur flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-2xl bg-primary-500/10 border border-primary-500/60 flex items-center justify-center text-primary-300 font-bold">
              AC
            </div>
            <div>
              <div className="text-xs font-semibold">Atende Cidadão</div>
              <div className="text-[10px] text-slate-400">Painel</div>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 md:px-8 py-4 md:py-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

type NavItemProps = {
  to: string;
  icon: React.ReactNode;
  label: string;
};

function NavItem({ to, icon, label }: NavItemProps) {
  return (
    <NavLink
      to={to}
      end={to === "/"}
      className={({ isActive }) =>
        [
          "flex items-center gap-2 px-3 py-2 rounded-xl transition-colors",
          isActive
            ? "bg-primary-500/15 text-primary-100 border border-primary-500/40"
            : "text-slate-300 hover:text-slate-50 hover:bg-slate-800/60"
        ].join(" ")
      }
    >
      <span className="shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
