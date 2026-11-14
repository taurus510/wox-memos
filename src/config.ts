/**
 * Configuration parsing for the Wox Memos plugin.
 *
 * Pure functions on purpose: every rule here is unit-testable without Wox or a
 * network. Keeping host normalisation here also fixes the most common user
 * mistake — pasting an `/api/v1` URL copied from an older Memos guide.
 */

export interface RawSettings {
  host?: string;
  token?: string;
  timeoutMs?: string;
}

export interface Config {
  host: string;
  token: string;
  timeoutMs: number;
  warning?: string;
}

export type TokenCheck = { ok: true; warning?: string } | { ok: false; error: string };

export const DEFAULT_TIMEOUT_MS = 10_000;

/** Turn whatever the user typed into a bare origin: scheme + host[:port], no path. */
export function normalizeHost(input: string): string {
  const raw = (input ?? "").trim();
  if (!raw) throw new Error("Server URL is empty");

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Server URL must be an http(s) URL, e.g. http://192.168.0.14:5230");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use http or https");
  }

  // Older Memos guides (<= 0.31) tell people to append /api/v1. The plugin
  // builds its own paths, so silently drop that suffix instead of producing
  // /api/v1/api/memos and failing with a confusing 404.
  let path = url.pathname.replace(/\/+$/, "");
  path = path.replace(/\/api\/v1$/i, "").replace(/\/api$/i, "");
  url.pathname = path;
  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/+$/, "");
}

/** PATs are long-lived and start with `memos_pat_`. Session cookies are not PATs. */
export function validateToken(token: string): TokenCheck {
  const t = (token ?? "").trim();
  if (!t) {
    return {
      ok: false,
      error: "Access token is empty. Create a personal access token in Memos → Settings → Access Tokens.",
    };
  }
  if (!t.startsWith("memos_pat_")) {
    return {
      ok: true,
      warning: "Token does not start with memos_pat_ — make sure it is a personal access token, not a browser session cookie.",
    };
  }
  return { ok: true };
}

/**
 * The `/api` REST surface this plugin targets was introduced in Memos 26.10.
 * 26.9 and all 0.3x releases only expose `/api/v1`, which returns 410 here.
 */
export function isSupportedVersion(version: string): boolean {
  const m = /^(\d+)\.(\d+)(?:\.(\d+))?/.exec((version ?? "").trim());
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  if (major < 26) return false;
  if (major === 26 && minor < 10) return false;
  return true;
}

export function readConfig(raw: RawSettings): Config {
  const hostRaw = (raw.host ?? "").trim();
  if (!hostRaw) {
    throw new Error("Memos server URL is not configured. Set it in Wox plugin settings.");
  }
  const tokenRaw = (raw.token ?? "").trim();
  if (!tokenRaw) {
    throw new Error("Access token is not configured. Create one in Memos → Settings → Access Tokens.");
  }

  const host = normalizeHost(hostRaw);
  const tokenCheck = validateToken(tokenRaw);
  if (!tokenCheck.ok) throw new Error(tokenCheck.error);

  let timeoutMs = DEFAULT_TIMEOUT_MS;
  const timeoutRaw = (raw.timeoutMs ?? "").trim();
  if (timeoutRaw) {
    const n = Number(timeoutRaw);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error("Timeout must be a positive number of milliseconds");
    }
    timeoutMs = Math.floor(n);
  }

  return { host, token: tokenRaw, timeoutMs, warning: tokenCheck.warning };
}
