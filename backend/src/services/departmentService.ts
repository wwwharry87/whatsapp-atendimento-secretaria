// src/services/departmentService.ts
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";

type ListarDepartamentosOpts = {
  idcliente?: number;
  somenteAtivos?: boolean;
};

/**
 * Lista departamentos, com filtro opcional por cliente e/ou ativos.
 * - Se idcliente não for informado, retorna de todos os clientes (uso interno/admin).
 * - Por padrão, retorna somente ativos.
 */
export async function listarDepartamentos(
  opts: ListarDepartamentosOpts = {}
): Promise<Departamento[]> {
  const repo = AppDataSource.getRepository(Departamento);

  const { idcliente, somenteAtivos = true } = opts;

  const where: any = {};
  if (typeof idcliente === "number") where.idcliente = idcliente;
  if (somenteAtivos) where.ativo = true;

  const deps = await repo.find({
    where: Object.keys(where).length ? where : undefined,
    order: { id: "ASC" },
  });

  return deps;
}

type MenuDepartamentosOpts = {
  /**
   * Se true, NÃO adiciona o rodapé de instrução.
   * Útil quando a mensagem já contém instruções.
   */
  semRodape?: boolean;
  /** Se true, não inclui a linha de título do menu. */
  semTitulo?: boolean;
};

/**
 * Retorna o texto do menu de departamentos (1..N) do cliente informado.
 */
export async function montarMenuDepartamentos(
  idcliente: number,
  opts: MenuDepartamentosOpts = {}
): Promise<string> {
  const deps = await listarDepartamentos({ idcliente, somenteAtivos: true });

  const { semRodape = false, semTitulo = false } = opts;

  const linhas: string[] = [];

  if (!semTitulo) {
    linhas.push("Setores disponíveis:");
    linhas.push("");
  }

  if (!deps.length) {
    linhas.push("⚠️ No momento não há setores cadastrados para este canal.");
  } else {
    deps.forEach((dep, index) => {
      linhas.push(`${index + 1}. ${dep.nome}`);
    });
  }

  if (!semRodape) {
    linhas.push("");
    linhas.push("Responda com o *número* do setor (ex: 1) ou escreva o que precisa.");
  }

  return linhas.join("\n");
}

/**
 * Retorna o departamento pela posição do menu (1, 2, 3...) do cliente informado.
 */
export async function getDepartamentoPorIndice(
  idcliente: number,
  indice: number
): Promise<Departamento | null> {
  if (indice <= 0) return null;

  const deps = await listarDepartamentos({ idcliente, somenteAtivos: true });

  if (indice > deps.length) return null;

  return deps[indice - 1];
}
