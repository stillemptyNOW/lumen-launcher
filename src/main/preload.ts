import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("lumen", {
  window: {
    min: () => ipcRenderer.invoke("window:min"),
    max: () => ipcRenderer.invoke("window:max"),
    close: () => ipcRenderer.invoke("window:close"),
  },
  account: {
    list: () => ipcRenderer.invoke("account:list"),
    active: () => ipcRenderer.invoke("account:active"),
    select: (uuid: string) => ipcRenderer.invoke("account:select", uuid),
    login: () => ipcRenderer.invoke("account:login"),
    offline: (name: string) => ipcRenderer.invoke("account:offline", name),
    logout: (uuid?: string) => ipcRenderer.invoke("account:logout", uuid),
    refresh: () => ipcRenderer.invoke("account:refresh"),
    skin: () => ipcRenderer.invoke("account:skin"),
    cape: () => ipcRenderer.invoke("account:cape"),
  },
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (partial: Record<string, unknown>) => ipcRenderer.invoke("settings:set", partial),
  },
  instances: {
    list: () => ipcRenderer.invoke("instances:list"),
    save: (list: unknown) => ipcRenderer.invoke("instances:save", list),
    create: (data: unknown) => ipcRenderer.invoke("instances:create", data),
    open: (id: string) => ipcRenderer.invoke("instances:open", id),
  },
  versions: {
    list: () => ipcRenderer.invoke("versions:list"),
    optifine: (mc?: string) => ipcRenderer.invoke("versions:optifine", mc),
  },
  news: {
    list: () => ipcRenderer.invoke("news:list"),
  },
  mods: {
    search: (q: string, mc: string, loader: string) => ipcRenderer.invoke("mods:search", q, mc, loader),
    install: (projectId: string, instanceId: string) => ipcRenderer.invoke("mods:install", projectId, instanceId),
  },
  game: {
    install: (id: string) => ipcRenderer.invoke("game:install", id),
    play: (id: string) => ipcRenderer.invoke("game:play", id),
  },
  onProgress: (cb: (p: { msg: string; ratio?: number }) => void) => {
    const listener = (_e: unknown, p: { msg: string; ratio?: number }) => cb(p);
    ipcRenderer.on("progress", listener);
    return () => ipcRenderer.removeListener("progress", listener);
  },
});
