// scripts/generateVersion.cjs
// Gera src/lib/version.ts automaticamente com:
// - APP_VERSION (semver, baseado em data/hora do build)
// - APP_BUILD_DATE_ISO (data/hora do build em ISO)
// - helpers para exibir "Atualizado em: dd/MM/yyyy às HH:mm:ss | v X.Y.Z"
//
// OBS: em ambiente de deploy (como Render), cada build é independente,
// então não conseguimos "ler" a versão anterior de forma confiável.
// Por isso, aqui usamos um esquema de versão baseado na data do build,
// garantindo que cada deploy tenha um número de versão único.

const fs = require("fs");
const path = require("path");

const VERSION_FILE_PATH = path.join(__dirname, "..", "src", "lib", "version.ts");

// Ajuste aqui o major/minor quando houver mudança grande
const BASE_MAJOR_MINOR = "1.0";

/**
 * Retorna uma string no formato YYYYMMDDHHmmss usando UTC.
 */
function buildPatchFromDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const ss = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}${ss}`;
}

function generateFile() {
  const now = new Date();
  const iso = now.toISOString();
  const patch = buildPatchFromDate(now);
  const newVersion = `${BASE_MAJOR_MINOR}.${patch}`;

  const fileContent = `// ESTE ARQUIVO É GERADO AUTOMATICAMENTE POR scripts/generateVersion.cjs
// NÃO EDITE MANUALMENTE.

export const APP_VERSION = "${newVersion}";
export const APP_BUILD_DATE_ISO = "${iso}";

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

    const [data, hora] = formatted.split(" ");

    if (!data || !hora) {
      return "v " + APP_VERSION;
    }

    return \`Atualizado em: \${data} às \${hora} | v \${APP_VERSION}\`;
  } catch {
    return "v " + APP_VERSION;
  }
}
`;

  fs.mkdirSync(path.dirname(VERSION_FILE_PATH), { recursive: true });
  fs.writeFileSync(VERSION_FILE_PATH, fileContent, "utf-8");

  console.log("[generateVersion] Versão gerada:", newVersion, "build em", iso);
}

generateFile();
