import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { app } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import extractZip from "extract-zip";
import { downloadFile, fetchBuffer, getJson, getText } from "./http";
import type { Account, Instance, LoaderId } from "./store";
import { getSettings } from "./store";
import { capePath, essentialJarPath, gameRoot, instancesRoot, lumenJarPath } from "./paths";

export type ProgressFn = (msg: string, ratio?: number) => void;

const MANIFEST = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";

interface VersionMeta {
  id: string;
  type: string;
  url: string;
  releaseTime: string;
}

interface Rule {
  action: "allow" | "disallow";
  os?: { name?: string; arch?: string };
  features?: Record<string, boolean>;
}

interface Library {
  name: string;
  url?: string;
  sha1?: string;
  downloads?: {
    artifact?: { path: string; url: string; sha1?: string; size?: number };
    classifiers?: Record<string, { path: string; url: string; sha1?: string }>;
  };
  rules?: Rule[];
  natives?: Record<string, string>;
}

interface VersionJson {
  id: string;
  inheritsFrom?: string;
  type?: string;
  mainClass?: string;
  minecraftArguments?: string;
  arguments?: { game?: (string | { rules?: Rule[]; value: string | string[] })[]; jvm?: (string | { rules?: Rule[]; value: string | string[] })[] };
  libraries?: Library[];
  downloads?: { client?: { url: string; sha1?: string } };
  assetIndex?: { id: string; url: string; sha1?: string };
  logging?: { client?: { file?: { id: string; url: string } } };
}

function instDir(id: string): string {
  const p = path.join(instancesRoot(), id);
  fs.mkdirSync(path.join(p, "mods"), { recursive: true });
  fs.mkdirSync(path.join(p, "saves"), { recursive: true });
  fs.mkdirSync(path.join(p, "resourcepacks"), { recursive: true });
  return p;
}



function osName(): string {
  return process.platform === "win32" ? "windows" : process.platform === "darwin" ? "osx" : "linux";
}

function rulesAllow(rules?: Rule[], features: Record<string, boolean> = {}): boolean {
  if (!rules || !rules.length) return true;
  let allow = false;
  for (const rule of rules) {
    let match = true;
    if (rule.os) {
      if (rule.os.name && rule.os.name !== osName()) match = false;
      if (rule.os.arch && rule.os.arch !== process.arch) match = false;
    }
    if (rule.features) {
      for (const [k, v] of Object.entries(rule.features)) {
        if (Boolean(features[k]) !== v) match = false;
      }
    }
    if (match) allow = rule.action === "allow";
  }
  return allow;
}

export async function listMinecraftVersions(): Promise<{ id: string; type: string; releaseTime: string }[]> {
  const data = await getJson<{ versions: VersionMeta[] }>(MANIFEST);
  return data.versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }));
}

export async function listOptifine(mc?: string): Promise<{ mcversion: string; type: string; patch: string; filename: string }[]> {
  try {
    const raw = await getJson<Record<string, string>[]>("https://bmclapi2.bangbang93.com/optifine/versionList");
    return raw
      .map((it) => ({
        mcversion: String(it.mcversion || it.mcVersion || ""),
        type: String(it.type || "HD_U"),
        patch: String(it.patch || ""),
        filename: String(it.filename || it.name || ""),
      }))
      .filter((it) => (mc ? it.mcversion === mc : Boolean(it.mcversion)));
  } catch {
    return [];
  }
}

