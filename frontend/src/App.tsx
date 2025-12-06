// src/App.tsx
import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AtendimentosPage from "./pages/AtendimentosPage";
import AtendimentoDetalhePage from "./pages/AtendimentoDetalhePage";
import DepartamentosPage from "./pages/DepartamentosPage";
import HorariosPage from "./pages/HorariosPage";
import UsuariosPage from "./pages/UsuariosPage";

const SW_INSTALLED_KEY = "atende_sw_installed";

export default function App() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const [snoozed, setSnoozed] = useState(false);

  useEffect(() => {
    // Listener para mensagens vindas do service worker
    function handleSwMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;

      if (data.type === "NEW_VERSION_AVAILABLE") {
        const firstInstall = !localStorage.getItem(SW_INSTALLED_KEY);

        // Primeira instalação: só marca como instalado e NÃO mostra banner
        if (firstInstall) {
          localStorage.setItem(SW_INSTALLED_KEY, "1");
          console.log("[SW] Primeira instalação registrada.");
          return;
        }

        console.log("[SW] Nova versão detectada pelo service worker.");
        setHasUpdate(true);
        setSnoozed(false);
      }
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", handleSwMessage);
    }

    return () => {
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.removeEventListener("message", handleSwMessage);
      }
    };
  }, []);

  function handleUpdateNow() {
    // limpa sessão e força recarregar com o novo bundle
    localStorage.removeItem("atende_token");
    localStorage.removeItem("atende_usuario");

    // se quiser limpar outras coisas específicas, pode colocar aqui

    window.location.reload();
  }

  function handleRemindLater() {
    // Esconde por agora, mas lembra depois de 5 minutos
    setHasUpdate(false);
    setSnoozed(true);

    setTimeout(() => {
      setSnoozed(false);
      setHasUpdate(true);
    }, 5 * 60 * 1000); // 5 minutos
  }

  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="atendimentos" element={<AtendimentosPage />} />
          <Route path="atendimentos/:id" element={<AtendimentoDetalhePage />} />

          <Route path="departamentos" element={<DepartamentosPage />} />
          <Route path="horarios" element={<HorariosPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>

      {/* Banner flutuante de nova versão disponível */}
      {hasUpdate && !snoozed && (
        <div className="fixed bottom-4 right-4 z-50 max-w-sm">
          <div className="bg-slate-900 text-slate-50 px-4 py-3 rounded-xl shadow-lg text-xs sm:text-sm flex flex-col gap-3">
            <div>
              <p className="font-semibold">Nova versão disponível</p>
              <p className="text-slate-300 mt-1">
                Há uma atualização do painel <strong>Atende Cidadão</strong>.
                Atualizar agora pode exigir um novo login.
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleRemindLater}
                className="px-3 py-1.5 rounded-full border border-slate-500 text-slate-200 text-xs hover:bg-slate-800 transition"
              >
                Lembrar mais tarde
              </button>
              <button
                type="button"
                onClick={handleUpdateNow}
                className="px-3 py-1.5 rounded-full bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition"
              >
                Atualizar agora
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
