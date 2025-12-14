// ESTE ARQUIVO É GERADO AUTOMATICAMENTE POR scripts/generateVersion.cjs
// NÃO EDITE MANUALMENTE.

export const APP_VERSION = "1.0.29";
export const APP_BUILD_DATE_ISO = "2025-12-14T03:33:56.707Z";

export const VERSION_STORAGE_KEY = "atende_app_version";
export const VERSION_SNOOZE_KEY = "atende_app_version_snooze_until";

/**
 * Retorna um texto amigável com:
 * "Atualizado em: dd/MM/yyyy às HH:mm:ss | v X.Y.Z"
 */
export function getFormattedVersionInfo(): string {
  try {
    const date = new Date(APP_BUILD_DATE_ISO);
    if (Number.isNaN(date.getTime())) {
      return "v " + APP_VERSION;
    }

    const formatted = date.toLocaleString("pt-BR", {
      timeZone: "America/Fortaleza",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    // Normalmente vem "dd/mm/aaaa, hh:mm:ss"
    const [dataRaw, hora] = formatted.split(" ");
    if (!dataRaw || !hora) {
      return "v " + APP_VERSION;
    }

    // Remove vírgulas sobrando do final da data, ex: "07/12/2025,"
    const data = dataRaw.replace(/,+$/, "");

    return `Atualizado em: ${data} às ${hora} | v ${APP_VERSION}`;
  } catch {
    return "v " + APP_VERSION;
  }
}
