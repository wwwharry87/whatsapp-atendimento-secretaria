import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import DashboardPage from "./pages/DashboardPage";
import DepartamentosPage from "./pages/DepartamentosPage";
import UsuariosPage from "./pages/UsuariosPage";
import HorariosPage from "./pages/HorariosPage";
import AtendimentosPage from "./pages/AtendimentosPage";
import LoginPage from "./pages/LoginPage";

function useIsAuthenticated() {
  const token = typeof window !== "undefined"
    ? localStorage.getItem("atende_token")
    : null;
  return !!token;
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const isAuth = useIsAuthenticated();
  const location = useLocation();

  if (!isAuth) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/atendimentos" element={<AtendimentosPage />} />
                <Route path="/departamentos" element={<DepartamentosPage />} />
                <Route path="/horarios" element={<HorariosPage />} />
                <Route path="/usuarios" element={<UsuariosPage />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}
