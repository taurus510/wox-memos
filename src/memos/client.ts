/**
 * HTTP client for Memos 26.x `/api` REST.
 *
 * Deliberately independent of the Wox SDK so it can be exercised against a real
 * loopback HTTP server in tests. Only Bearer PAT auth is used — no cookie
 * fallback, no session handling. All failures are normalised into MemosError so
 * the UI layer can show one actionable line instead of an axios stack trace.
 */
import axios, { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import { isSupportedVersion } from "../config";
import { memoIdFromName } from "../ui/format";

export type MemosErrorKind = "auth" | "network" | "http" | "legacy-api" | "config";

export class MemosError extends Error {
  constructor(
    public readonly kind: MemosErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "MemosError";
  }
}

export interface Attachment {
  name?: string;
  filename?: string;
  type?: string;
  externalLink?: string;
  size?: string | number;
}

export interface Memo {
  name: string;
  content: string;
  createTime?: string;
  updateTime?: string;
  visibility?: string;
  state?: string;
  pinned?: boolean;
  tags?: string[];
  attachments?: Attachment[];
  snippet?: string;
}

export interface InstanceProfile {
  version: string;
  accessMode?: string;
  needsSetup?: boolean;
  instanceUrl?: string;
  demo?: boolean;
}

export interface ListMemosResult {
  memos: Memo[];
  nextPageToken?: string;
}

export interface ConnectionReport {
  ok: boolean;
  version?: string;
  message: string;
}

export type Visibility = "PRIVATE" | "PROTECTED" | "PUBLIC";

interface ServerErrorBody {
  code?: number;
  message?: string;
}

export class MemosClient {
  private readonly http: AxiosInstance;

  constructor(host: string, token: string, opts: { timeoutMs?: number } = {}) {
    const baseURL = (host ?? "").replace(/\/+$/, "");
    if (!baseURL) throw new MemosError("config", "Server URL is empty");
    if (!token) throw new MemosError("config", "Access token is empty");

    this.http = axios.create({
      baseURL,
      timeout: opts.timeoutMs ?? 10_000,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });
  }

  /** Unauthenticated on a private instance too — used for version probe. */
  async getProfile(): Promise<InstanceProfile> {
    return this.request<InstanceProfile>("GET", "/api/instance/profile");
  }

  async listMemos(
    opts: { pageSize?: number; pageToken?: string; filter?: string } = {},
  ): Promise<ListMemosResult> {
    const params: Record<string, string | number> = { pageSize: opts.pageSize ?? 50 };
    if (opts.pageToken) params.pageToken = opts.pageToken;
    if (opts.filter) params.filter = opts.filter;

    const data = await this.request<{ memos?: Memo[]; nextPageToken?: string }>(
      "GET",
      "/api/memos",
      { params },
    );
    return { memos: data?.memos ?? [], nextPageToken: data?.nextPageToken || undefined };
  }

  /** Follow the opaque page token with a hard cap so a bad server cannot loop forever. */
  async listAllMemos(opts: { pageSize?: number; maxPages?: number } = {}): Promise<Memo[]> {
    const maxPages = opts.maxPages ?? 10;
    const all: Memo[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page += 1) {
      const result: ListMemosResult = await this.listMemos({ pageSize: opts.pageSize ?? 100, pageToken });
      all.push(...result.memos);
      if (!result.nextPageToken) break;
      pageToken = result.nextPageToken;
    }
    return all;
  }

  /**
   * Server-side CEL filter (`content.contains`) avoids downloading the whole
   * note history. Some deployments reject the filter expression, so fall back
   * to a local scan rather than failing the whole query.
   */
  async searchMemos(query: string, opts: { pageSize?: number } = {}): Promise<Memo[]> {
    const q = (query ?? "").trim();
    if (!q) return this.listAllMemos(opts);

    const escaped = q.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const needle = q.toLowerCase();
    const matches = (m: Memo) => (m.content ?? "").toLowerCase().includes(needle);

    try {
      const result = await this.listMemos({
        pageSize: opts.pageSize ?? 50,
        filter: `content.contains("${escaped}")`,
      });
      return result.memos.filter(matches);
    } catch (e) {
      if (e instanceof MemosError && e.kind === "http" && (e.status === 400 || e.status === 422)) {
        const all = await this.listAllMemos(opts);
        return all.filter(matches);
      }
      throw e;
    }
  }

  async createMemo(content: string, visibility: Visibility = "PRIVATE"): Promise<Memo> {
    return this.request<Memo>("POST", "/api/memos", {
      data: { content, visibility },
    });
  }

  async updateMemo(name: string, content: string): Promise<Memo> {
    const id = memoIdFromName(name);
    if (!id) throw new MemosError("config", "Cannot update a memo without a resource name");
    return this.request<Memo>("PATCH", `/api/memos/${encodeURIComponent(id)}`, {
      params: { updateMask: "content" },
      data: { content },
    });
  }

  async deleteMemo(name: string): Promise<void> {
    const id = memoIdFromName(name);
    if (!id) throw new MemosError("config", "Cannot delete a memo without a resource name");
    await this.request<unknown>("DELETE", `/api/memos/${encodeURIComponent(id)}`);
  }

  /**
   * One-shot diagnostic: is this a server we support, and does the token work?
   * Returns a report instead of throwing so the plugin can render it directly.
   */
  async checkConnection(): Promise<ConnectionReport> {
    let profile: InstanceProfile;
    try {
      profile = await this.getProfile();
    } catch (e) {
      return { ok: false, message: `Cannot reach the server: ${(e as Error).message}` };
    }

    if (!isSupportedVersion(profile.version)) {
      return {
        ok: false,
        version: profile.version,
        message: `Memos ${profile.version} is too old. This plugin needs 26.10+ (the /api REST API).`,
      };
    }

    try {
      await this.listMemos({ pageSize: 1 });
    } catch (e) {
      return { ok: false, version: profile.version, message: (e as Error).message };
    }

    return { ok: true, version: profile.version, message: `Connected to Memos ${profile.version}` };
  }

  private async request<T>(method: string, url: string, extra: AxiosRequestConfig = {}): Promise<T> {
    try {
      const response = await this.http.request<T>({ method, url, ...extra });
      return response.data;
    } catch (e) {
      throw toMemosError(e);
    }
  }
}

function toMemosError(e: unknown): MemosError {
  const ax = e as AxiosError<ServerErrorBody>;
  if (ax.response) {
    const status = ax.response.status;
    const serverMessage = ax.response.data?.message ?? "";
    if (status === 401 || status === 403) {
      return new MemosError(
        "auth",
        "Access token rejected (HTTP 401). Create a fresh personal access token in Memos → Settings → Access Tokens and paste the full memos_pat_… value.",
        status,
      );
    }
    if (status === 410) {
      return new MemosError(
        "legacy-api",
        "Server returned HTTP 410 for /api. This plugin requires Memos 26.10 or newer; 0.3x releases only expose /api/v1.",
        status,
      );
    }
    return new MemosError(
      "http",
      `Memos returned HTTP ${status}${serverMessage ? `: ${serverMessage}` : ""}`,
      status,
    );
  }
  if (ax.code === "ECONNABORTED" || ax.code === "ETIMEDOUT") {
    return new MemosError("network", "Request timed out. Check the server URL and network reachability.");
  }
  return new MemosError("network", `Cannot reach the Memos server: ${ax.message ?? String(e)}`);
}
