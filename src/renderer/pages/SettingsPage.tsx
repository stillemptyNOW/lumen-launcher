import { useEffect, useState } from "react";
import { useApp } from "../store";

export function SettingsPage() {
  const settings = useApp((s) => s.settings);
  const refresh = useApp((s) => s.refresh);
  const [form, setForm] = useState(settings);

  useEffect(() => setForm(settings), [settings]);
  if (!form) return null;

  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm({ ...form, [k]: v });
  }

  return (
    <div className="h-full p-6 overflow-auto">
      <h1 className="text-2xl font-bold mb-4">Настройки</h1>
      <div className="bg-mc-panel border border-mc-line p-5 max-w-2xl space-y-3">
        <Row label="RAM (МБ)">
          <input className="h-9 px-3 bg-mc-panel2 w-28" value={form.ramMb} onChange={(e) => set("ramMb", Number(e.target.value) || 4096)} />
        </Row>
        <Row label="Java">
          <input className="h-9 px-3 bg-mc-panel2 flex-1" placeholder="пусто = auto" value={form.javaPath} onChange={(e) => set("javaPath", e.target.value)} />
        </Row>
        <Row label="Окно">
          <input className="h-9 px-3 bg-mc-panel2 w-20" value={form.width} onChange={(e) => set("width", Number(e.target.value) || 1280)} />
          <span>×</span>
          <input className="h-9 px-3 bg-mc-panel2 w-20" value={form.height} onChange={(e) => set("height", Number(e.target.value) || 720)} />
        </Row>
        <Row label="JVM args">
          <input className="h-9 px-3 bg-mc-panel2 flex-1" value={form.jvmArgs} onChange={(e) => set("jvmArgs", e.target.value)} />
        </Row>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.hideOnLaunch} onChange={(e) => set("hideOnLaunch", e.target.checked)} />
          Сворачивать лаунчер при запуске игры
        </label>
        <button
          className="h-9 px-4 bg-mc-green"
          onClick={() => void window.lumen.settings.set(form).then(refresh)}
        >
          Сохранить
        </button>
      </div>
      <div className="bg-mc-panel border border-mc-line p-5 max-w-2xl mt-4 text-sm text-mc-muted leading-relaxed">
        <div className="text-white font-semibold mb-2">Вход Microsoft без Azure</div>
        Лаунчер использует официальный client_id Minecraft Launcher
        <code className="mx-1 text-white">00000000402b5328</code>
        и redirect <code className="text-white">https://login.live.com/oauth20_desktop.srf</code>.
        Регистрировать приложение в Azure Portal не нужно. Окно входа перехватывает redirect само.
        <br />
        <br />
        Lumen (Right Shift) ставится в инстанс Fabric 26.2. XRAY и MobESP — только одиночный мир.
        Проект не аффилирован с Mojang / Microsoft.
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 text-sm text-mc-muted">{label}</div>
      {children}
    </div>
  );
}
