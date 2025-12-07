// scripts/generateVersion.cjs
// Gera src/lib/version.ts automaticamente com:
// - APP_VERSION no formato MAJOR.MINOR.PATCH
//   - PATCH: 0 → 99
//   - MINOR: 0 → 9
//   - Quando PATCH > 99  → PATCH = 0 e MINOR++
//   - Quando MINOR > 9   → MINOR = 0 e MAJOR++
// - APP_BUILD_DATE_ISO: data/hora exata do build
// - getFormattedVersionInfo():
//   "Atualizado em: dd/MM/yyyy às HH:mm:ss | v X.Y.Z"
//
// IMPORTANTE (Render / deploy automático):
// O build remoto sempre começa da versão que está COMMITADA
// em src/lib/version.ts. Para a versão subir de 1.0.1 → 1.0.2 etc.
// entre deploys no Render, é importante COMMITAR o version.ts
// gerado de vez em quando (por exemplo, em cada release).

const fs = require("fs");
const path = require("path");

const VERSION_FILE_PATH = path.join(
  __dirname,
  "..",
  "src",
  "lib",
  "version.ts"
);

function readCurrentVersion() {
  try {
    if (!fs.existsSync(VERSION_FILE_PATH)) {
      return "1.0.0";
    }

    const content = fs.readFileSync(VERSION_FILE_PATH, "utf-8");
    const match = content.match(
      /APP_VERSION\s*=\s*\"(\d+\.\d+\.\d+)\"/
    );

    if (!match) {
      return "1.0.0";
    }

    const current = match[1];
    const parts = current.split(".").map((n) => parseInt(n, 10));

    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) {
      return "1.0.0";
    }

    return current;
  } catch {
    return "1.0.0";
  }
}

function bumpVersion(version) {
  let [major, minor, patch] = version.split(".").map((n) => parseInt(n, 10));

  if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
    major = 1;
    minor = 0;
    patch = 0;
  }

  patch += 1;

  if (patch > 99) {
    patch = 0;
    minor += 1;
  }

  if (minor > 9) {
    minor = 0;
    major += 1;
  }

  return `${major}.${minor}.${patch}`;
}

function generateFile() {
  const current = readCurrentVersion();
  const newVersion = bumpVersion(current);
  const now = new Date();
  const iso = now.toISOString();

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

    // Normalmente vem "dd/mm/aaaa, hh:mm:ss"
    const [dataRaw, hora] = formatted.split(" ");
    if (!dataRaw || !hora) {
      return "v " + APP_VERSION;
    }

    // Remove vírgulas sobrando do final da data, ex: "07/12/2025,"
    const data = dataRaw.replace(/,+$/, "");

    return \`Atualizado em: \${data} às \${hora} | v \${APP_VERSION}\`;
  } catch {
    return "v " + APP_VERSION;
  }
}
`;

  fs.mkdirSync(path.dirname(VERSION_FILE_PATH), { recursive: true });
  fs.writeFileSync(VERSION_FILE_PATH, fileContent, "utf-8");

  console.log("[generateVersion] Versão anterior:", current);
  console.log(
    "[generateVersion] Nova versão:",
    newVersion,
    "build em",
    iso
  );
}

generateFile();
