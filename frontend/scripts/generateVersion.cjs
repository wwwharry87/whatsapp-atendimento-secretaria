// scripts/generateVersion.cjs
// Gera src/lib/version.ts automaticamente com:
// - APP_VERSION em formato semver simples: MAJOR.MINOR.PATCH
//   - PATCH vai de 0 até 99
//   - MINOR vai de 0 até 9
//   - Quando PATCH > 99, reseta para 0 e incrementa MINOR
//   - Quando MINOR > 9, reseta para 0 e incrementa MAJOR
// - APP_BUILD_DATE_ISO (data/hora do build)
// - Helpers para mostrar:
//   "Atualizado em: dd/MM/yyyy, às HH:mm:ss | v X.Y.Z"
//
// IMPORTANTE:
// Em serviços de deploy automático (como Render, Vercel etc.),
// cada build começa a partir dos arquivos do repositório.
// Para que a versão avance (1.0.1 → 1.0.2 → 1.0.3 ...),
// é necessário que o arquivo gerado src/lib/version.ts
// seja commitado em algum momento no Git.
// Se o arquivo nunca for commitado, o build remoto
// sempre vai partir da mesma versão base.

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
 * "Atualizado em: dd/MM/yyyy, às HH:mm:ss | v X.Y.Z"
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

    // Normalmente vem "dd/mm/aaaa hh:mm:ss"
    const [data, hora] = formatted.split(" ");
    if (!data || !hora) {
      return "v " + APP_VERSION;
    }

    return \`Atualizado em: \${data}, às \${hora} | v \${APP_VERSION}\`;
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
