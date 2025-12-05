// src/services/departmentService.ts
import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";

async function listarDepartamentos(): Promise<Departamento[]> {
  const repo = AppDataSource.getRepository(Departamento);
  const deps = await repo.find({
    order: { id: "ASC" },
  });

  return deps;
}

/**
 * Retorna o texto do menu de departamentos.
 *
 * Se `semRodape = true`, NÃO adiciona a linha
 * "Digite apenas o número desejado." no final.
 * Isso é útil quando usamos o menu dentro de um template
 * que já tem sua própria frase de instrução.
 */
export async function montarMenuDepartamentos(
  semRodape: boolean = false
): Promise<string> {
  const deps = await listarDepartamentos();

  let linhas: string[] = [];
  linhas.push("Selecione o número do Departamento / Setor que deseja falar:\n");

  deps.forEach((dep, index) => {
    linhas.push(`${index + 1}. ${dep.nome}`);
  });

  if (!semRodape) {
    linhas.push("");
    linhas.push("Digite apenas o número desejado.");
  }

  return linhas.join("\n");
}

/**
 * Retorna o departamento pela posição do menu (1, 2, 3...)
 */
export async function getDepartamentoPorIndice(
  indice: number
): Promise<Departamento | null> {
  if (indice <= 0) return null;

  const deps = await listarDepartamentos();

  if (indice > deps.length) return null;

  return deps[indice - 1];
}
