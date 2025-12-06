// scripts/generateVersion.cjs
// Gera src/lib/version.ts automaticamente com:
// - APP_VERSION (semver, incrementando patch a cada execução)
// - APP_BUILD_DATE_ISO (data/hora do build)
// - helpers para mostrar "Atualizado em: dd/MM/yyyy às HH:mm:ss | v X.Y.Z"

const fs = require("fs");
const path = require("path");

const VERSION_FILE_PATH = path.join(__dirname, "..", "src", "lib", "version.ts");

function readCurrentVersion() {
  try {
    if (!fs.existsSync(VERSION_FILE_PATH)) {
      return "1.0.0";
    }

    const content = fs.readFileSync(VERSION_FILE_PATH, "utf-8");
    const match = content.match(/APP_VERSION\s*=\s*"([^"]+)"/);

    if (!match) return "1.0.0";

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

function bumpPatch(version) {
  const [major, minor, patch] = version.split(".").map((n) => parseInt(n, 10));
  const newPatch = (patch || 0) + 1;
  return `${major}.${minor}.${newPatch}`;
}

function generateFile() {
  const previousVersion = readCurrentVersion();
  const newVersion = bumpPatch(previousVersion);

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

    const formatted = date.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
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

  console.log(
    "[generateVersion] Versão gerada:",
    newVersion,
    "build em",
    iso
  );
}

generateFile();
