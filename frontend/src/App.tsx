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

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="atendimentos" element={<AtendimentosPage />} />
          <Route path="atendimentos/:id" element={<AtendimentoDetalhePage />} />
          <Route path="departamentos" element={<DepartamentosPage />} />
          <Route path="horarios" element={<HorariosPage />} />
          <Route path="usuarios" element={<UsuariosPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>

      {/* Observador de versão: mostra o modal quando há atualização */}
      <VersionUpdateWatcher />
    </>
  );
}
