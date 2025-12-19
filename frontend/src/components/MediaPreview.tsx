// frontend/src/components/MediaPreview.tsx
import { useEffect, useMemo, useState } from "react";

type MsgTipo = "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "DOCUMENT" | "FILE" | string;

type Props = {
  apiBaseUrl: string; // ex: api.defaults.baseURL ou import.meta.env.VITE_API_BASE_URL
  token?: string | null; // JWT do painel
  tipo: MsgTipo;
  whatsappMediaId?: string | null; // no seu caso é msg.media_id (whatsapp_media_id)
  mediaUrl?: string | null; // se existir URL pública salva (opcional)
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
};

function formatBytes(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export default function MediaPreview({
  apiBaseUrl,
  token,
  tipo,
  whatsappMediaId,
  mediaUrl,
  mimeType,
  fileName,
  fileSize,
}: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isMedia = useMemo(() => {
    const t = (tipo || "").toUpperCase();
    return t === "IMAGE" || t === "VIDEO" || t === "AUDIO" || t === "DOCUMENT" || t === "FILE";
  }, [tipo]);

  const directUrl = useMemo(() => {
    if (mediaUrl && /^https?:\/\//i.test(mediaUrl)) return mediaUrl;
    return null;
  }, [mediaUrl]);

  // Monta URL da API sem barra dupla
  const mediaEndpoint = useMemo(() => {
    if (!whatsappMediaId) return null;
    const base = (apiBaseUrl || "").replace(/\/$/, "");
    return `${base}/media/${encodeURIComponent(whatsappMediaId)}`;
  }, [apiBaseUrl, whatsappMediaId]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr(null);

      if (!isMedia) return;

      // URL pública já resolve sem auth
      if (directUrl) {
        setBlobUrl(directUrl);
        return;
      }

      if (!mediaEndpoint) {
        setErr("Mídia não disponível (sem mediaId).");
        return;
      }

      if (!token) {
        setErr("Sem autenticação para carregar a mídia.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch(mediaEndpoint, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(`Falha ao carregar mídia (${res.status}). ${txt}`.trim());
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);

        if (!cancelled) setBlobUrl(objectUrl);
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || "Falha ao carregar mídia.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
      setBlobUrl((prev) => {
        // Só revoga blob: (não revoga URL pública)
        if (prev && !directUrl && prev.startsWith("blob:")) {
          try {
            URL.revokeObjectURL(prev);
          } catch {}
        }
        return null;
      });
    };
  }, [isMedia, directUrl, mediaEndpoint, token]);

  if (!isMedia) return null;

  if (loading) {
    return <div className="text-[12px] text-slate-500">Carregando mídia…</div>;
  }

  if (err) {
    return (
      <div className="text-[12px] text-red-600">
        {err}
        {whatsappMediaId ? (
          <div className="text-[11px] text-slate-500 mt-1">mediaId: {whatsappMediaId}</div>
        ) : null}
      </div>
    );
  }

  if (!blobUrl) return null;

  const t = (tipo || "").toUpperCase();

  if (t === "IMAGE") {
    return (
      <img
        src={blobUrl}
        alt={fileName || "imagem"}
        className="mt-1 max-w-xs rounded-lg border border-slate-200"
      />
    );
  }

  if (t === "VIDEO") {
    return (
      <video controls className="mt-1 max-w-xs rounded-lg border border-slate-200">
        <source src={blobUrl} type={mimeType || undefined} />
        Seu navegador não suporta vídeo.
      </video>
    );
  }

  if (t === "AUDIO") {
    return (
      <audio controls className="mt-1 max-w-full">
        <source src={blobUrl} type={mimeType || undefined} />
        Seu navegador não suporta áudio.
      </audio>
    );
  }

  // DOCUMENT / FILE
  return (
    <div className="mt-1 border border-slate-200 rounded-lg p-3 bg-slate-50">
      <div className="text-[12px] font-semibold text-slate-800">
        {fileName || "Documento"}
      </div>
      <div className="text-[11px] text-slate-500 mt-0.5">
        {(mimeType || "arquivo")}{fileSize ? ` • ${formatBytes(fileSize)}` : ""}
      </div>

      <div className="mt-2 flex gap-3">
        <a
          href={blobUrl}
          download={fileName || "arquivo"}
          className="text-[12px] underline"
        >
          Baixar
        </a>
        <a
          href={blobUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[12px] underline"
        >
          Abrir
        </a>
      </div>
    </div>
  );
}
