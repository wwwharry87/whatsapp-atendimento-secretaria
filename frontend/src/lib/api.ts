import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "https://whatsapp-atendimento-uyyu.onrender.com",
  timeout: 15000
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("atende_token");
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export { api };
