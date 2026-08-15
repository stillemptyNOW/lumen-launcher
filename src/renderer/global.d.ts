export {};

declare global {
  interface Window {
    lumen: {
      window: { min: () => Promise<void>; max: () => Promise<void>; close: () => Promise<void> };
      account: {
        list: () => Promise<AccountView[]>;
        active: () => Promise<AccountView | null>;
        select: (uuid: string) => Promise<AccountView | null>;
        login: () => Promise<AccountView | null>;
        offline: (name: string) => Promise<AccountView | null>;
        logout: (uuid?: string) => Promise<AccountView | null>;
        refresh: () => Promise<AccountView | null>;
        skin: () => Promise<string | null>;
        /** Встроенный плащ PinkPantheress (data:image/png). */
        cape: () => Promise<string | null>;
      };
      settings: {
        get: () => Promise<SettingsView>;
        set: (partial: Partial<SettingsView>) => Promise<SettingsView>;
      };
      instances: {
        list: () => Promise<InstanceView[]>;
        save: (list: InstanceView[]) => Promise<InstanceView[]>;
        create: (data: { name: string; mcVersion: string; loader: string; installLumen: boolean }) => Promise<InstanceView>;
        open: (id: string) => Promise<void>;
      };
      versions: {
        list: () => Promise<{ id: string; type: string; releaseTime: string }[]>;
        optifine: (mc?: string) => Promise<{ mcversion: string; type: string; patch: string; filename: string }[]>;
      };
      news: { list: () => Promise<{ title: string; type: string }[]> };
      mods: {
        search: (q: string, mc: string, loader: string) => Promise<ModHit[]>;
        install: (projectId: string, instanceId: string) => Promise<string>;
      };
      game: {
        install: (id: string) => Promise<string>;
        play: (id: string) => Promise<boolean>;
      };
      onProgress: (cb: (p: { msg: string; ratio?: number }) => void) => () => void;
    };
  }
}

export interface AccountView {
  type: "microsoft" | "offline";
  name: string;
  uuid: string;
  skinUrl?: string;
}

export interface SettingsView {
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

export interface InstanceView {
  id: string;
  name: string;
  mcVersion: string;
  loader: string;
  installLumen: boolean;
  created: number;
  lastPlayed: number;
  ramMb: number;
}

export interface ModHit {
  project_id: string;
  title: string;
  description: string;
  icon_url?: string;
  downloads: number;
  slug: string;
}
