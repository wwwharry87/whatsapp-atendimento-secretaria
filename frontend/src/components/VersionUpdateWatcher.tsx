// frontend/src/components/VersionUpdateWatcher.tsx
import { useEffect, useState } from "react";
import { APP_VERSION, getFormattedVersionInfo } from "../lib/version";

const STORAGE_KEY = "atende_cidadao_last_version";
const SNOOZE_KEY = "atende_cidadao_update_snooze_until";

const CHECK_INTERVAL_MS = 60_000; // 1 minuto
const SNOOZE_MINUTES = 5;

function getNow() {
  return Date.now();
}

function getSnoozeUntil(): number | null {
  const raw = localStorage.getItem(SNOOZE_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function setSnooze(minutes: number) {
  const until = getNow() + minutes * 60_000;
  localStorage.setItem(SNOOZE_KEY, String(until));
}

export default function VersionUpdateWatcher() {
  const [show, setShow] = useState(false);
  const [info] = useState(getFormattedVersionInfo());

  useEffect(() => {
    function check() {
      try {
        const last = localStorage.getItem(STORAGE_KEY);
        const snoozeUntil = getSnoozeUntil();

        if (snoozeUntil && snoozeUntil > getNow()) {
          return;
        }

        if (!last) {
          localStorage.setItem(STORAGE_KEY, APP_VERSION);
          return;
        }

        if (last !== APP_VERSION) {
          setShow(true);
        }
      } catch {
        // ignora
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  function handleUpdateNow() {
    try {
      localStorage.setItem(STORAGE_KEY, APP_VERSION);
      localStorage.removeItem(SNOOZE_KEY);
    } catch {}
    // força reload completo
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

              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                O sistema{" "}
                <span className="font-semibold">Atende Cidadão</span> foi
                atualizado. Para garantir que tudo funcione corretamente,
                recomendamos aplicar a atualização agora.
              </p>

              <p className="mt-2 text-[11px] text-slate-500">
                {info}
              </p>

              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleLembrarDepois}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] text-slate-600 hover:bg-slate-50"
                >
                  Lembrar mais tarde
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
