import { test } from "node:test";
import assert from "node:assert/strict";
import { startMockServer, sendJson } from "./helpers/mock-server";
import { MemosClient, type Memo } from "../src/memos/client";

const TOKEN = "memos_pat_testtoken000000000000000000";

function memo(content: string, name = "memos/x"): Memo {
  return { name, content, createTime: "2026-11-14T09:31:37Z" };
}

test("searchMemos uses the server-side CEL content.contains filter", async () => {
  const server = await startMockServer((req, res) => {
    assert.match(decodeURIComponent(req.url), /content\.contains\("买菜"\)/);
    sendJson(res, 200, { memos: [memo("今天买菜")] });
  });
  try {
    const found = await new MemosClient(server.url, TOKEN).searchMemos("买菜");
    assert.deepEqual(found.map((m) => m.content), ["今天买菜"]);
  } finally {
    await server.close();
  }
});

test("searchMemos escapes quotes in the CEL filter", async () => {
  const server = await startMockServer((req, res) => {
    const url = decodeURIComponent(req.url);
    assert.ok(url.includes('content.contains("a\\"b")'), `unexpected url: ${url}`);
    sendJson(res, 200, { memos: [] });
  });
  try {
    await new MemosClient(server.url, TOKEN).searchMemos('a"b');
  } finally {
    await server.close();
  }
});

test("searchMemos falls back to local filtering when the server rejects the filter", async () => {
  const server = await startMockServer((req, res) => {
    if (req.url.includes("filter=")) {
      sendJson(res, 400, { code: 3, message: "invalid filter" });
    } else {
      sendJson(res, 200, { memos: [memo("今天买菜"), memo(" unrelated note ")] });
    }
  });
  try {
    const found = await new MemosClient(server.url, TOKEN).searchMemos("买菜", { pageSize: 50 });
    assert.deepEqual(found.map((m) => m.content), ["今天买菜"]);
    assert.equal(server.requests.length, 2);
  } finally {
    await server.close();
  }
});
