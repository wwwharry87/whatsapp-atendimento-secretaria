// src/App.tsx
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import AtendimentosPage from "./pages/AtendimentosPage";
import AtendimentoDetalhePage from "./pages/AtendimentoDetalhePage";
import DepartamentosPage from "./pages/DepartamentosPage";
import HorariosPage from "./pages/HorariosPage";
import UsuariosPage from "./pages/UsuariosPage";
import VersionUpdateWatcher from "./components/VersionUpdateWatcher";
import VersionInfoBadge from "./components/VersionInfoBadge";

export default function App() {
  return (
    <>
      {/* Observador de nova versão (modal de atualizar / lembrar depois) */}
      <VersionUpdateWatcher />

      {/* Badge fixo com data/hora da atualização e versão atual */}
      <VersionInfoBadge />

      <Routes>
        {/* Login fora do layout principal */}
        <Route path="/login" element={<LoginPage />} />

        {/* Rotas com layout (sidebar, topo, etc.) */}
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" replace />} />

          <Route path="dashboard" element={<DashboardPage />} />

          <Route path="atendimentos" element={<AtendimentosPage />} />
          <Route path="atendimentos/:id" element={<AtendimentoDetalhePage />} />

          <Route path="departamentos" element={<DepartamentosPage />} />
          <Route path="horarios" element={<HorariosPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
        </Route>

        {/* fallback: qualquer rota desconhecida vai pro dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}
