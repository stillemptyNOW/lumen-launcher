import { useState } from "react";
import { instLabel, LOADERS, useApp } from "../store";

export function InstancesPage() {
  const instances = useApp((s) => s.instances);
  const refresh = useApp((s) => s.refresh);
  const [open, setOpen] = useState(false);

  async function remove(id: string) {
    const next = instances.filter((i) => i.id !== id);
    await window.lumen.instances.save(next);
    await refresh();
  }

  return (
    <div className="h-full p-6 overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Инстансы</h1>
        <button onClick={() => setOpen(true)} className="h-9 px-4 bg-mc-green hover:bg-mc-greenH rounded-sm">
          Создать
        </button>
      </div>
      <div className="space-y-3">
        {instances.map((i) => (
          <div key={i.id} className="bg-mc-panel border border-mc-line p-4">
            <div className="font-semibold">{i.name}</div>
            <div className="text-sm text-mc-muted">{instLabel(i)}</div>
            <div className="flex gap-2 mt-3">
              <button
                className="h-8 px-3 bg-mc-green rounded-sm text-sm"
                onClick={() => void window.lumen.settings.set({ selectedInstance: i.id }).then(refresh)}
              >
                Выбрать
              </button>
              <button className="h-8 px-3 bg-mc-gray rounded-sm text-sm" onClick={() => void window.lumen.instances.open(i.id)}>
                Папка
              </button>
              <button className="h-8 px-3 bg-red-900 rounded-sm text-sm" onClick={() => void remove(i.id)}>
                Удалить
              </button>
            </div>
          </div>
        ))}
      </div>
      {open && <CreateModal onClose={() => setOpen(false)} />}
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const refresh = useApp((s) => s.refresh);
  const [name, setName] = useState("Новый профиль");
  const [mc, setMc] = useState("26.2");
  const [loader, setLoader] = useState("fabric");
  const [lumen, setLumen] = useState(true);

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50">
      <div className="w-[420px] bg-mc-panel border border-mc-line p-5">
        <div className="text-lg font-semibold mb-3">Новый инстанс</div>
        <label className="text-xs text-mc-muted">Название</label>
        <input className="w-full h-9 px-3 bg-mc-panel2 mb-3" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="text-xs text-mc-muted">Версия Minecraft</label>
        <input className="w-full h-9 px-3 bg-mc-panel2 mb-3" value={mc} onChange={(e) => setMc(e.target.value)} />
        <label className="text-xs text-mc-muted">Лоадер</label>
        <select className="w-full h-9 px-3 bg-mc-panel2 mb-3" value={loader} onChange={(e) => setLoader(e.target.value)}>
          {LOADERS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm mb-4">
          <input type="checkbox" checked={lumen} onChange={(e) => setLumen(e.target.checked)} />
          Поставить Lumen (только Fabric 26.2)
        </label>
        <div className="flex justify-end gap-2">
          <button className="h-9 px-3 bg-mc-gray" onClick={onClose}>
            Отмена
          </button>
          <button
            className="h-9 px-4 bg-mc-green"
            onClick={() =>
              void window.lumen.instances
                .create({ name, mcVersion: mc, loader, installLumen: lumen })
                .then(refresh)
                .then(onClose)
            }
          >
            Создать
          </button>
        </div>
      </div>
    </div>
  );
}