async function fetchVersionJson(id: string): Promise<VersionJson> {
  const root = gameRoot();
  const file = path.join(root, "versions", id, `${id}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as VersionJson;
  const man = await getJson<{ versions: VersionMeta[] }>(MANIFEST);
  const meta = man.versions.find((v) => v.id === id);
  if (!meta) throw new Error(`Версия ${id} не найдена.`);
  const json = await getJson<VersionJson>(meta.url);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(json, null, 2));
  return json;
}

async function mergeInherited(id: string): Promise<VersionJson> {
  const cur = await fetchVersionJson(id);
  if (!cur.inheritsFrom) return cur;
  const base = await mergeInherited(cur.inheritsFrom);
  return {
    ...base,
    ...cur,
    // дочерние (Fabric) библиотеки должны быть раньше родительских
    libraries: [...(cur.libraries ?? []), ...(base.libraries ?? [])],
    arguments: {
      game: [...(base.arguments?.game ?? []), ...(cur.arguments?.game ?? [])],
      jvm: [...(base.arguments?.jvm ?? []), ...(cur.arguments?.jvm ?? [])],
    },
    minecraftArguments: cur.minecraftArguments || base.minecraftArguments,
    mainClass: cur.mainClass || base.mainClass,
    downloads: cur.downloads || base.downloads,
    assetIndex: cur.assetIndex || base.assetIndex,
  };
}

async function installVanilla(mc: string, on: ProgressFn): Promise<void> {
  const root = gameRoot();
  on(`Версия ${mc}…`, 0.1);
  const json = await fetchVersionJson(mc);
  if (json.inheritsFrom) await installVanilla(json.inheritsFrom, on);

  if (json.downloads?.client?.url) {
    on("client.jar…", 0.2);
    await downloadFile(json.downloads.client.url, path.join(root, "versions", mc, `${mc}.jar`), json.downloads.client.sha1);
  }

  const libs = json.libraries ?? [];
  let i = 0;
  for (const lib of libs) {
    i += 1;
    if (!rulesAllow(lib.rules)) continue;
    on(`Библиотеки ${i}/${libs.length}`, 0.2 + (i / Math.max(libs.length, 1)) * 0.35);
    await ensureLibrary(root, lib);
    const nativesKey = lib.natives?.[osName()];
    const nat = nativesKey
      ? lib.downloads?.classifiers?.[nativesKey.replace("${arch}", process.arch === "x64" ? "64" : "32")]
      : undefined;
    if (nat?.url) {
      const zip = path.join(root, "libraries", nat.path);
      await downloadFile(nat.url, zip, nat.sha1);
      const nativesDir = path.join(root, "versions", mc, "natives", "java");
      fs.mkdirSync(nativesDir, { recursive: true });
      await extractZip(zip, { dir: nativesDir });
    }
  }

  if (json.assetIndex?.url) {
    on("Индекс ассетов…", 0.6);
    const idxPath = path.join(root, "assets", "indexes", `${json.assetIndex.id}.json`);
    await downloadFile(json.assetIndex.url, idxPath, json.assetIndex.sha1);
    const idx = JSON.parse(fs.readFileSync(idxPath, "utf8")) as { objects: Record<string, { hash: string; size: number }> };
    const entries = Object.values(idx.objects);
    let n = 0;
    const queue = [...entries];
    const workers = 4;
    await Promise.all(
      Array.from({ length: workers }, async () => {
        while (queue.length) {
          const obj = queue.shift();
          if (!obj) break;
          n += 1;
          if (n % 40 === 0) on(`Ассеты ${n}/${entries.length}`, 0.6 + (n / entries.length) * 0.2);
          const dest = path.join(root, "assets", "objects", obj.hash.slice(0, 2), obj.hash);
          await downloadFile(`https://resources.download.minecraft.net/${obj.hash.slice(0, 2)}/${obj.hash}`, dest, obj.hash);
        }
      }),
    );
  }

  if (json.logging?.client?.file?.url && json.logging.client.file.id) {
    await downloadFile(json.logging.client.file.url, path.join(root, "assets", "log_configs", json.logging.client.file.id));
  }
}

function mavenPath(name: string): string {
  const [g, a, v, c] = name.split(":");
  const file = c ? `${a}-${v}-${c}.jar` : `${a}-${v}.jar`;
  return `${g.replaceAll(".", "/")}/${a}/${v}/${file}`;
}

/** `+` в URL = пробел, поэтому кодируем сегменты (критично для fabric sponge-mixin). */
function mavenUrl(base: string, rel: string): string {
  const b = base.replace(/\/$/, "");
  const encoded = rel
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `${b}/${encoded}`;
}

function findInstalled(loader: LoaderId, mc: string): string | null {
  const dir = path.join(gameRoot(), "versions");
  if (!fs.existsSync(dir)) return loader === "vanilla" ? null : null;
  const names = fs.readdirSync(dir);
  if (loader === "vanilla") return names.includes(mc) && fs.existsSync(path.join(dir, mc, `${mc}.json`)) ? mc : null;
  const hit = names.find((n) => {
    const low = n.toLowerCase();
    if (!n.includes(mc)) return false;
    if (loader === "fabric") return low.includes("fabric");
    if (loader === "quilt") return low.includes("quilt");
    if (loader === "neoforge") return low.includes("neoforge");
    if (loader === "forge" || loader === "forge_optifine") return low.includes("forge") && !low.includes("neoforge");
    if (loader === "optifine") return low.includes("optifine");
    return false;
  });
  return hit ?? null;
}

async function installFabricLike(
  mc: string,
  kind: "fabric" | "quilt",
  on: ProgressFn,
): Promise<string> {
  await installVanilla(mc, on);
  on(`Мета ${kind}…`, 0.82);
  const metaUrl =
    kind === "fabric"
      ? `https://meta.fabricmc.net/v2/versions/loader/${mc}`
      : `https://meta.quiltmc.org/v3/versions/loader/${mc}`;
  const loaders = await getJson<{ loader: { version: string; stable?: boolean } }[]>(metaUrl);
  if (!loaders.length) throw new Error(`${kind} ещё не поддерживает ${mc}.`);
  const loaderVer = (loaders.find((l) => l.loader.stable) ?? loaders[0]).loader.version;
  const profileUrl =
    kind === "fabric"
      ? `https://meta.fabricmc.net/v2/versions/loader/${mc}/${loaderVer}/profile/json`
      : `https://meta.quiltmc.org/v3/versions/loader/${mc}/${loaderVer}/profile/json`;
  const profile = await getJson<VersionJson>(profileUrl);
  const id = profile.id || `${kind}-loader-${loaderVer}-${mc}`;
  const destDir = path.join(gameRoot(), "versions", id);
  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(path.join(destDir, `${id}.json`), JSON.stringify({ ...profile, id }, null, 2));
  await installVanilla(id, on);
  // Fabric/Quilt ждут jar версии = копия client.jar родителя
  ensureVersionJar(gameRoot(), id, mc);
  return id;
}

