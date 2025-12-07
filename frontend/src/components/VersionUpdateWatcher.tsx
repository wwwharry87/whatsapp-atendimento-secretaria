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

        // Primeira vez: grava e não mostra modal
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

      // limpa sessão para garantir que volte pro login
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
    <div className="fixed inset-0 z-[9500] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md px-4">
        <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6">
          <div className="flex items-start gap-4">
            <div className="mt-1 h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-lg font-bold">
              ↑
            </div>

            <div className="flex-1">
              <h2 className="text-base font-semibold text-slate-900">
                Nova versão do painel disponível
              </h2>

              <p className="mt-2 text-sm text-slate-600">
                Uma nova versão do <strong>Atende Cidadão</strong> foi instalada
                neste dispositivo.
              </p>

              <p className="mt-2 text-xs text-slate-500">
                Ao atualizar, o sistema será recarregado e você será
                redirecionado para a tela de login para acessar novamente.
                Recomendamos concluir atendimentos em andamento antes de
                atualizar.
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
