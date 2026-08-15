import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

export function dataRoot(): string {
  const root = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(root, { recursive: true });
  return root;
}

function isCompleteMinecraft(dir: string): boolean {
  const fabricJar = path.join(dir, "libraries", "net", "fabricmc", "fabric-loader");
  const hasVersions = fs.existsSync(path.join(dir, "versions"));
  if (!hasVersions) return false;
  // полная установка: есть fabric-loader jar или хотя бы client 26.2
  try {
    if (fs.existsSync(fabricJar)) {
      const jars = fs.readdirSync(fabricJar, { recursive: true }) as string[];
      if (jars.some((j) => String(j).endsWith(".jar"))) return true;
    }
  } catch {
    /* ignore */
  }
  return fs.existsSync(path.join(dir, "versions", "26.2", "26.2.jar"));
}

function existingMinecraft(): string | null {
  const home = process.env.USERPROFILE || "";
  const candidates = [
    path.join(home, "Desktop", "ИИ проекты", "Grok", "minecraft-26.2-launcher", "data", "minecraft"),
    path.join(dataRoot(), "minecraft"),
  ];
  // предпочитаем установку, где уже есть fabric-loader jar
  for (const p of candidates) {
    if (isCompleteMinecraft(p) && fs.existsSync(path.join(p, "libraries", "net", "fabricmc", "fabric-loader"))) {
      try {
        const sub = fs.readdirSync(path.join(p, "libraries", "net", "fabricmc", "fabric-loader"), { recursive: true }) as string[];
        if (sub.some((j) => String(j).endsWith(".jar"))) return p;
      } catch {
        /* continue */
      }
    }
  }
  for (const p of candidates) {
    if (fs.existsSync(path.join(p, "versions"))) return p;
  }
  return null;
}

export function gameRoot(): string {
  const reused = existingMinecraft();
  if (reused) return reused;
  const p = path.join(dataRoot(), "minecraft");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function instancesRoot(): string {
  const p = path.join(dataRoot(), "instances");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function skinsRoot(): string {
  const p = path.join(dataRoot(), "skins");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function lumenJarPath(): string {
  const packed = path.join(process.resourcesPath, "lumen-2.0.0.jar");
  if (fs.existsSync(packed)) return packed;
  return path.join(app.getAppPath(), "resources", "lumen-2.0.0.jar");
}

/** Встроенный плащ PinkPantheress (skinview 64×32 / HD 512). */
export function capePath(name = "pinkpantheress_skinview.png"): string {
  const candidates = [
    path.join(process.resourcesPath, "capes", name),
    path.join(app.getAppPath(), "resources", "capes", name),
    path.join(__dirname, "..", "resources", "capes", name),
    // fallbacks
    path.join(process.resourcesPath, "capes", "pinkpantheress.png"),
    path.join(app.getAppPath(), "resources", "capes", "pinkpantheress.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[1];
}

/** Бандл Essential для Fabric 26.2 (опционально, иначе качаем с Modrinth). */
export function essentialJarPath(): string | null {
  const names = ["Essential_1-4-1-1_fabric_26-2.jar", "essential-fabric-26.2.jar"];
  const dirs = [
    process.resourcesPath,
    path.join(process.resourcesPath, "mods"),
    path.join(app.getAppPath(), "resources", "mods"),
    path.join(app.getAppPath(), "resources"),
  ];
  for (const dir of dirs) {
    for (const name of names) {
      const p = path.join(dir, name);
      if (fs.existsSync(p) && fs.statSync(p).size > 1_000_000) return p;
    }
  }
  return null;
}

/** Prefer local AppData minecraft if it already has the needed version jars. */
export function resolveGameRoot(preferredVersion?: string): string {
  const root = gameRoot();
  if (!preferredVersion) return root;
  const local = path.join(dataRoot(), "minecraft");
  if (fs.existsSync(path.join(local, "versions", preferredVersion, `${preferredVersion}.json`))) {
    return local;
  }
  return root;
}
