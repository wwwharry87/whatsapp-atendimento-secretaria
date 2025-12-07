// src/components/VersionUpdateWatcher.tsx
import { useEffect, useState } from "react";
import {
  APP_VERSION,
  APP_BUILD_DATE_ISO,
  VERSION_STORAGE_KEY,
  VERSION_SNOOZE_KEY,
  getFormattedVersionInfo,
} from "../lib/version";

const CHECK_INTERVAL_MS = 60_000; // 1 minuto
const SNOOZE_MINUTES = 5;

// Usamos versão + data do build como ID único daquela versão
const CURRENT_BUILD_ID = `${APP_VERSION}@${APP_BUILD_DATE_ISO}`;

function now() {
  return Date.now();
}

function readSnoozeUntil(): number | null {
  const raw = localStorage.getItem(VERSION_SNOOZE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setSnooze(minutes: number) {
  const until = now() + minutes * 60_000;
  localStorage.setItem(VERSION_SNOOZE_KEY, String(until));
}

export default function VersionUpdateWatcher() {
  const [show, setShow] = useState(false);
  const [info] = useState(() => getFormattedVersionInfo());

  useEffect(() => {
    function check() {
      try {
        const snoozeUntil = readSnoozeUntil();
        if (snoozeUntil && snoozeUntil > now()) {
          // Usuário escolheu "lembrar depois"
          return;
        }

        const last = localStorage.getItem(VERSION_STORAGE_KEY);

        // Primeira vez: grava e não mostra banner
        if (!last) {
          localStorage.setItem(VERSION_STORAGE_KEY, CURRENT_BUILD_ID);
          return;
        }

        // Se mudou o build (versão + data), mostra aviso
        if (last !== CURRENT_BUILD_ID) {
          setShow(true);
        }
      } catch {
        // se der problema com localStorage, só ignora
      }
    }

    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  function handleUpdateNow() {
    try {
      // Marca que este build já foi aplicado
      localStorage.setItem(VERSION_STORAGE_KEY, CURRENT_BUILD_ID);
      localStorage.removeItem(VERSION_SNOOZE_KEY);

      // opcional: limpar sessão para garantir login novo
      localStorage.removeItem("atende_token");
      localStorage.removeItem("atende_usuario");
    } catch {
      // ignora
    }

    // força o browser a recarregar o app
    window.location.reload();
  }

  function handleLembrarDepois() {
    setSnooze(SNOOZE_MINUTES);
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-[9500] flex items-end justify-center pointer-events-none">
      <div className="mb-4 pointer-events-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 max-w-sm w-[320px]">
          <div className="flex items-start gap-3">
            <div className="mt-1 h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold">
              !
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-semibold text-slate-900">
                Nova versão disponível
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Foi detectada uma nova versão do painel{" "}
                <strong>Atende Cidadão</strong>.
              </p>
              <p className="mt-2 text-[10px] text-slate-500">
                {info}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleLembrarDepois}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  Lembrar depois
                </button>
                <button
                  type="button"
                  onClick={handleUpdateNow}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-[11px] font-semibold text-white"
                >
                  Atualizar agora
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
