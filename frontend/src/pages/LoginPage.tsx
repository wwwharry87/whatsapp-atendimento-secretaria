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
      // Login SEM expor senha em logs
      const response = await api.post("/auth/login", {
        email,
        password: senha,
      });

      const { token, usuario } = response.data;

      // guarda token e dados do usuário no localStorage
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

        // Não mostramos body/payload, só info técnica mínima
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
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="w-full max-w-md bg-white shadow-lg rounded-xl p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1 text-center">
          Atende Cidadão
        </h1>
        <p className="text-sm text-slate-500 mb-6 text-center">
          Acesso ao painel da Secretaria
        </p>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              E-mail
            </label>
            <input
              type="email"
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="seuemail@exemplo.com"
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
              type="password" // 👈 não mostra a senha digitada
              className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Digite sua senha"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-lg mt-2 transition"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-4 text-xs text-slate-500 text-center">
          Seu acesso é pessoal e intransferível. Nunca compartilhe sua senha.
        </p>
      </div>
    </div>
  );
}
