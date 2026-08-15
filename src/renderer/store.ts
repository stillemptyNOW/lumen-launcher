import { create } from "zustand";
import type { AccountView, InstanceView, SettingsView } from "./global";

export type Page = "play" | "instances" | "versions" | "mods" | "skins" | "settings";

interface AppState {
  page: Page;
  account: AccountView | null;
  accounts: AccountView[];
  instances: InstanceView[];
  settings: SettingsView | null;
  skinUrl: string | null;
  capeUrl: string | null;
  news: string;
  log: string[];
  progress: number;
  step: string;
  busy: boolean;
  setPage: (p: Page) => void;
  pushLog: (m: string) => void;
  refresh: () => Promise<void>;
}

export const useApp = create<AppState>((set, get) => ({
  page: "play",
  account: null,
  accounts: [],
  instances: [],
  settings: null,
  skinUrl: null,
  capeUrl: null,
  news: "Загрузка новостей…",
  log: [],
  progress: 0,
  step: "Готов",
  busy: false,
  setPage: (page) => set({ page }),
  pushLog: (m) => set({ log: [...get().log.slice(-200), m], step: m.slice(0, 140) }),
  refresh: async () => {
    const [account, accounts, instances, settings, skinUrl, capeUrl] = await Promise.all([
      window.lumen.account.active(),
      window.lumen.account.list(),
      window.lumen.instances.list(),
      window.lumen.settings.get(),
      window.lumen.account.skin().catch(() => null),
      window.lumen.account.cape().catch(() => null),
    ]);
    set({ account, accounts, instances, settings, skinUrl, capeUrl });
  },
}));

export const LOADERS: { id: string; label: string }[] = [
  { id: "vanilla", label: "Vanilla" },
  { id: "fabric", label: "Fabric" },
  { id: "quilt", label: "Quilt" },
  { id: "forge", label: "Forge" },
  { id: "neoforge", label: "NeoForge" },
  { id: "optifine", label: "OptiFine" },
  { id: "forge_optifine", label: "Forge + OptiFine" },
];

export function instLabel(i: InstanceView): string {
  const l = LOADERS.find((x) => x.id === i.loader)?.label ?? i.loader;
  return `${i.mcVersion} · ${l}${i.installLumen ? " + Lumen + Essential" : ""}`;
}
