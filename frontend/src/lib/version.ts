// ESTE ARQUIVO É GERADO AUTOMATICAMENTE POR scripts/generateVersion.cjs
// NÃO EDITE MANUALMENTE.

export const APP_VERSION = "1.0.54";
export const APP_BUILD_DATE_ISO = "2025-12-06T02:23:32.323Z";

export const VERSION_STORAGE_KEY = "atende_app_version";
export const VERSION_SNOOZE_KEY = "atende_app_version_snooze_until";

/**
 * Retorna um texto amigável com:
 * "Atualizado em: dd/MM/yyyy às HH:mm:ss | v X.Y.Z"
 */
export function getFormattedVersionInfo(): string {
  try {
    const date = new Date(APP_BUILD_DATE_ISO);

    const formatted = date.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour12: false,
    });

    const [data, hora] = formatted.split(" ");

    if (!data || !hora) {
      return "v " + APP_VERSION;
    }

    return `Atualizado em: ${data} às ${hora} | v ${APP_VERSION}`;
  } catch {
    return "v " + APP_VERSION;
  }
}
