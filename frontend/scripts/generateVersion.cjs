// scripts/generateVersion.cjs
// Gera src/version.ts com:
// - APP_VERSION = "1.0.X" (X = número de commits do repositório)
// - APP_BUILD_DATETIME_ISO
// - APP_BUILD_DATETIME_DISPLAY

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function getBaseVersion() {
  const pkgPath = path.resolve(__dirname, "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

  const v = pkg.version || "1.0.0";
  const [majorStr, minorStr] = v.split(".");
  const major = parseInt(majorStr || "1", 10) || 1;
  const minor = parseInt(minorStr || "0", 10) || 0;

  return { major, minor };
}

function getPatchFromGit() {
  try {
    const out = execSync("git rev-list --count HEAD").toString().trim();
    const n = parseInt(out, 10);
    if (Number.isFinite(n) && n > 0) {
      return n;
    }
  } catch (err) {
    console.log(
      "[generateVersion] Não consegui obter git rev-list --count HEAD:",
      err.message || err
    );
  }
  // fallback
  return 1;
}

function formatDateForDisplay(d) {
  const pad = (n) => String(n).padStart(2, "0");

  const dia = pad(d.getDate());
  const mes = pad(d.getMonth() + 1);
  const ano = d.getFullYear();
  const hora = pad(d.getHours());
  const min = pad(d.getMinutes());
  const seg = pad(d.getSeconds());

  return `${dia}/${mes}/${ano} às ${hora}:${min}:${seg}`;
}

(function main() {
  const now = new Date();

  const { major, minor } = getBaseVersion();
  const patch = getPatchFromGit();

  const version = `${major}.${minor}.${patch}`;
  const updatedAtISO = now.toISOString();
  const updatedAtDisplay = formatDateForDisplay(now);

  const fileContent = `/**
 * Arquivo gerado automaticamente por scripts/generateVersion.cjs
 * NÃO edite manualmente.
 */

export const APP_VERSION = "${version}";
export const APP_BUILD_DATETIME_ISO = "${updatedAtISO}";
export const APP_BUILD_DATETIME_DISPLAY = "${updatedAtDisplay}";
`;

  const outPath = path.resolve(__dirname, "..", "src", "version.ts");
  fs.writeFileSync(outPath, fileContent, "utf8");

  console.log(
    "[generateVersion] Versão gerada:",
    version,
    "| atualizado em:",
    updatedAtDisplay
  );
})();
