// scripts/generateVersion.cjs
// ATENÇÃO: esse script gera src/lib/version.ts automaticamente em cada build

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function getCommitCount() {
  try {
    const output = execSync("git rev-list --count HEAD").toString().trim();
    const n = parseInt(output, 10);
    if (Number.isNaN(n)) throw new Error("NaN");
    return n;
  } catch (e) {
      console.warn(
        "[version] Não consegui ler quantidade de commits, usando patch 0"
      );
      return 0;
  }
}

// 👇 aqui você define o “major.minor”
const MAJOR = 1;
const MINOR = 0;
const PATCH_BASE = 0; // se quiser começar em 1.0.101, etc, muda aqui

const commitCount = getCommitCount();
const patch = PATCH_BASE + commitCount;

const version = `${MAJOR}.${MINOR}.${patch}`;
const buildDate = new Date().toISOString();

const fileContent = `// ATENÇÃO: arquivo gerado automaticamente por scripts/generateVersion.cjs
// Não edite esse arquivo na mão.

export const APP_VERSION = "${version}";
export const APP_BUILD_DATETIME = "${buildDate}";

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

    return \`Atualização: \${data} às \${hora} | versão: \${APP_VERSION}\`;
  } catch {
    return \`Versão: \${APP_VERSION}\`;
  }
}
`;

const targetPath = path.join(__dirname, "..", "src", "lib", "version.ts");
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
fs.writeFileSync(targetPath, fileContent, { encoding: "utf8" });

console.log(`[version] Gerado src/lib/version.ts com versão ${version}`);
