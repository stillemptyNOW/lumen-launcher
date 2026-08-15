import { BrowserWindow, clipboard, shell } from "electron";
import crypto from "node:crypto";
import http from "node:http";
import keytar from "keytar";
import type { Account } from "./store";
import { getAccounts, getActiveAccount, saveAccounts, setActiveUuid } from "./store";

const SERVICE = "LumenLauncher";

/**
 * Публичный client_id Prism Launcher (не наш Azure).
 * Официальный 00000000402b5328 из Electron-окна Microsoft отвечает 401 —
 * коды из встроенного WebView они больше не принимают.
 */
const CLIENT_ID = "c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb";
const SCOPE = "XboxLive.signin offline_access";
const AUTHORIZE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize";
const TOKEN = "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";
const DEVICE = "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode";
const UA = "LumenLauncher/1.0.1";

export function offlineUuid(name: string): string {
  const md5 = crypto.createHash("md5").update(`OfflinePlayer:${name}`, "utf8").digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function readBody(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    json = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const desc = String(json.error_description || json.error || json.Message || json.raw || text || res.statusText);
    throw new Error(`HTTP ${res.status} (${new URL(res.url).host}): ${desc}`);
  }
  return json;
}

async function postForm(url: string, body: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body),
  });
  return readBody(res);
}

async function postJson(url: string, body: unknown, extra: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extra,
    },
    body: JSON.stringify(body),
  });
  return readBody(res);
}

async function xboxAuthenticate(msAccess: string): Promise<{ token: string; uhs: string }> {
  const tickets = msAccess.startsWith("d=") ? [msAccess] : [`d=${msAccess}`, msAccess];
  let last = "";
  for (const ticket of tickets) {
    try {
      const xbl = await postJson(
        "https://user.auth.xboxlive.com/user/authenticate",
        {
          Properties: {
            AuthMethod: "RPS",
            SiteName: "user.auth.xboxlive.com",
            RpsTicket: ticket,
          },
          RelyingParty: "http://auth.xboxlive.com",
          TokenType: "JWT",
        },
        { "x-xbl-contract-version": "1" },
      );
      const token = String(xbl.Token ?? "");
      const uhs = String(((xbl.DisplayClaims as { xui?: { uhs?: string }[] })?.xui ?? [])[0]?.uhs ?? "");
      if (token && uhs) return { token, uhs };
      last = JSON.stringify(xbl).slice(0, 300);
    } catch (e) {
      last = e instanceof Error ? e.message : String(e);
    }
  }
  throw new Error(`Xbox Live отклонил вход. ${last}`);
}

async function xboxChain(msAccess: string): Promise<{ name: string; uuid: string; accessToken: string; skinUrl?: string }> {
  const { token: xblToken, uhs } = await xboxAuthenticate(msAccess);

  const xsts = await postJson(
    "https://xsts.auth.xboxlive.com/xsts/authorize",
    {
      Properties: { SandboxId: "RETAIL", UserTokens: [xblToken] },
      RelyingParty: "rp://api.minecraftservices.com/",
      TokenType: "JWT",
    },
    { "x-xbl-contract-version": "1" },
  );
  if (!xsts.Token) {
    const err = String(xsts.XErr ?? "");
    if (err === "2148916233") throw new Error("Нет профиля Xbox — создайте его на xbox.com.");
    if (err === "2148916238") throw new Error("Детский аккаунт: нужно подтверждение взрослого.");
    if (err === "2148916235") throw new Error("Xbox Live недоступен в регионе этой учётной записи.");
    throw new Error(`XSTS отклонил вход: ${JSON.stringify(xsts).slice(0, 400)}`);
  }

  const mc = await postJson("https://api.minecraftservices.com/authentication/login_with_xbox", {
    identityToken: `XBL3.0 x=${uhs};${String(xsts.Token)}`,
  });
  const access = String(mc.access_token ?? "");
  if (!access) throw new Error(`Minecraft Services не выдал токен: ${JSON.stringify(mc).slice(0, 400)}`);

  const storeRes = await fetch("https://api.minecraftservices.com/entitlements/mcstore", {
    headers: { "User-Agent": UA, Authorization: `Bearer ${access}` },
  });
  if (storeRes.ok) {
    const store = (await storeRes.json()) as { items?: { name?: string }[] };
    const items = store.items ?? [];
    const owns = items.some((it) => String(it.name ?? "").toLowerCase().includes("minecraft"));
    if (items.length && !owns) throw new Error("На аккаунте нет купленной Minecraft: Java Edition.");
  }

  const profRes = await fetch("https://api.minecraftservices.com/minecraft/profile", {
    headers: { "User-Agent": UA, Authorization: `Bearer ${access}` },
  });
  if (profRes.status === 404) {
    throw new Error("Профиль Java Edition не найден. Создайте ник в официальном лаунчере.");
  }
  if (!profRes.ok) {
    throw new Error(`Профиль Minecraft: HTTP ${profRes.status}`);
  }
  const prof = (await profRes.json()) as {
    name?: string;
    id?: string;
    skins?: { url?: string; state?: string }[];
  };
  if (!prof.name || !prof.id) throw new Error("Не удалось получить профиль Minecraft.");
  const skinUrl = (prof.skins ?? []).find((s) => s.state === "ACTIVE")?.url;
  return { name: prof.name, uuid: prof.id, accessToken: access, skinUrl };
}

