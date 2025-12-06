// src/components/VersionInfoBadge.tsx
import { getFormattedVersionInfo } from "../lib/version";

export default function VersionInfoBadge() {
  const info = getFormattedVersionInfo();

  return (
    <div className="fixed bottom-2 right-3 z-[9000]">
      <div className="inline-flex items-center rounded-full bg-white/90 border border-slate-200 px-3 py-1 shadow-sm backdrop-blur text-[10px] text-slate-600">
        {info}
      </div>
    </div>
  );
}
