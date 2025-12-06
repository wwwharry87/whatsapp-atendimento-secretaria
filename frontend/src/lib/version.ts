// src/lib/version.ts

export const APP_VERSION = "1.0.1";
export const APP_BUILD_DATETIME = "2025-12-05T21:24:00-03:00";

export const VERSION_STORAGE_KEY = "atende_app_version";
export const VERSION_SNOOZE_KEY = "atende_app_version_snooze_until";

export function getFormattedVersionInfo(): string {
  try {
    const dt = new Date(APP_BUILD_DATETIME);
    const data = dt.toLocaleDateString("pt-BR");
    const hora = dt.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

    return `Atualização: ${data} às ${hora} | versão: ${APP_VERSION}`;
  } catch {
    return `Versão: ${APP_VERSION}`;
  }
}