async function persistMicrosoft(
  profile: Awaited<ReturnType<typeof xboxChain>>,
  refreshToken: string,
): Promise<Account> {
  const account: Account = {
    type: "microsoft",
    name: profile.name,
    uuid: profile.uuid.replace(/-/g, ""),
    accessToken: profile.accessToken,
    refreshToken,
    skinUrl: profile.skinUrl,
  };
  saveAccounts([account, ...getAccounts().filter((a) => a.uuid !== account.uuid)]);
  setActiveUuid(account.uuid);
  if (refreshToken) {
    try {
      await keytar.setPassword(SERVICE, account.uuid, refreshToken);
    } catch {
      /* ignore */
    }
  }
  return account;
}

async function finishWithMsToken(token: Record<string, unknown>): Promise<Account> {
  if (!token.access_token) {
    throw new Error(`Нет access_token: ${JSON.stringify(token).slice(0, 300)}`);
  }
  const profile = await xboxChain(String(token.access_token));
  return persistMicrosoft(profile, String(token.refresh_token ?? ""));
}

function pkce(): { verifier: string; challenge: string; state: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const state = crypto.randomBytes(16).toString("hex");
  return { verifier, challenge, state };
}

function listenLocal(port: number): Promise<{ server: http.Server; code: Promise<string> }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    const code = new Promise<string>((res, rej) => {
      const timer = setTimeout(() => rej(new Error("Время ожидания входа истекло (5 мин).")), 300_000);
      server.on("request", (req, resp) => {
        const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
        const err = url.searchParams.get("error_description") || url.searchParams.get("error");
        const value = url.searchParams.get("code");
        resp.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        if (err) {
          resp.end(`<html><body style="font-family:sans-serif;background:#1e1e1f;color:#fff;padding:40px"><h2>Ошибка входа</h2><p>${err}</p></body></html>`);
          clearTimeout(timer);
          rej(new Error(err));
          return;
        }
        if (!value) {
          resp.end("no code");
          return;
        }
        resp.end(
          `<html><body style="font-family:sans-serif;background:#1e1e1f;color:#fff;display:flex;align-items:center;justify-content:center;height:100vh"><div><h2>Вход выполнен</h2><p>Можно закрыть вкладку и вернуться в лаунчер.</p></div></body></html>`,
        );
        clearTimeout(timer);
        res(value);
      });
    });
    server.listen(port, "127.0.0.1", () => resolve({ server, code }));
    server.on("error", reject);
  });
}

