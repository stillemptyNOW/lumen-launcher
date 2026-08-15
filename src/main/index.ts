import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { loginWithBrowser, createOffline, logout, refreshAccount, publicAccount } from "./auth";
import {
  launchInstance,
  listMinecraftVersions,
  listOptifine,
  prepareInstance,
  searchModrinth,
  installModrinthVersion,
  getNews,
  resolveSkinUrl,
  resolveCapeDataUrl,
} from "./engine";
import {
  getAccounts,
  getActiveAccount,
  getInstances,
  getSettings,
  saveInstances,
  setActiveUuid,
  setSettings,
  type Instance,
  type LoaderId,
} from "./store";
import { instancesRoot } from "./paths";

let win: BrowserWindow | null = null;

function createWindow(): void {
  win = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 1100,
    minHeight: 640,
    frame: false,
    backgroundColor: "#1E1E1F",
    show: false,
    icon: path.join(app.getAppPath(), "resources", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webgl: true,
      backgroundThrottling: false,
    },
  });

  if (!app.isPackaged && process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else if (!app.isPackaged) {
    void win.loadURL("http://127.0.0.1:5173");
  } else {
    void win.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }

  win.once("ready-to-show", () => win?.show());
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

function sendProgress(msg: string, ratio?: number): void {
  win?.webContents.send("progress", { msg, ratio });
}

ipcMain.handle("window:min", () => win?.minimize());
ipcMain.handle("window:max", () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.handle("window:close", () => win?.close());

ipcMain.handle("account:list", () => getAccounts().map((a) => publicAccount(a)));
ipcMain.handle("account:active", () => publicAccount(getActiveAccount()));
ipcMain.handle("account:select", (_e, uuid: string) => {
  setActiveUuid(uuid);
  return publicAccount(getActiveAccount());
});
ipcMain.handle("account:login", async () => {
  if (!win) throw new Error("Окно лаунчера ещё не готово.");
  try {
    const acc = await loginWithBrowser(win);
    return publicAccount(acc);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg);
  }
});
ipcMain.handle("account:offline", async (_e, name: string) => publicAccount(await createOffline(name)));
ipcMain.handle("account:logout", (_e, uuid?: string) => {
  logout(uuid);
  return publicAccount(getActiveAccount());
});
ipcMain.handle("account:refresh", async () => {
  const acc = getActiveAccount();
  if (!acc) return null;
  try {
    return publicAccount(await refreshAccount(acc));
  } catch {
    return publicAccount(acc);
  }
});
ipcMain.handle("account:skin", async () => {
  const acc = getActiveAccount();
  if (!acc || acc.type === "offline") return acc?.skinUrl ?? null;
  return (await resolveSkinUrl(acc.uuid)) || acc.skinUrl || null;
});
ipcMain.handle("account:cape", async () => resolveCapeDataUrl());

ipcMain.handle("settings:get", () => getSettings());
ipcMain.handle("settings:set", (_e, partial: Record<string, unknown>) => setSettings(partial));

ipcMain.handle("instances:list", () => getInstances());
ipcMain.handle("instances:save", (_e, list: Instance[]) => saveInstances(list));
ipcMain.handle("instances:create", (_e, data: { name: string; mcVersion: string; loader: LoaderId; installLumen: boolean }) => {
  const list = getInstances();
  const inst: Instance = {
    id: crypto.randomUUID().slice(0, 12),
    name: data.name,
    mcVersion: data.mcVersion,
    loader: data.loader,
    installLumen: data.installLumen && data.loader === "fabric" && data.mcVersion === "26.2",
    created: Date.now(),
    lastPlayed: 0,
    ramMb: 0,
  };
  saveInstances([...list, inst]);
  setSettings({ selectedInstance: inst.id });
  return inst;
});
ipcMain.handle("instances:open", (_e, id: string) => {
  void shell.openPath(path.join(instancesRoot(), id));
});

ipcMain.handle("versions:list", () => listMinecraftVersions());
ipcMain.handle("versions:optifine", (_e, mc?: string) => listOptifine(mc));
ipcMain.handle("news:list", () => getNews());

ipcMain.handle("mods:search", (_e, query: string, mc: string, loader: string) => searchModrinth(query, mc, loader));
ipcMain.handle("mods:install", async (_e, projectId: string, instanceId: string) => {
  const inst = getInstances().find((i) => i.id === instanceId);
  if (!inst) throw new Error("Инстанс не найден");
  return installModrinthVersion(projectId, inst, sendProgress);
});

ipcMain.handle("game:install", async (_e, instanceId: string) => {
  const inst = getInstances().find((i) => i.id === instanceId);
  if (!inst) throw new Error("Инстанс не найден");
  return prepareInstance(inst, sendProgress);
});

ipcMain.handle("game:play", async (_e, instanceId: string) => {
  const inst = getInstances().find((i) => i.id === instanceId);
  if (!inst) throw new Error("Инстанс не найден");
  let acc = getActiveAccount();
  if (!acc) throw new Error("Сначала войдите в аккаунт.");
  if (acc.type === "microsoft") {
    try {
      acc = await refreshAccount(acc);
    } catch {
      /* старый токен ещё может жить */
    }
  }
  await launchInstance(inst, acc, sendProgress);
  const list = getInstances().map((i) => (i.id === inst.id ? { ...i, lastPlayed: Date.now() } : i));
  saveInstances(list);
  if (getSettings().hideOnLaunch) win?.minimize();
  return true;
});
