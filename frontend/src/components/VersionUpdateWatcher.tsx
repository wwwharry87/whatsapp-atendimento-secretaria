// src/components/VersionUpdateWatcher.tsx
import { useEffect, useState } from "react";
import {
  APP_VERSION,
  VERSION_STORAGE_KEY,
  VERSION_SNOOZE_KEY,
  getFormattedVersionInfo,
} from "../lib/version";

type ModalState = "hidden" | "visible";

export default function VersionUpdateWatcher() {
  const [modalState, setModalState] = useState<ModalState>("hidden");

  function checkVersionAndSnooze() {
    try {
      const storedVersion = localStorage.getItem(VERSION_STORAGE_KEY);
      const snoozeUntilStr = localStorage.getItem(VERSION_SNOOZE_KEY);
      const now = Date.now();

      const snoozeUntil = snoozeUntilStr ? Number(snoozeUntilStr) : 0;

      const hasNewVersion = storedVersion !== APP_VERSION;
      const canShow = !snoozeUntil || now >= snoozeUntil;

      if (hasNewVersion && canShow) {
        setModalState("visible");
      }
    } catch {
      // se der erro com localStorage, só não mostra o modal
    }
  }

  useEffect(() => {
    // primeira checagem
    checkVersionAndSnooze();

    // checa a cada 60s se já pode voltar a mostrar (para o caso do "lembrar mais tarde")
    const interval = setInterval(() => {
      checkVersionAndSnooze();
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  function handleUpdateNow() {
    try {
      // grava a versão nova como "já aplicada"
      localStorage.setItem(VERSION_STORAGE_KEY, APP_VERSION);
      localStorage.removeItem(VERSION_SNOOZE_KEY);

      // limpa sessão do usuário
      localStorage.removeItem("atende_token");
      localStorage.removeItem("atende_usuario");

      // tenta limpar caches (PWA / browser)
      if ("caches" in window) {
        caches.keys().then((keys) => {
          keys.forEach((key) => {
            caches.delete(key).catch(() => {});
          });
        });
      }
    } catch {
      // se alguma coisa falhar, vamos recarregar mesmo assim
    } finally {
      // força reload -> volta para login com versão nova
      window.location.href = "/";
    }
  }

  function handleRemindLater() {
    const fiveMinutes = 5 * 60 * 1000;
    const snoozeUntil = Date.now() + fiveMinutes;

    try {
      localStorage.setItem(VERSION_SNOOZE_KEY, String(snoozeUntil));
    } catch {
      // se não conseguir salvar, só não vai respeitar o "lembrar depois"
    }

    setModalState("hidden");
  }

  if (modalState === "hidden") return null;

  const versionInfo = getFormattedVersionInfo();

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 p-5">
        <div className="flex items-start gap-3">
          <div className="mt-1 h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-sm font-bold">
            !
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-900">
              Nova versão disponível
            </h2>

            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              O sistema <span className="font-semibold">Atende Cidadão</span>{" "}
              foi atualizado. Para garantir que tudo funcione corretamente,
              recomendamos aplicar a atualização agora.
            </p>

            {/* Linha com data/hora e versão */}
            <p className="mt-2 text-[11px] text-slate-500">
              {versionInfo}
            </p>

            <p className="mt-2 text-[11px] text-slate-500">
              Ao atualizar, vamos limpar o cache, encerrar sua sessão e você
              precisará fazer login novamente.
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              Se escolher <span className="font-semibold">“Lembrar mais tarde”</span>, 
              voltaremos a avisar em cerca de 5 minutos.
            </p>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleRemindLater}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
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
  );
}
