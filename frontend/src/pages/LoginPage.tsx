import { FormEvent, useState } from "react";
import { api } from "../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, senha });
      localStorage.setItem("atende_token", data.token);
      window.location.href = "/";
    } catch (err: any) {
      console.error(err);
      setErro("Credenciais inválidas ou erro ao conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl shadow-black/40">
        <div className="flex items-center gap-2 mb-4">
          <div className="h-9 w-9 rounded-2xl bg-primary-500/10 border border-primary-500/60 flex items-center justify-center text-primary-300 font-bold">
            AC
          </div>
          <div>
            <div className="text-sm font-semibold">Atende Cidadão</div>
            <div className="text-[11px] text-slate-400">
              Painel da Secretaria
            </div>
          </div>
        </div>

        <h1 className="text-lg font-semibold mb-1">Entrar</h1>
        <p className="text-xs text-slate-400 mb-4">
          Use seu usuário de administrador / gestor para acessar.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-slate-300 mb-1">
              E-mail institucional
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">
              Senha
            </label>
            <input
              type="password"
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full rounded-xl bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {erro && (
            <div className="text-[11px] text-red-400 bg-red-950/40 border border-red-800/50 rounded-xl px-3 py-2">
              {erro}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl bg-primary-500 hover:bg-primary-400 text-slate-950 font-semibold py-2 text-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Entrando..." : "Acessar painel"}
          </button>
        </form>

        <p className="mt-4 text-[10px] text-slate-500 text-center">
          Desenvolvido por BW Soluções Inteligentes.
        </p>
      </div>
    </div>
  );
}