async function loginDeviceCode(parent: BrowserWindow): Promise<Account> {
  const started = await postForm(DEVICE, {
    client_id: CLIENT_ID,
    scope: SCOPE,
  });
  const userCode = String(started.user_code ?? "");
  const deviceCode = String(started.device_code ?? "");
  const verify = String(started.verification_uri || started.verification_uri_complete || "https://www.microsoft.com/link");
  const interval = Math.max(3, Number(started.interval ?? 5));
  if (!userCode || !deviceCode) {
    throw new Error(`Device Code недоступен: ${JSON.stringify(started).slice(0, 240)}`);
  }

  try {
    clipboard.writeText(userCode);
  } catch {
    /* ignore */
  }
  void shell.openExternal(verify.includes(userCode) ? verify : `${verify}?otc=${encodeURIComponent(userCode)}`);

  const info = new BrowserWindow({
    parent,
    modal: true,
    width: 460,
    height: 320,
    title: "Вход Microsoft",
    autoHideMenuBar: true,
    backgroundColor: "#1E1E1F",
    minimizable: false,
  });
  const html = `<!doctype html><html><body style="margin:0;background:#1E1E1F;color:#fff;font-family:Segoe UI,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
    <div style="text-align:center;padding:24px">
      <div style="color:#A0A0A0;margin-bottom:8px">Откройте</div>
      <div style="font-size:18px;margin-bottom:16px">microsoft.com/link</div>
      <div style="color:#A0A0A0;margin-bottom:8px">и введите код</div>
      <div style="font-size:36px;letter-spacing:6px;font-weight:700;color:#4C9A2A">${userCode}</div>
      <div style="color:#A0A0A0;margin-top:16px;font-size:13px">Код скопирован в буфер. Не закрывайте это окно.</div>
    </div></body></html>`;
  await info.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  let cancelled = false;
  info.on("closed", () => {
    cancelled = true;
  });

  const deadline = Date.now() + Number(started.expires_in ?? 900) * 1000;
  try {
    while (Date.now() < deadline) {
      if (cancelled) throw new Error("Вход отменён.");
      await new Promise((r) => setTimeout(r, interval * 1000));
      if (cancelled) throw new Error("Вход отменён.");
      try {
        const token = await postForm(TOKEN, {
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: CLIENT_ID,
          device_code: deviceCode,
        });
        if (!info.isDestroyed()) info.close();
        return await finishWithMsToken(token);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("authorization_pending") || msg.includes("slow_down") || msg.includes("AADSTS70016")) {
          continue;
        }
        throw e;
      }
    }
    throw new Error("Время ожидания кода истекло.");
  } finally {
    if (!info.isDestroyed()) info.close();
  }
}

async function loginSystemBrowser(): Promise<Account> {
  const { verifier, challenge, state } = pkce();
  const port = 28562;
  const redirect = `http://127.0.0.1:${port}`;
  const { server, code } = await listenLocal(port);
  const url = new URL(AUTHORIZE);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirect);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  try {
    await shell.openExternal(url.toString());
    const authCode = await code;
    const token = await postForm(TOKEN, {
      client_id: CLIENT_ID,
      scope: SCOPE,
      code: authCode,
      redirect_uri: redirect,
      grant_type: "authorization_code",
      code_verifier: verifier,
    });
    return await finishWithMsToken(token);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

export async function loginWithBrowser(parent: BrowserWindow): Promise<Account> {
  try {
    return await loginDeviceCode(parent);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("Вход отменён")) throw e;
    try {
      return await loginSystemBrowser();
    } catch (e2) {
      const a = e instanceof Error ? e.message : String(e);
      const b = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`Вход Microsoft не удался.\n1) ${a}\n2) ${b}`);
    }
  }
}

export async function refreshAccount(account: Account): Promise<Account> {
  if (account.type !== "microsoft") return account;
  let refresh = account.refreshToken || "";
  try {
    refresh = (await keytar.getPassword(SERVICE, account.uuid)) || refresh;
  } catch {
    /* ignore */
  }
  if (!refresh) return account;
  const token = await postForm(TOKEN, {
    client_id: CLIENT_ID,
    scope: SCOPE,
    refresh_token: refresh,
    grant_type: "refresh_token",
  });
  if (!token.access_token) return account;
  return finishWithMsToken(token);
}

export async function createOffline(name: string): Promise<Account> {
  const nick = name.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(nick)) {
    throw new Error("Ник: 3–16 символов, латиница, цифры и _");
  }
  const account: Account = {
    type: "offline",
    name: nick,
    uuid: offlineUuid(nick).replace(/-/g, ""),
    accessToken: "0",
  };
  saveAccounts([account, ...getAccounts().filter((a) => a.uuid !== account.uuid)]);
  setActiveUuid(account.uuid);
  return account;
}

export function logout(uuid?: string): void {
  const id = uuid || getActiveAccount()?.uuid;
  if (!id) return;
  saveAccounts(getAccounts().filter((a) => a.uuid !== id));
  try {
    void keytar.deletePassword(SERVICE, id);
  } catch {
    /* ignore */
  }
  setActiveUuid(getAccounts()[0]?.uuid ?? "");
}

export function publicAccount(account: Account | null): Omit<Account, "accessToken" | "refreshToken"> | null {
  if (!account) return null;
  const { accessToken: _a, refreshToken: _r, ...rest } = account;
  return rest;
}
