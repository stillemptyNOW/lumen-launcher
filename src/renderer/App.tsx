import { useEffect, useState } from "react";
import { useApp, type Page } from "./store";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { PlayPage } from "./pages/PlayPage";
import { InstancesPage } from "./pages/InstancesPage";
import { VersionsPage } from "./pages/VersionsPage";
import { ModsPage } from "./pages/ModsPage";
import { SkinsPage } from "./pages/SkinsPage";
import { SettingsPage } from "./pages/SettingsPage";

const NAV: { id: Page; label: string }[] = [
  { id: "play", label: "Играть" },
  { id: "instances", label: "Инстансы" },
  { id: "versions", label: "Версии" },
  { id: "mods", label: "Моды" },
  { id: "skins", label: "Скины" },
  { id: "settings", label: "Настройки" },
];

export function App() {
  const page = useApp((s) => s.page);
  const setPage = useApp((s) => s.setPage);
  const account = useApp((s) => s.account);
  const refresh = useApp((s) => s.refresh);
  const pushLog = useApp((s) => s.pushLog);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let off: (() => void) | undefined;
    void (async () => {
      try {
        await refresh();
      } catch (e) {
        console.error(e);
      }
      try {
        const news = await window.lumen.news.list();
        useApp.setState({ news: news.map((n) => n.title).slice(0, 4).join("   ·   ") });
      } catch {
        useApp.setState({ news: "Новости недоступны" });
      }
      try {
        off = window.lumen.onProgress((p) => {
          pushLog(p.msg);
          if (typeof p.ratio === "number") useApp.setState({ progress: p.ratio });
        });
      } catch {
        /* ignore */
      }
      setReady(true);
    })();
    return () => {
      try {
        off?.();
      } catch {
        /* ignore */
      }
    };
  }, [refresh, pushLog]);

  if (!ready) {
    return (
      <div className="h-full w-full grid place-items-center bg-mc-bg text-mc-muted">
        Загрузка лаунчера…
      </div>
    );
  }

  return (
    <ErrorBoundary name="Лаунчер">
      <div className="h-full w-full flex flex-col bg-mc-bg text-white overflow-hidden">
        <header className="drag h-10 shrink-0 flex items-center justify-between px-3 bg-mc-panel border-b border-mc-line">
          <div className="text-sm font-semibold tracking-wide text-mc-green">LUMEN LAUNCHER</div>
          <div className="no-drag flex gap-1">
            <WinBtn onClick={() => void window.lumen.window.min()}>—</WinBtn>
            <WinBtn onClick={() => void window.lumen.window.max()}>□</WinBtn>
            <WinBtn onClick={() => void window.lumen.window.close()} danger>
              ✕
            </WinBtn>
          </div>
        </header>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <aside className="w-48 shrink-0 bg-mc-panel border-r border-mc-line flex flex-col">
            <nav className="p-2 flex-1 overflow-y-auto">
              {NAV.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => setPage(n.id)}
                  className={`w-full text-left px-3 h-10 mb-1 rounded-sm transition-colors no-drag ${
                    page === n.id ? "bg-mc-panel2 text-white" : "text-mc-muted hover:bg-mc-panel2/70 hover:text-white"
                  }`}
                >
                  {n.label}
                </button>
              ))}
            </nav>
            <div className="p-3 text-xs text-mc-muted border-t border-mc-line truncate">
              {account ? account.name : "Гость"}
              {account?.type === "offline" ? " · offline" : ""}
            </div>
          </aside>

          {/*
            Все вкладки остаются в DOM (состояние форм не сбрасывается),
            но скрыты через visibility/pointer-events — НЕ display:none
            (display:none + WebGL = серый экран Electron).
            Skin3D получает active=false и полностью dispose WebGL.
          */}
          <main className="relative flex-1 min-w-0 min-h-0 bg-mc-bg overflow-hidden">
            <PageSlot active={page === "play"} name="Играть">
              <PlayPage active={page === "play"} />
            </PageSlot>
            <PageSlot active={page === "instances"} name="Инстансы">
              <InstancesPage />
            </PageSlot>
            <PageSlot active={page === "versions"} name="Версии">
              <VersionsPage />
            </PageSlot>
            <PageSlot active={page === "mods"} name="Моды">
              <ModsPage />
            </PageSlot>
            <PageSlot active={page === "skins"} name="Скины">
              <SkinsPage active={page === "skins"} />
            </PageSlot>
            <PageSlot active={page === "settings"} name="Настройки">
              <SettingsPage />
            </PageSlot>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  );
}

function PageSlot({ active, name, children }: { active: boolean; name: string; children: React.ReactNode }) {
  return (
    <div
      className="absolute inset-0 overflow-auto bg-mc-bg"
      style={{
        visibility: active ? "visible" : "hidden",
        pointerEvents: active ? "auto" : "none",
        zIndex: active ? 2 : 0,
        opacity: active ? 1 : 0,
      }}
      aria-hidden={!active}
    >
      <ErrorBoundary name={name}>{children}</ErrorBoundary>
    </div>
  );
}

function WinBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-10 h-7 text-sm ${danger ? "hover:bg-red-700" : "hover:bg-mc-panel2"}`}
    >
      {children}
    </button>
  );
}

export function selectedInstance() {
  const { instances, settings } = useApp.getState();
  return instances.find((i) => i.id === settings?.selectedInstance) ?? instances[0];
}
