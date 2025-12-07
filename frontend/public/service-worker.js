// public/service-worker.js

// Instalação: já entra em "waiting"
self.addEventListener("install", (event) => {
  console.log("[SW] Install");
  // Garante que o novo SW seja instalado o mais rápido possível
  self.skipWaiting();
});

// Ativação: toma controle das abas e avisa que há nova versão
self.addEventListener("activate", (event) => {
  console.log("[SW] Activate");
  event.waitUntil(
    (async () => {
      // Faz o SW controlar todas as abas imediatamente
      await self.clients.claim();

      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      console.log("[SW] Notificando", allClients.length, "clientes");
      for (const client of allClients) {
        client.postMessage({
          type: "NEW_VERSION_AVAILABLE",
        });
      }
    })()
  );
});
