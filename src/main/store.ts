import Store from "electron-store";

export type LoaderId =
  | "vanilla"
  | "fabric"
  | "quilt"
  | "forge"
  | "neoforge"
  | "optifine"
  | "forge_optifine";

export interface Instance {
  id: string;
  name: string;
  mcVersion: string;
  loader: LoaderId;
  installLumen: boolean;
  created: number;
  lastPlayed: number;
  ramMb: number;
}

export interface Settings {
  ramMb: number;
  javaPath: string;
  width: number;
  height: number;
  fullscreen: boolean;
  jvmArgs: string;
  hideOnLaunch: boolean;
  language: "ru" | "en";
  selectedInstance: string;
}

export interface Account {
  type: "microsoft" | "offline";
  name: string;
  uuid: string;
  accessToken: string;
  refreshToken?: string;
  skinUrl?: string;
}

export const LOADER_LABELS: Record<LoaderId, string> = {
  vanilla: "Vanilla",
  fabric: "Fabric",
  quilt: "Quilt",
  forge: "Forge",
  neoforge: "NeoForge",
  optifine: "OptiFine",
  forge_optifine: "Forge + OptiFine",
};

const store = new Store({
  name: "lumen",
  defaults: {
    settings: {
      ramMb: 4096,
      javaPath: "",
      width: 1280,
      height: 720,
      fullscreen: false,
      jvmArgs: "",
      hideOnLaunch: false,
      language: "ru",
      selectedInstance: "",
    } satisfies Settings,
    instances: [] as Instance[],
    accounts: [] as Account[],
    activeAccount: "",
  },
});

export function getSettings(): Settings {
  return store.get("settings") as Settings;
}

export function setSettings(partial: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...partial };
  store.set("settings", next);
  return next;
}

export function getInstances(): Instance[] {
  const list = store.get("instances") as Instance[];
  if (list.length) return list;
  const seeded: Instance[] = [
    {
      id: crypto.randomUUID().slice(0, 12),
      name: "Minecraft 26.2 + Lumen",
      mcVersion: "26.2",
      loader: "fabric",
      installLumen: true,
      created: Date.now(),
      lastPlayed: 0,
      ramMb: 0,
    },
    {
      id: crypto.randomUUID().slice(0, 12),
      name: "Minecraft 26.2 Vanilla",
      mcVersion: "26.2",
      loader: "vanilla",
      installLumen: false,
      created: Date.now(),
      lastPlayed: 0,
      ramMb: 0,
    },
  ];
  store.set("instances", seeded);
  setSettings({ selectedInstance: seeded[0].id });
  return seeded;
}

export function saveInstances(list: Instance[]): Instance[] {
  store.set("instances", list);
  return list;
}

export function getAccounts(): Account[] {
  return store.get("accounts") as Account[];
}

export function saveAccounts(list: Account[]): Account[] {
  store.set("accounts", list);
  return list;
}

export function getActiveUuid(): string {
  return String(store.get("activeAccount") || "");
}

export function setActiveUuid(uuid: string): void {
  store.set("activeAccount", uuid);
}

export function getActiveAccount(): Account | null {
  const uuid = getActiveUuid();
  return getAccounts().find((a) => a.uuid === uuid) ?? getAccounts()[0] ?? null;
}
