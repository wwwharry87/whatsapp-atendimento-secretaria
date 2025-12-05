export function formatPhone(brNumber: string): string {
  const only = brNumber.replace(/\D/g, "");
  if (only.length < 10) return brNumber;
  const dd = only.slice(0, 2);
  const nine = only.length === 11 ? only.slice(2, 3) : "";
  const part1 = only.length === 11 ? only.slice(3, 7) : only.slice(2, 6);
  const part2 = only.length === 11 ? only.slice(7) : only.slice(6);
  return `(${dd}) ${nine}${part1}-${part2}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatDurationSeconds(sec: number | null | undefined): string {
  if (!sec && sec !== 0) return "-";
  const s = Math.max(sec, 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m === 0) return `${r}s`;
  return `${m}min ${r}s`;
}

export function badgeStatus(status: string): { label: string; color: string } {
  switch (status) {
    case "ACTIVE":
      return { label: "Em atendimento", color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40" };
    case "WAITING_AGENT_CONFIRMATION":
      return { label: "Aguardando agente", color: "bg-amber-500/15 text-amber-300 border-amber-500/40" };
    case "IN_QUEUE":
      return { label: "Fila de espera", color: "bg-sky-500/15 text-sky-300 border-sky-500/40" };
    case "FINISHED":
      return { label: "Finalizado", color: "bg-slate-500/15 text-slate-300 border-slate-500/40" };
    default:
      return { label: status, color: "bg-slate-700/40 text-slate-200 border-slate-500/40" };
  }
}
