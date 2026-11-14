/**
 * Wox 2 entry point — thin glue only.
 *
 * All Memos logic lives in ./memos (HTTP) and ./ui (result mapping), both of
 * which are unit-tested without a Wox host. This file owns Wox lifecycle,
 * settings, and action side effects (notifications, refresh, browser).
 */
import { spawn } from "node:child_process";
import type {
  Context,
  Plugin,
  PluginInitParams,
  PublicAPI,
  Query,
  Result,
} from "@wox-launcher/wox-plugin";
import { readConfig, type Config } from "./config";
import { MemosClient, type Memo } from "./memos/client";
import {
  buildCreateResult,
  buildInfoResult,
  buildMemoResults,
  type MemoActionHandlers,
} from "./ui/results";

let api: PublicAPI;
let client: MemosClient | null = null;
let config: Config | null = null;
let configError = "";

/** GetSetting may throw for an unset key; treat that as an empty string. */
async function setting(ctx: Context, key: string): Promise<string> {
  try {
    return (await api.GetSetting(ctx, key)) ?? "";
  } catch {
    return "";
  }
}

async function tr(ctx: Context, key: string, fallback: string): Promise<string> {
  try {
    const value = await api.GetTranslation(ctx, key);
    return value && value !== key && !value.startsWith("i18n:") ? value : fallback;
  } catch {
    return fallback;
  }
}

/** Rebuild the HTTP client whenever settings change (or on first load). */
async function reload(ctx: Context): Promise<void> {
  try {
    const cfg = readConfig({
      host: await setting(ctx, "host"),
      token: await setting(ctx, "token"),
      timeoutMs: await setting(ctx, "timeoutMs"),
    });
    config = cfg;
    client = new MemosClient(cfg.host, cfg.token, { timeoutMs: cfg.timeoutMs });
    configError = "";
    if (cfg.warning) await api.Log(ctx, "Warning", cfg.warning);
  } catch (e) {
    config = null;
    client = null;
    configError = (e as Error).message;
    await api.Log(ctx, "Error", `Memos config: ${configError}`);
  }
}

/** Open a URL with the OS default browser — no third-party dependency. */
function openUrl(url: string): void {
  const opts = { detached: true, stdio: "ignore" as const };
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], opts).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], opts).unref();
    } else {
      spawn("xdg-open", [url], opts).unref();
    }
  } catch {
    // Best effort: Wox still shows the memo, just no browser window.
  }
}

function memoUrl(host: string, memo: Memo): string {
  return `${host}/${memo.name}`;
}

const refresh = (ctx: Context, preserve: boolean): Promise<void> =>
  api.RefreshQuery(ctx, { PreserveSelectedIndex: preserve }).catch(() => undefined);

const notify = (ctx: Context, message: string): Promise<void> =>
  api.Notify(ctx, message).catch(() => undefined);

function actionHandlers(ctx: Context, cfg: Config): MemoActionHandlers {
  return {
    async openInBrowser(memo) {
      openUrl(memoUrl(cfg.host, memo));
    },
    async copy(text) {
      await api.Copy(ctx, { type: "text", text });
    },
    async update(memo, content) {
      if (!client) return;
      try {
        await client.updateMemo(memo.name, content);
        await notify(ctx, await tr(ctx, "notify_updated", "Memo updated"));
        await refresh(ctx, true);
      } catch (e) {
        await notify(ctx, (e as Error).message);
        await api.Log(ctx, "Error", `Update failed: ${(e as Error).message}`);
      }
    },
    async remove(memo) {
      if (!client) return;
      try {
        await client.deleteMemo(memo.name);
        await notify(ctx, await tr(ctx, "notify_deleted", "Memo deleted"));
        await refresh(ctx, true);
      } catch (e) {
        await notify(ctx, (e as Error).message);
        await api.Log(ctx, "Error", `Delete failed: ${(e as Error).message}`);
      }
    },
  };
}

async function checkResults(c: MemosClient): Promise<Result[]> {
  const report = await c.checkConnection();
  return [
    buildInfoResult(report.ok ? "i18n:check_ok" : "i18n:check_failed", report.message),
  ];
}

export const plugin: Plugin = {
  init: async (ctx: Context, params: PluginInitParams) => {
    api = params.API;
    await reload(ctx);
    await api.OnSettingChanged(ctx, (_settingCtx: Context, key: string) => {
      if (key === "host" || key === "token" || key === "timeoutMs") {
        void reload(ctx);
      }
    });
    await api.OnUnload(ctx, async () => {
      client = null;
      config = null;
    });
  },

  query: async (ctx: Context, query: Query): Promise<Result[]> => {
    if (!client || !config) await reload(ctx);
    if (!client || !config) {
      return [
        buildInfoResult(
          "i18n:state_unconfigured",
          configError || "i18n:state_unconfigured_help",
        ),
      ];
    }

    const activeClient = client;
    const cfg = config;
    const handlers = actionHandlers(ctx, cfg);
    const search = (query.Search ?? "").trim();
    const command = (query.Command ?? "").trim().toLowerCase();

    const create = (text: string): Promise<void> =>
      activeClient
        .createMemo(text)
        .then(async () => {
          await notify(ctx, await tr(ctx, "notify_created", "Memo created"));
          await refresh(ctx, false);
        })
        .catch(async (e: Error) => {
          await notify(ctx, e.message);
          await api.Log(ctx, "Error", `Create failed: ${e.message}`);
        });

    try {
      if (command === "check") return await checkResults(activeClient);

      if (command === "create" || command === "new") {
        if (!search) {
          return [buildInfoResult("i18n:state_create_hint", "i18n:state_create_help")];
        }
        return [buildCreateResult(search, create)];
      }

      if (!search) {
        const page = await activeClient.listMemos({ pageSize: 30 });
        if (page.memos.length === 0) {
          return [buildInfoResult("i18n:state_no_memos", "i18n:state_no_memos_help")];
        }
        return buildMemoResults(page.memos, handlers);
      }

      const found = await activeClient.searchMemos(search, { pageSize: 50 });
      if (found.length > 0) return buildMemoResults(found, handlers);
      return [buildCreateResult(search, create)];
    } catch (e) {
      const message = (e as Error).message;
      await api.Log(ctx, "Error", `Query failed: ${message}`);
      return [buildInfoResult("i18n:state_failed", message)];
    }
  },
};
