import { useState } from "react";
import { selectedInstance } from "../App";
import { useApp } from "../store";
import type { ModHit } from "../global";

export function ModsPage() {
  const inst = selectedInstance();
  const pushLog = useApp((s) => s.pushLog);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<ModHit[]>([]);
  const [busy, setBusy] = useState(false);

  async function search() {
    if (!inst) return;
    setBusy(true);
    try {
      const list = await window.lumen.mods.search(q, inst.mcVersion, inst.loader);
      setHits(list);
    } catch (e) {
      pushLog(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function install(id: string, title: string) {
    if (!inst) return;
    setBusy(true);
    try {
      const name = await window.lumen.mods.install(id, inst.id);
      pushLog(`Установлен ${title} → ${name}`);
    } catch (e) {
      pushLog(String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="h-full p-6 flex flex-col">
      <h1 className="text-2xl font-bold">Моды · Modrinth</h1>
      <p className="text-sm text-mc-muted mb-3">Поиск в инстанс {inst ? `${inst.name} (${inst.mcVersion} ${inst.loader})` : "—"}</p>
      <div className="flex gap-2 mb-4">
        <input
          className="flex-1 h-10 px-3 bg-mc-panel border border-mc-line"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="sodium, iris, lithium…"
          onKeyDown={(e) => e.key === "Enter" && void search()}
        />
        <button disabled={busy} onClick={() => void search()} className="h-10 px-4 bg-mc-green">
          Искать
        </button>
      </div>
      <div className="flex-1 overflow-auto space-y-2">
        {hits.map((h) => (
          <div key={h.project_id} className="bg-mc-panel border border-mc-line p-3 flex gap-3">
            {h.icon_url && <img src={h.icon_url} alt="" className="w-12 h-12 object-cover" />}
            <div className="flex-1 min-w-0">
              <div className="font-semibold">{h.title}</div>
              <div className="text-xs text-mc-muted line-clamp-2">{h.description}</div>
            </div>
            <button disabled={busy || !inst} className="h-8 px-3 bg-mc-green text-sm self-center" onClick={() => void install(h.project_id, h.title)}>
              Установить
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