/** jar профиля fabric-loader-…/xxx.jar должен быть копией client.jar */
function ensureVersionJar(root: string, versionId: string, parentId?: string): void {
  const jsonPath = path.join(root, "versions", versionId, `${versionId}.json`);
  let parent = parentId;
  if (!parent && fs.existsSync(jsonPath)) {
    try {
      parent = (JSON.parse(fs.readFileSync(jsonPath, "utf8")) as VersionJson).inheritsFrom;
    } catch {
      /* ignore */
    }
  }
  if (!parent) return;
  const parentJar = path.join(root, "versions", parent, `${parent}.jar`);
  const ownJar = path.join(root, "versions", versionId, `${versionId}.jar`);
  if (!fs.existsSync(parentJar)) return;
  if (!fs.existsSync(ownJar) || fs.statSync(ownJar).size < 1_000_000) {
    fs.mkdirSync(path.dirname(ownJar), { recursive: true });
    fs.copyFileSync(parentJar, ownJar);
  }
  for (const sub of ["java", "jna", "lwjgl", "netty"]) {
    fs.mkdirSync(path.join(root, "versions", versionId, "natives", sub), { recursive: true });
  }
}

async function installForgeFamily(mc: string, kind: "forge" | "neoforge", on: ProgressFn): Promise<string> {
  await installVanilla(mc, on);
  on(`Поиск ${kind}…`, 0.78);
  if (kind === "forge") {
    const promo = await getJson<{ promos: Record<string, string> }>("https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json");
    const ver = promo.promos[`${mc}-recommended`] || promo.promos[`${mc}-latest`];
    if (!ver) throw new Error(`Forge ещё не вышел для ${mc}.`);
    const full = `${mc}-${ver}`;
    const installer = `https://maven.minecraftforge.net/net/minecraftforge/forge/${full}/forge-${full}-installer.jar`;
    return runForgeInstaller(mc, installer, "forge", on);
  }
  const xml = await getText("https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml");
  const vers = [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1]);
  const prefix = mc.startsWith("1.") ? mc.slice(2) : mc.replaceAll(".", ".");
  const hit = [...vers].reverse().find((v) => v.startsWith(prefix) || v.includes(mc)) || vers.at(-1);
  if (!hit) throw new Error(`NeoForge ещё не вышел для ${mc}.`);
  const installer = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${hit}/neoforge-${hit}-installer.jar`;
  return runForgeInstaller(mc, installer, "neoforge", on);
}

async function runForgeInstaller(mc: string, url: string, kind: string, on: ProgressFn): Promise<string> {
  const cache = path.join(gameRoot(), "installer-cache");
  fs.mkdirSync(cache, { recursive: true });
  const jar = path.join(cache, `${kind}-${mc}-installer.jar`);
  on(`Инсталлер ${kind}…`, 0.8);
  await downloadFile(url, jar);
  const java = await ensureJava(on);
  await new Promise<void>((resolve, reject) => {
    const p = spawn(java, ["-jar", jar, "--installClient", gameRoot()], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => {
      err += String(d);
    });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${kind} installer: ${err.slice(-500) || code}`))));
    p.on("error", reject);
  });
  const id = findInstalled(kind === "neoforge" ? "neoforge" : "forge", mc);
  if (!id) throw new Error(`${kind} установлен, но профиль не найден.`);
  return id;
}

async function downloadOptifineJar(mc: string, destDir: string, on: ProgressFn): Promise<string> {
  const items = await listOptifine(mc);
  if (!items.length) throw new Error(`OptiFine для ${mc} ещё не вышел (последняя линейка — 26.1.2).`);
  const pick = items.find((i) => !/pre|preview/i.test(i.filename)) ?? items[0];
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, pick.filename || `OptiFine_${mc}.jar`);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 50_000) return dest;
  on(`Скачивание ${pick.filename}…`, 0.84);
  const url = `https://bmclapi2.bangbang93.com/optifine/${pick.mcversion}/${pick.type}/${pick.patch}`;
  await downloadFile(url, dest);
  if (fs.statSync(dest).size < 50_000) {
    fs.unlinkSync(dest);
    throw new Error("Скачанный OptiFine слишком маленький.");
  }
  return dest;
}

async function installOptifineStandalone(mc: string, on: ProgressFn): Promise<string> {
  const existing = findInstalled("optifine", mc);
  if (existing) return existing;
  await installVanilla(mc, on);
  const jar = await downloadOptifineJar(mc, path.join(gameRoot(), "optifine-cache"), on);
  const java = await ensureJava(on);
  on("Инсталлер OptiFine…", 0.88);
  await new Promise<void>((resolve, reject) => {
    const p = spawn(java, ["-Djava.awt.headless=true", "-cp", jar, "optifine.Installer", gameRoot()], { windowsHide: true });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`OptiFine installer exit ${code}`))));
    p.on("error", reject);
  });
  const id = findInstalled("optifine", mc);
  if (!id) throw new Error("Инсталлер OptiFine не создал профиль.");
  return id;
}

function findJavaIn(dir: string): string | undefined {
  if (!fs.existsSync(dir)) return undefined;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop()!;
    let names: string[] = [];
    try {
      names = fs.readdirSync(cur);
    } catch {
      continue;
    }
    for (const name of names) {
      const full = path.join(cur, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (name.toLowerCase() === "java.exe" && st.isFile()) return full;
      if (st.isDirectory()) stack.push(full);
    }
  }
  return undefined;
}

