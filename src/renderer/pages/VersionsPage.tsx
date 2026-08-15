import { useEffect, useState } from "react";
import { LOADERS, useApp } from "../store";

export function VersionsPage() {
  const refresh = useApp((s) => s.refresh);
  const [filter, setFilter] = useState<"release" | "snapshot" | "old" | "optifine">("release");
  const [list, setList] = useState<{ id: string; type: string }[]>([]);
  const [of, setOf] = useState<{ mcversion: string; type: string; patch: string }[]>([]);

  useEffect(() => {
    void window.lumen.versions.list().then(setList);
    void window.lumen.versions.optifine().then(setOf);
  }, []);

  const shown =
    filter === "optifine"
      ? []
      : list
          .filter((v) => {
            if (filter === "release") return v.type === "release";
            if (filter === "snapshot") return v.type === "snapshot";
            return v.type === "old_beta" || v.type === "old_alpha";
          })
          .slice(0, 40);

  async function make(mc: string, loader: string) {
    const label = LOADERS.find((l) => l.id === loader)?.label ?? loader;
    await window.lumen.instances.create({
      name: `${mc} ${label}${loader === "fabric" && mc === "26.2" ? " + Lumen" : ""}`,
      mcVersion: mc,
      loader,
      installLumen: loader === "fabric" && mc === "26.2",
    });
    await refresh();
    useApp.getState().setPage("play");
    useApp.getState().pushLog(`Создан инстанс ${mc} ${label}. Нажмите ИГРАТЬ.`);
  }

  const ofSeen = new Set<string>();
  const ofUnique = of.filter((x) => (ofSeen.has(x.mcversion) ? false : (ofSeen.add(x.mcversion), true)));

  return (
    <div className="h-full p-6 flex flex-col">
      <h1 className="text-2xl font-bold mb-4">Каталог версий</h1>
      <div className="flex gap-2 mb-4">
        {(["release", "snapshot", "old", "optifine"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-8 px-3 rounded-sm ${filter === f ? "bg-mc-green" : "bg-mc-gray"}`}
          >
            {f}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto space-y-2">
        {filter === "optifine" &&
          ofUnique.map((x) => (
            <Row key={x.mcversion} title={x.mcversion} sub={`OptiFine ${x.type} ${x.patch}`}>
              <Mini onClick={() => void make(x.mcversion, "optifine")}>OptiFine</Mini>
              <Mini onClick={() => void make(x.mcversion, "forge_optifine")}>Forge+OF</Mini>
            </Row>
          ))}
        {filter !== "optifine" &&
          shown.map((v) => (
            <Row key={v.id} title={v.id} sub={v.type}>
              {LOADERS.map((l) => (
                <Mini key={l.id} onClick={() => void make(v.id, l.id)}>
                  {l.label}
                </Mini>
              ))}
            </Row>
          ))}
      </div>
    </div>
  );
}

function Row({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-mc-panel border border-mc-line px-4 py-2 flex items-center gap-3">
      <div className="w-36 font-semibold">{title}</div>
      <div className="text-xs text-mc-muted w-40">{sub}</div>
      <div className="flex flex-wrap gap-1 justify-end flex-1">{children}</div>
    </div>
  );
}

function Mini({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="h-7 px-2 text-xs bg-mc-gray hover:bg-mc-grayH rounded-sm">
      {children}
    </button>
  );
}
