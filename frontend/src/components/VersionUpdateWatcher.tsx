// src/components/VersionUpdateWatcher.tsx
import { useEffect, useState } from "react";
import { VERSION_SNOOZE_KEY, getFormattedVersionInfo } from "../lib/version";

const SW_INSTALLED_KEY = "atende_sw_installed";
const SNOOZE_MINUTES = 5;

function now() {
  return Date.now();
}

function readSnoozeUntil(): number | null {
  try {
    const raw = localStorage.getItem(VERSION_SNOOZE_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function setSnooze(minutes: number) {
  try {
    const until = now() + minutes * 60_000;
    localStorage.setItem(VERSION_SNOOZE_KEY, String(until));
  } catch {
    // ignore
  }
}

export default function VersionUpdateWatcher() {
  const [show, setShow] = useState(false);
  const [info] = useState(() => getFormattedVersionInfo());

  useEffect(() => {
    function handleSwMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== "NEW_VERSION_AVAILABLE") return;

      try {
        const firstInstall = !localStorage.getItem(SW_INSTALLED_KEY);
        if (firstInstall) {
          // primeira vez que o SW é instalado: só marca e não mostra modal
          localStorage.setItem(SW_INSTALLED_KEY, "1");
          console.log("[VersionUpdateWatcher] Service worker instalado.");
          return;
        }

        const snoozeUntil = readSnoozeUntil();
        if (snoozeUntil && snoozeUntil > now()) {
          // já foi solicitado "lembrar depois" recentemente
          return;
        }
      } catch {
        // se der erro com localStorage, segue fluxo normal
      }

      setShow(true);
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
    try {
      // Limpa sessão para garantir que volte para o login
      localStorage.removeItem("atende_token");
      localStorage.removeItem("atende_usuario");
      localStorage.removeItem(VERSION_SNOOZE_KEY);
    } catch {
      // ignore
    }

    // Recarrega a aplicação para buscar a versão nova
    window.location.reload();
  }

  function handleLembrarDepois() {
    setSnooze(SNOOZE_MINUTES);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1 h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-lg font-bold">
              ↑
            </div>

            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">
                Atualização disponível
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Foi detectada uma versão mais recente do painel{" "}
                <strong>Atende Cidadão</strong>.
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Ao atualizar, o sistema será recarregado e você será
                redirecionado para a tela de login para acessar novamente.
                Recomendamos concluir atendimentos em andamento antes de
                continuar.
              </p>

              <p className="mt-3 text-[11px] text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                {info}
              </p>

              <div className="mt-4 flex flex-col sm:flex-row justify-end gap-2">
                <button
                  type="button"
                  onClick={handleLembrarDepois}
                  className="px-4 py-2 rounded-full border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition"
                >
                  Lembrar depois
                </button>
                <button
                  type="button"
                  onClick={handleUpdateNow}
                  className="px-5 py-2 rounded-full bg-emerald-500 hover:bg-emerald-600 text-xs font-semibold text-white transition"
                >
                  Atualizar e voltar ao login
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
