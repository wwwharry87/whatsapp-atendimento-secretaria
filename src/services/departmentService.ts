import { AppDataSource } from "../database/data-source";
import { Departamento } from "../entities/Departamento";

export async function listarDepartamentos(): Promise<Departamento[]> {
  const repo = AppDataSource.getRepository(Departamento);
  return repo.find({ order: { id: "ASC" } });
}

export async function montarMenuDepartamentos(): Promise<string> {
  const deps = await listarDepartamentos();

  if (!deps.length) {
    return "Nenhum departamento foi configurado ainda. Entre em contato com o administrador do sistema.";
  }

  let msg = "Selecione o número do Departamento / Setor que deseja falar:\n\n";

  deps.forEach((dep, index) => {
    msg += `${index + 1}. ${dep.nome}\n`;
  });

  msg += "\nDigite apenas o número desejado.";
  return msg;
}

export async function getDepartamentoPorIndice(
  indice: number
): Promise<Departamento | null> {
  const deps = await listarDepartamentos();
  const dep = deps[indice - 1];
  return dep || null;
}
