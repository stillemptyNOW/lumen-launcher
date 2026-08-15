import { net } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const UA = "LumenLauncher/1.0.1";

function mirrors(url: string): string[] {
  const out = [url];
  const pairs: [string, string][] = [
    ["https://piston-meta.mojang.com", "https://launchermeta.mojang.com"],
    ["https://piston-meta.mojang.com", "https://bmclapi2.bangbang93.com"],
    ["https://piston-data.mojang.com", "https://bmclapi2.bangbang93.com"],
    ["https://launcher.mojang.com", "https://bmclapi2.bangbang93.com"],
    ["https://launchermeta.mojang.com", "https://bmclapi2.bangbang93.com"],
    ["https://libraries.minecraft.net", "https://bmclapi2.bangbang93.com/maven"],
    ["https://resources.download.minecraft.net", "https://bmclapi2.bangbang93.com/assets"],
    ["https://meta.fabricmc.net", "https://bmclapi2.bangbang93.com/fabric-meta"],
    ["https://maven.fabricmc.net", "https://bmclapi2.bangbang93.com/maven"],
    ["https://maven.minecraftforge.net", "https://bmclapi2.bangbang93.com/maven"],
    ["https://api.adoptium.net", "https://mirrors.cloud.tencent.com/adoptium"],
  ];
  for (const [from, to] of pairs) {
    if (url.startsWith(from)) out.push(to + url.slice(from.length));
  }
  return [...new Set(out)];
}

function explain(err: unknown): string {
  if (!err) return "unknown";
  const e = err as { message?: string; cause?: { message?: string; code?: string }; code?: string };
  return [e.message, e.code, e.cause?.message, e.cause?.code].filter(Boolean).join(" / ");
}

function nodeGet(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("http://") ? http : https;
    const req = lib.get(
      url,
      {
        headers: { "User-Agent": UA, Accept: "*/*" },
        timeout: 30_000,
      },
      (res) => {
        const code = res.statusCode ?? 0;
        if (code >= 300 && code < 400 && res.headers.location) {
          res.resume();
          const next = new URL(res.headers.location, url).toString();
          void nodeGet(next).then(resolve, reject);
          return;
        }
        if (code >= 400) {
          res.resume();
          reject(new Error(`HTTP ${code}`));
          return;
        }
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c as Buffer));
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
  });
}

async function electronGet(url: string): Promise<Buffer> {
  const res = await net.fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    bypassCustomProtocolHandlers: true,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  const list = mirrors(url);
  let last = "нет попыток";
  for (const u of list) {
    for (let i = 0; i < 3; i++) {
      try {
        try {
          return await electronGet(u);
        } catch (e1) {
          last = `electron: ${explain(e1)}`;
          return await nodeGet(u);
        }
      } catch (e2) {
        last = `${u} → ${explain(e2)}`;
        await new Promise((r) => setTimeout(r, 400 * (i + 1)));
      }
    }
  }
  throw new Error(`Не скачать файл.\n${last}`);
}

export async function getJson<T>(url: string): Promise<T> {
  const buf = await fetchBuffer(url);
  return JSON.parse(buf.toString("utf8")) as T;
}

export async function getText(url: string): Promise<string> {
  return (await fetchBuffer(url)).toString("utf8");
}

export async function downloadFile(url: string, dest: string, sha1?: string): Promise<void> {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    if (!sha1) return;
    const hash = crypto.createHash("sha1").update(fs.readFileSync(dest)).digest("hex");
    if (hash === sha1) return;
  }
  const buf = await fetchBuffer(url);
  if (sha1) {
    const hash = crypto.createHash("sha1").update(buf).digest("hex");
    if (hash !== sha1) throw new Error(`SHA-1 не совпал: ${path.basename(dest)}`);
  }
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, dest);
}

void pipeline;
