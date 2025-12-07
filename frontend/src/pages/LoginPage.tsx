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
        senha, // backend espera "senha"
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
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-emerald-50/40 to-slate-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 items-stretch">
        {/* Coluna esquerda - apresentação do sistema */}
        <div className="flex-1 hidden md:flex flex-col justify-center rounded-2xl border border-emerald-100 bg-white/80 shadow-sm px-8 py-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-3 py-1 mb-4 w-fit">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Atendimento público pelo WhatsApp
          </div>

          <h1 className="text-2xl font-semibold text-slate-900 leading-relaxed">
            Atende Cidadão
          </h1>
          <p className="mt-2 text-sm text-slate-600 max-w-md">
            Plataforma para organizar, registrar e acompanhar os atendimentos da
            Secretaria via WhatsApp, com encaminhamento por departamentos,
            histórico das conversas e visão gerencial.
          </p>

          <div className="mt-6 space-y-3 text-sm text-slate-700">
            <div className="flex gap-3">
              <div className="mt-1 h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700">
                1
              </div>
              <div>
                <p className="font-medium">Centralização dos canais</p>
                <p className="text-xs text-slate-500">
                  Um único número de WhatsApp para atendimento ao cidadão, com
                  distribuição automática para os setores responsáveis.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="mt-1 h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700">
                2
              </div>
              <div>
                <p className="font-medium">Organização por departamentos</p>
                <p className="text-xs text-slate-500">
                  Cada chamado pode ser direcionado, acompanhado e finalizado
                  pelo setor correto, com registro de status e responsáveis.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="mt-1 h-6 w-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-semibold text-emerald-700">
                3
              </div>
              <div>
                <p className="font-medium">Visão de gestão</p>
                <p className="text-xs text-slate-500">
                  Painéis e relatórios para a Secretaria acompanhar volume de
                  atendimentos, tempos de resposta e principais demandas.
                </p>
              </div>
            </div>
          </div>

          <p className="mt-8 text-[11px] text-slate-400">
            Desenvolvido por <span className="font-semibold">BW Soluções Inteligentes</span>.
          </p>
        </div>

        {/* Coluna direita - card de login */}
        <div className="flex-1 flex items-center justify-center">
          <div className="w-full max-w-md bg-white/95 border border-slate-200 rounded-2xl shadow-lg px-6 py-8">
            <div className="mb-6 text-center">
              <h2 className="text-xl font-semibold text-slate-900">
                Acesso ao painel
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                Use suas credenciais fornecidas pela Secretaria para acessar o
                painel de atendimentos.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-slate-700"
                >
                  E-mail ou login
                </label>
                <input
                  id="email"
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="seu.email@prefeitura.gov.br"
                  autoComplete="username"
                />
              </div>

              <div>
                <label
                  htmlFor="senha"
                  className="block text-xs font-medium text-slate-700"
                >
                  Senha
                </label>
                <input
                  id="senha"
                  type="password"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
              >
                {loading ? "Entrando..." : "Entrar"}
              </button>
            </form>

            <p className="mt-4 text-[11px] text-slate-500 text-center leading-relaxed">
              Acesso restrito à equipe autorizada da Secretaria.
              <br />
              Em caso de dúvida ou necessidade de alteração de senha, procure o
              responsável pelo sistema na sua Secretaria.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
