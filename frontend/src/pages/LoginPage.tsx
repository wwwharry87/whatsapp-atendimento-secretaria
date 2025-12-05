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

    if (!email || !senha) {
      toast.error("Informe e-mail e senha.");
      return;
    }

    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        password: senha,
      });

      const { token, usuario } = response.data;

      localStorage.setItem("atende_token", token);
      localStorage.setItem("atende_usuario", JSON.stringify(usuario));

      toast.success("Login realizado com sucesso!");
      navigate("/dashboard");
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const msgBackend = (error.response?.data as any)?.error;

        const mensagem =
          msgBackend ||
          (status === 400
            ? "Dados inválidos. Verifique e-mail e senha."
            : status === 401
            ? "Usuário ou senha inválidos."
            : "Erro ao fazer login. Tente novamente.");

        console.error("Erro de login:", {
          status,
          url: error.config?.url,
          method: error.config?.method,
        });

        toast.error(mensagem);
      } else {
        console.error("Erro inesperado de login.");
        toast.error("Erro inesperado ao fazer login.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      {/* Container central */}
      <div className="w-full max-w-5xl px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          {/* Lado esquerdo - texto institucional bem suave */}
          <div className="hidden md:flex flex-col space-y-3 text-slate-700">
            <h1 className="text-2xl font-semibold tracking-tight">
              Atende Cidadão
            </h1>
            <p className="text-sm text-slate-500 leading-relaxed">
              Plataforma de atendimento da Secretaria via WhatsApp. 
              Acompanhe as demandas dos cidadãos, organize os departamentos 
              e tome decisões com base em dados reais do dia a dia.
            </p>
            <div className="mt-2 text-xs text-slate-400">
              <p>BW Soluções Inteligentes</p>
              <p>Sistema pensado para o uso diário na gestão pública.</p>
            </div>
          </div>

          {/* Lado direito - card de login */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-8">
            <h2 className="text-lg font-semibold text-slate-800 mb-1 text-center">
              Acesso ao painel
            </h2>
            <p className="text-xs text-slate-500 mb-6 text-center">
              Entre com seu e-mail institucional e senha.
            </p>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  E-mail
                </label>
                <input
                  type="email"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 bg-slate-50"
                  placeholder="seuemail@prefeitura.gov.br"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Senha
                </label>
                <input
                  type="password"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500/70 focus:border-emerald-500 bg-slate-50"
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg mt-2 transition"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p className="mt-4 text-[11px] text-slate-500 text-center leading-relaxed">
              Seu acesso é pessoal e intransferível. 
              Em caso de dúvida ou necessidade de alteração de senha, 
              procure o responsável pelo sistema na Secretaria.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
