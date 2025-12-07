// src/pages/LoginPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import axios from "axios";
import toast from "react-hot-toast";

export default function LoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!email.trim() || !senha.trim()) {
      toast.error("Informe e-mail (ou login) e senha.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email, // pode ser e-mail ou login
        senha, // 👈 backend espera "senha"
      });

      const { token, usuario } = response.data;

      if (!token || !usuario) {
        toast.error("Resposta de login inválida do servidor.");
        setLoading(false);
        return;
      }

      // grava token para o interceptor do axios
      localStorage.setItem("atende_token", token);
      localStorage.setItem("atende_usuario", JSON.stringify(usuario));

      toast.success(`Bem-vindo(a), ${usuario.nome}!`);

      navigate("/", { replace: true });
    } catch (error: any) {
      console.error("Erro de login:", error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const data = error.response?.data as any;

        if (status === 400 || status === 401) {
          toast.error(
            data?.error ||
              "Credenciais inválidas. Verifique e-mail/login e senha."
          );
        } else {
          toast.error(
            data?.error ||
              "Não foi possível realizar o login. Tente novamente."
          );
        }
      } else {
        toast.error("Erro inesperado ao tentar logar.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-slate-950/70 border border-slate-800 rounded-2xl shadow-xl px-6 py-8">
          <div className="mb-6 text-center">
            <h1 className="text-xl font-semibold text-white">
              Atende Cidadão
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Acesso restrito aos atendentes e responsáveis pela Secretaria.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-300"
              >
                E-mail ou login
              </label>
              <input
                id="email"
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="seu.email@prefeitura.gov.br"
                autoComplete="username"
              />
            </div>

            <div>
              <label
                htmlFor="senha"
                className="block text-xs font-medium text-slate-300"
              >
                Senha
              </label>
              <input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Digite sua senha"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {loading ? "Entrando..." : "Entrar"}
            </button>
          </form>

          <p className="mt-4 text-[11px] text-slate-500 text-center leading-relaxed">
            Seu acesso é pessoal e intransferível.
            <br />
            Em caso de dúvida ou necessidade de alteração de senha,
            procure o responsável pelo sistema na Secretaria.
          </p>
        </div>
      </div>
    </div>
  );
}