export function resolveJava(explicit?: string): string | undefined {
  if (explicit && fs.existsSync(explicit)) return explicit;
  const guessed = [
    path.join(gameRoot(), "runtime"),
    path.join(process.env.LOCALAPPDATA || "", "lumen-launcher", "data", "minecraft", "runtime"),
    path.join(process.env.USERPROFILE || "", "Desktop", "ИИ проекты", "Grok", "minecraft-26.2-launcher", "data", "minecraft", "runtime"),
    path.join(process.env["ProgramFiles"] || "", "Eclipse Adoptium"),
    path.join(process.env["ProgramFiles"] || "", "Java"),
    path.join(process.env["ProgramFiles"] || "", "Microsoft"),
    path.join(process.env["ProgramFiles"] || "", "Zulu"),
  ];
  for (const dir of guessed) {
    const hit = findJavaIn(dir);
    if (hit) return hit;
  }
  if (process.env.JAVA_HOME) {
    const p = path.join(process.env.JAVA_HOME, "bin", "java.exe");
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

async function ensureJava(on: ProgressFn): Promise<string> {
  const existing = resolveJava(getSettings().javaPath);
  if (existing) {
    on(`Java: ${existing}`, 0.12);
    return existing;
  }
  on("Скачивание Java 25 (Adoptium)…", 0.12);
  const destDir = path.join(gameRoot(), "runtime", "temurin-25");
  const zip = path.join(gameRoot(), "runtime", "temurin-25.zip");
  const url = "https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jre/hotspot/normal/eclipse?project=jdk";
  await downloadFile(url, zip);
  fs.mkdirSync(destDir, { recursive: true });
  await extractZip(zip, { dir: destDir });
  const found = resolveJava();
  if (!found) throw new Error("Java скачана, но java.exe не найден.");
  return found;
}

async function installFabricApi(mc: string, modsDir: string, on: ProgressFn): Promise<void> {
  if (fs.readdirSync(modsDir).some((f) => f.startsWith("fabric-api-"))) return;
  on("Fabric API…", 0.9);
  try {
    const url = `https://api.modrinth.com/v2/project/P7dR8mSH/version?game_versions=${encodeURIComponent(`["${mc}"]`)}&loaders=${encodeURIComponent(`["fabric"]`)}`;
    const versions = await getJson<{ files?: { url: string; filename: string }[] }[]>(url);
    const file = versions[0]?.files?.[0];
    if (!file) return;
    await downloadFile(file.url, path.join(modsDir, file.filename));
  } catch (e) {
    on(`Fabric API пропущен: ${e instanceof Error ? e.message : e}`);
  }
}

function installLumen(modsDir: string, on: ProgressFn): void {
  const src = lumenJarPath();
  if (!fs.existsSync(src)) {
    on("Lumen jar не найден в resources", 0.92);
    return;
  }
  // убрать старые lumen-*.jar, чтобы не грузить два мода
  for (const f of fs.readdirSync(modsDir)) {
    if (/^lumen-.*\.jar$/i.test(f) || f.toLowerCase() === "lumen.jar") {
      try {
        fs.unlinkSync(path.join(modsDir, f));
      } catch {
        /* ignore */
      }
    }
  }
  const destName = path.basename(src);
  fs.copyFileSync(src, path.join(modsDir, destName));
  on(`Lumen: ${destName}`, 0.93);
}

/** Essential — хост миров / друзья / мультиплеер для Lumen 26.2 Fabric. */
async function installEssential(mc: string, modsDir: string, on: ProgressFn): Promise<void> {
  if (fs.readdirSync(modsDir).some((f) => /essential/i.test(f) && f.endsWith(".jar"))) {
    on("Essential уже есть", 0.95);
    return;
  }
  on("Essential (сеть / друзья)…", 0.94);

  const local = essentialJarPath();
  if (local) {
    const dest = path.join(modsDir, path.basename(local));
    fs.copyFileSync(local, dest);
    on(`Essential: ${path.basename(local)}`, 0.96);
    return;
  }

  // кэш в game root
  const cacheDir = path.join(gameRoot(), "mod-cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  try {
    const api = `https://api.modrinth.com/v2/project/k2ZPuTBm/version?game_versions=${encodeURIComponent(`["${mc}"]`)}&loaders=${encodeURIComponent(`["fabric"]`)}`;
    const versions = await getJson<{ files?: { url: string; filename: string; size?: number }[] }[]>(api);
    const file = versions[0]?.files?.[0];
    if (!file) {
      on("Essential: нет версии для этой MC — поставьте вручную с essential.gg");
      return;
    }
    const cached = path.join(cacheDir, file.filename);
    await downloadFile(file.url, cached);
    fs.copyFileSync(cached, path.join(modsDir, file.filename));
    on(`Essential: ${file.filename}`, 0.96);
  } catch (e) {
    on(`Essential не скачался: ${e instanceof Error ? e.message : e}`);
  }
}

/** Копирует встроенный плащ в инстанс (для resourcepacks / модов). */
function installBuiltinCape(gameDir: string, on: ProgressFn): void {
  const src = capePath("pinkpantheress.png");
  if (!fs.existsSync(src)) return;
  const destDir = path.join(gameDir, "lumen-cosmetics");
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, path.join(destDir, "pinkpantheress_cape.png"));
  // также в resourcepacks как текстура для превью
  const rp = path.join(gameDir, "resourcepacks", "LumenPinkPantheressCape");
  fs.mkdirSync(path.join(rp, "assets", "minecraft", "textures", "entity"), { recursive: true });
  fs.writeFileSync(
    path.join(rp, "pack.mcmeta"),
    JSON.stringify({ pack: { pack_format: 46, description: "Lumen · PinkPantheress cape" } }, null, 2),
  );
  fs.copyFileSync(src, path.join(rp, "assets", "minecraft", "textures", "entity", "cape_pinkpantheress.png"));
  on("Плащ PinkPantheress → lumen-cosmetics", 0.97);
}

export async function resolveCapeDataUrl(): Promise<string | null> {
  try {
    // skinview3d: классический 64×32; fallback на обычный png
    for (const name of ["pinkpantheress_skinview.png", "pinkpantheress.png", "pinkpantheress_hd.png"]) {
      const p = capePath(name);
      if (fs.existsSync(p)) {
        const buf = fs.readFileSync(p);
        return `data:image/png;base64,${buf.toString("base64")}`;
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function prepareInstance(inst: Instance, on: ProgressFn): Promise<string> {
  const loader = inst.loader;
  let versionId: string;
  if (loader === "vanilla") {
    await installVanilla(inst.mcVersion, on);
    versionId = inst.mcVersion;
  } else if (loader === "fabric") versionId = await installFabricLike(inst.mcVersion, "fabric", on);
  else if (loader === "quilt") versionId = await installFabricLike(inst.mcVersion, "quilt", on);
  else if (loader === "forge") versionId = await installForgeFamily(inst.mcVersion, "forge", on);
  else if (loader === "neoforge") versionId = await installForgeFamily(inst.mcVersion, "neoforge", on);
  else if (loader === "optifine") versionId = await installOptifineStandalone(inst.mcVersion, on);
  else if (loader === "forge_optifine") {
    versionId = await installForgeFamily(inst.mcVersion, "forge", on);
    const jar = await downloadOptifineJar(inst.mcVersion, path.join(gameRoot(), "optifine-cache"), on);
    fs.copyFileSync(jar, path.join(instDir(inst.id), "mods", path.basename(jar)));
  } else throw new Error(`Неизвестный лоадер: ${loader}`);

  const mods = path.join(instDir(inst.id), "mods");
  if (loader === "fabric") {
    await installFabricApi(inst.mcVersion, mods, on);
    if (inst.installLumen && inst.mcVersion === "26.2") {
      installLumen(mods, on);
      await installEssential(inst.mcVersion, mods, on);
      installBuiltinCape(instDir(inst.id), on);
    }
  }
  return versionId;
}

function collectArgs(
  list: VersionJson["arguments"] extends infer A ? A extends { game?: infer G } ? G : never : never,
  features: Record<string, boolean>,
): string[] {
  const out: string[] = [];
  if (!list) return out;
  for (const item of list) {
    if (typeof item === "string") out.push(item);
    else if (item && typeof item === "object" && rulesAllow(item.rules, features)) {
      const v = item.value;
      if (Array.isArray(v)) out.push(...v);
      else if (v) out.push(v);
    }
  }
  return out;
}

function libraryPath(root: string, lib: Library): string | null {
  if (lib.downloads?.artifact?.path) return path.join(root, "libraries", lib.downloads.artifact.path);
  if (lib.name) return path.join(root, "libraries", mavenPath(lib.name));
  return null;
}

/** blocklist-1.0.10.jar = 964 байта — порог 1000 байт ломал загрузку навсегда. */
function libraryLooksValid(dest: string, lib: Library): boolean {
  if (!fs.existsSync(dest)) return false;
  const size = fs.statSync(dest).size;
  if (size <= 0) return false;
  const art = lib.downloads?.artifact;
  if (art?.size && art.size > 0) {
    // допуск ±0 (точный размер из манифеста)
    if (size === art.size) return true;
    // если sha1 есть — сверим ниже; иначе размер обязателен
  }
  if (art?.sha1 || lib.sha1) {
    try {
      const hash = crypto.createHash("sha1").update(fs.readFileSync(dest)).digest("hex");
      const want = (art?.sha1 || lib.sha1 || "").toLowerCase();
      return hash === want;
    } catch {
      return false;
    }
  }
  // без метаданных: любое ненулевое jar (в т.ч. tiny mojang jars)
  return size >= 64;
}

async function ensureLibrary(root: string, lib: Library): Promise<string | null> {
  const rel = lib.downloads?.artifact?.path || mavenPath(lib.name);
  if (!rel) return null;
  const dest = path.join(root, "libraries", rel);
  if (libraryLooksValid(dest, lib)) return dest;

  // копируем из рабочей полной установки
  for (const donor of donorLibraryRoots()) {
    const src = path.join(donor, rel);
    if (libraryLooksValid(src, lib) || (fs.existsSync(src) && fs.statSync(src).size >= 64)) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      if (libraryLooksValid(dest, lib) || fs.statSync(dest).size >= 64) return dest;
    }
  }

  const art = lib.downloads?.artifact;
  const candidates: string[] = [];
  if (art?.url) candidates.push(art.url.replaceAll("+", "%2B"));
  const base = (lib.url || "https://libraries.minecraft.net/").replace(/\/$/, "");
  candidates.push(mavenUrl(base, rel));
  candidates.push(mavenUrl("https://maven.fabricmc.net", rel));
  candidates.push(mavenUrl("https://bmclapi2.bangbang93.com/maven", rel));
  candidates.push(mavenUrl("https://libraries.minecraft.net", rel));
  candidates.push(mavenUrl("https://launcher.mojang.com", rel));
  let last = "";
  for (const url of [...new Set(candidates)]) {
    try {
      await downloadFile(url, dest, art?.sha1 || lib.sha1);
      if (libraryLooksValid(dest, lib) || (fs.existsSync(dest) && fs.statSync(dest).size >= 64)) {
        return dest;
      }
      last = `файл слишком маленький (${fs.existsSync(dest) ? fs.statSync(dest).size : 0} B)`;
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Библиотека ${lib.name}: ${last}`);
}

function donorLibraryRoots(): string[] {
  const home = process.env.USERPROFILE || "";
  return [
    path.join(home, "Desktop", "ИИ проекты", "Grok", "minecraft-26.2-launcher", "data", "minecraft", "libraries"),
  ].filter((p) => fs.existsSync(p));
}

function findPython(): string | null {
  const tries: { cmd: string; args: string[] }[] = [
    { cmd: "python", args: ["-c", "import minecraft_launcher_lib"] },
    { cmd: "py", args: ["-3", "-c", "import minecraft_launcher_lib"] },
    { cmd: "python3", args: ["-c", "import minecraft_launcher_lib"] },
  ];
  for (const t of tries) {
    try {
      const r = spawnSync(t.cmd, t.args, { windowsHide: true, timeout: 8000, encoding: "utf8" });
      if (r.status === 0) return t.cmd;
    } catch {
      /* try next */
    }
  }
  return null;
}

function launchHelperPath(): string | null {
  const candidates = [
    path.join(process.resourcesPath || "", "launch_helper.py"),
    path.join(app.getAppPath(), "resources", "launch_helper.py"),
    path.join(__dirname, "..", "resources", "launch_helper.py"),
    path.join(process.cwd(), "resources", "launch_helper.py"),
  ];
  for (const p of candidates) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function launchViaPython(
  versionId: string,
  root: string,
  gameDir: string,
  account: Account,
  ram: number,
  java: string,
  logFile: string,
  on: ProgressFn,
): Promise<boolean> {
  const helper = launchHelperPath();
  const py = findPython();
  if (!helper || !py) return false;

  on("Запуск через minecraft-launcher-lib…", 0.97);
  const cfg = {
    minecraftDirectory: root,
    gameDirectory: gameDir,
    versionId,
    username: account.name,
    uuid: account.uuid.replace(/-/g, ""),
    accessToken: account.accessToken || "0",
    ramMb: ram,
    javaPath: java,
    logFile,
  };
  const cfgPath = path.join(os.tmpdir(), `lumen-launch-${Date.now()}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(cfg), "utf8");
  fs.writeFileSync(logFile, `helper=${helper}\npython=${py}\ncfg=${cfgPath}\n\n`, "utf8");

  const args = py === "py" ? ["-3", helper, cfgPath] : [helper, cfgPath];
  const code = await new Promise<number>((resolve) => {
    const child = spawn(py, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
      shell: false,
    });
    let err = "";
    child.stdout?.on("data", (d) => {
      try {
        fs.appendFileSync(logFile, String(d));
      } catch {
        /* ignore */
      }
    });
    child.stderr?.on("data", (d) => {
      err += String(d);
      try {
        fs.appendFileSync(logFile, String(d));
      } catch {
        /* ignore */
      }
    });
    child.on("error", (e) => {
      err += e.message;
      resolve(99);
    });
    child.on("exit", (c) => resolve(c ?? 99));
  });

  try {
    fs.unlinkSync(cfgPath);
  } catch {
    /* ignore */
  }

  if (code !== 0) {
    on(`Python helper exit ${code}, fallback JS…`);
    return false;
  }
  on("Minecraft запущен (helper)", 1);
  return true;
}

/** Создать natives/* и при необходимости извлечь legacy natives jar. */
async function ensureNativesExtracted(root: string, versionId: string, libs: Library[]): Promise<void> {
  const natives = path.join(root, "versions", versionId, "natives");
  for (const sub of ["java", "jna", "lwjgl", "netty"]) {
    fs.mkdirSync(path.join(natives, sub), { recursive: true });
  }
  const javaNat = path.join(natives, "java");
  const hasDll = fs.existsSync(javaNat) && fs.readdirSync(javaNat).some((f) => f.endsWith(".dll") || f.endsWith(".so"));
  if (hasDll) return;

  for (const lib of libs) {
    if (!rulesAllow(lib.rules)) continue;
    const nativesKey = lib.natives?.[osName()];
    if (!nativesKey) continue;
    const key = nativesKey.replace("${arch}", process.arch === "x64" ? "64" : "32");
    const art = lib.downloads?.classifiers?.[key];
    if (!art?.path) continue;
    const natPath = path.join(root, "libraries", art.path);
    if (art.url) {
      try {
        await downloadFile(art.url, natPath, art.sha1);
      } catch {
        continue;
      }
    }
    if (fs.existsSync(natPath)) {
      try {
        await extractZip(natPath, { dir: javaNat });
      } catch {
        /* ignore */
      }
    }
  }
}

export async function launchInstance(inst: Instance, account: Account, on: ProgressFn): Promise<void> {
  const settings = getSettings();
  let versionId = findInstalled(inst.loader === "forge_optifine" ? "forge" : inst.loader, inst.mcVersion);
  if (!versionId) versionId = await prepareInstance(inst, on);
  else if (inst.loader === "fabric" || inst.loader === "quilt") {
    on("Проверка библиотек…", 0.9);
    const jsonCheck = await mergeInherited(versionId);
    for (const lib of jsonCheck.libraries ?? []) {
      if (!rulesAllow(lib.rules)) continue;
      await ensureLibrary(gameRoot(), lib);
    }
    ensureVersionJar(gameRoot(), versionId, inst.mcVersion);
    const mods = path.join(instDir(inst.id), "mods");
    if (inst.loader === "fabric" && inst.installLumen && inst.mcVersion === "26.2") {
      await installFabricApi(inst.mcVersion, mods, on);
      installLumen(mods, on);
      await installEssential(inst.mcVersion, mods, on);
      installBuiltinCape(instDir(inst.id), on);
    }
  }

  on(`Сборка запуска ${versionId}…`, 0.95);
  const json = await mergeInherited(versionId);
  const root = gameRoot();
  const gameDir = instDir(inst.id);
  const natives = path.join(root, "versions", versionId, "natives");
  for (const sub of ["java", "jna", "lwjgl", "netty"]) {
    fs.mkdirSync(path.join(natives, sub), { recursive: true });
  }
  await ensureNativesExtracted(root, versionId, json.libraries ?? []);

  const classpath: string[] = [];
  const seen = new Set<string>();
  for (const lib of json.libraries ?? []) {
    if (!rulesAllow(lib.rules)) continue;
    const p = await ensureLibrary(root, lib);
    // size>1000 отбрасывал tiny jars (blocklist 964 B) и ломал classpath
    if (p && fs.existsSync(p) && fs.statSync(p).size >= 64) {
      const key = p.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        classpath.push(p);
      }
    }
  }
  const clientId = json.inheritsFrom || versionId;
  ensureVersionJar(root, versionId, clientId);
  const versionJar = path.join(root, "versions", versionId, `${versionId}.jar`);
  const clientJar = path.join(root, "versions", clientId, `${clientId}.jar`);
  if (fs.existsSync(versionJar) && fs.statSync(versionJar).size > 1_000_000) {
    classpath.push(versionJar);
  } else if (fs.existsSync(clientJar)) {
    classpath.push(clientJar);
  } else {
    throw new Error(`Нет client.jar (${clientId}). Переустановите профиль.`);
  }

  if (classpath.length < 20) {
    throw new Error(`Classpath слишком короткий (${classpath.length} jar). Установка неполная — переустановите профиль.`);
  }

  const ram = inst.ramMb || settings.ramMb || 4096;
  const java = await ensureJava(on);
  const logsDir = path.join(gameDir, "logs");
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, "lumen-launch.log");

  // 1) Проверенный путь: Python + minecraft-launcher-lib
  const viaPy = await launchViaPython(versionId, root, gameDir, account, ram, java, logFile, on);
  if (viaPy) {
    // подождать: helper сразу выходит, игра живёт отдельно
    await new Promise((r) => setTimeout(r, 2500));
    return;
  }

  // 2) Fallback: чистый JS
  on(`Запуск Java (${classpath.length} jar)…`, 0.98);
  const features = { has_custom_resolution: true, is_demo_user: false };
  const jvm = json.arguments?.jvm?.length
    ? collectArgs(json.arguments.jvm, features)
    : ["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"];
  const game = json.arguments?.game?.length
    ? collectArgs(json.arguments.game, features)
    : (json.minecraftArguments || "").split(/\s+/).filter(Boolean);

  const log4j = json.logging?.client?.file;
  let log4jPath = "";
  if (log4j?.url && log4j.id) {
    log4jPath = path.join(root, "assets", "log_configs", log4j.id);
    if (!fs.existsSync(log4jPath)) {
      try {
        await downloadFile(log4j.url, log4jPath);
      } catch {
        log4jPath = "";
      }
    }
  }

  // mll: backslash path + forward slash subdir (…\natives/java)
  const nativesBase = natives; // keep Windows separators; JSON already has /java
  const vars: Record<string, string> = {
    natives_directory: nativesBase,
    launcher_name: "LumenLauncher",
    launcher_version: "1.1",
    classpath: classpath.join(path.delimiter),
    auth_player_name: account.name,
    version_name: versionId,
    game_directory: gameDir,
    assets_root: path.join(root, "assets"),
    assets_index_name: json.assetIndex?.id || "legacy",
    auth_uuid: account.uuid.replace(/-/g, ""),
    auth_access_token: account.accessToken || "0",
    clientid: "0",
    auth_xuid: "0",
    user_type: account.type === "microsoft" ? "msa" : "legacy",
    version_type: json.type || "release",
    resolution_width: String(settings.width || 1280),
    resolution_height: String(settings.height || 720),
    user_properties: "{}",
    game_assets: path.join(root, "assets"),
    auth_session: account.accessToken || "0",
    path: log4jPath,
  };

  const subst = (s: string) => s.replace(/\$\{([^}]+)\}/g, (_, k: string) => (k in vars ? vars[k] : `\${${k}}`));
  const extra = settings.jvmArgs.split(/\s+/).filter(Boolean);
  const args = [
    `-Xmx${ram}M`,
    `-Xms${Math.min(1024, ram)}M`,
    ...extra,
    ...jvm.map(subst),
    ...(log4jPath && !jvm.some((x) => String(x).includes("log4j")) ? [`-Dlog4j.configurationFile=${log4jPath}`] : []),
    json.mainClass || "net.minecraft.client.main.Main",
    ...game.map(subst),
  ].filter((a) => a !== "");

  fs.writeFileSync(
    logFile,
    [
      `java=${java}`,
      `version=${versionId}`,
      `main=${json.mainClass}`,
      `root=${root}`,
      `gameDir=${gameDir}`,
      `cpJars=${classpath.length}`,
      `args=${args.length}`,
      `mode=js`,
      "",
      ...args.map((a, i) => `${i}: ${a}`),
      "",
      "--- OUTPUT ---",
      "",
    ].join("\n"),
    "utf8",
  );

  const out = fs.openSync(logFile, "a");
  const child = spawn(java, args, {
    cwd: gameDir,
    detached: true,
    stdio: ["ignore", out, out],
    windowsHide: false,
    env: { ...process.env },
  });
  child.unref();

  const crash = await new Promise<string | null>((resolve) => {
    let done = false;
    const finish = (msg: string | null) => {
      if (done) return;
      done = true;
      resolve(msg);
    };
    child.once("error", (e) => finish(e.message));
    child.once("exit", (code, signal) => {
      if (code === 0 || code === null) finish(null);
      else finish(`код ${code}${signal ? `/${signal}` : ""}`);
    });
    // 12с — MC 26.2 + Fabric долго грузится до окна
    setTimeout(() => finish(null), 12_000);
  });

  if (crash) {
    await new Promise((r) => setTimeout(r, 400));
    const tail = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8").slice(-2500) : "";
    throw new Error(`Minecraft не запустился (${crash}).\nЛог: ${logFile}\n${tail}`);
  }
  on("Minecraft запущен", 1);
}

export async function searchModrinth(query: string, mc: string, loader: string): Promise<unknown[]> {
  const url = new URL("https://api.modrinth.com/v2/search");
  url.searchParams.set("query", query);
  url.searchParams.set("limit", "20");
  const facets: string[][] = [["project_type:mod"]];
  if (mc) facets.push([`versions:${mc}`]);
  if (loader && loader !== "vanilla" && loader !== "optifine") {
    facets.push([`categories:${loader === "forge_optifine" ? "forge" : loader}`]);
  }
  url.searchParams.set("facets", JSON.stringify(facets));
  const data = await getJson<{ hits?: unknown[] }>(url.toString());
  return data.hits ?? [];
}

export async function installModrinthVersion(projectId: string, inst: Instance, on: ProgressFn): Promise<string> {
  const loader = inst.loader === "forge_optifine" ? "forge" : inst.loader;
  const url = new URL(`https://api.modrinth.com/v2/project/${projectId}/version`);
  url.searchParams.set("game_versions", `["${inst.mcVersion}"]`);
  if (loader !== "vanilla" && loader !== "optifine") url.searchParams.set("loaders", `["${loader}"]`);
  const versions = await getJson<{ files?: { url: string; filename: string }[] }[]>(url.toString());
  const file = versions[0]?.files?.[0];
  if (!file) throw new Error("Нет совместимой версии мода.");
  on(`Скачивание ${file.filename}…`);
  await downloadFile(file.url, path.join(instDir(inst.id), "mods", file.filename));
  return file.filename;
}

export async function getNews(): Promise<{ title: string; type: string }[]> {
  try {
    const data = await getJson<{ entries?: { title?: string }[] }>("https://launchercontent.mojang.com/javaPatchNotes.json");
    return (data.entries ?? []).slice(0, 6).map((e) => ({ title: e.title || "Обновление", type: "patch" }));
  } catch {
    return [{ title: "Новости Mojang недоступны", type: "error" }];
  }
}

/** Скачивает скин и отдаёт data: URL — иначе WebGL/CORS в Electron показывает «развёртку PNG». */
export async function resolveSkinUrl(uuid: string): Promise<string | null> {
  try {
    const data = await getJson<{ properties?: { name: string; value: string }[] }>(
      `https://sessionserver.mojang.com/session/minecraft/profile/${uuid.replace(/-/g, "")}`,
    );
    const raw = data.properties?.find((p) => p.name === "textures")?.value;
    if (!raw) return null;
    const decoded = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as { textures?: { SKIN?: { url?: string } } };
    const url = decoded.textures?.SKIN?.url;
    if (!url) return null;
    try {
      const buf = await fetchBuffer(url);
      if (buf.length > 100) return `data:image/png;base64,${buf.toString("base64")}`;
    } catch {
      /* fallback remote url */
    }
    return url;
  } catch {
    return null;
  }
}


