import { test } from "node:test";
import assert from "node:assert/strict";
import { startMockServer, sendJson, type CapturedRequest } from "./helpers/mock-server";
import { MemosClient, MemosError, type Memo } from "../src/memos/client";

const TOKEN = "memos_pat_testtoken000000000000000000";

function memo(over: Partial<Memo> = {}): Memo {
  return {
    name: "memos/abc123",
    content: "hello #work",
    createTime: "2026-11-14T09:31:37Z",
    visibility: "PRIVATE",
    ...over,
  };
}

test("listMemos calls GET /api/memos with pageSize and a Bearer token", async () => {
  const server = await startMockServer((_req, res) => sendJson(res, 200, { memos: [memo()] }));
  try {
    const client = new MemosClient(server.url, TOKEN);
    const page = await client.listMemos({ pageSize: 20 });
    assert.equal(page.memos.length, 1);
    assert.equal(page.memos[0].content, "hello #work");
    const req = server.requests[0];
    assert.equal(req.method, "GET");
    assert.equal(req.url, "/api/memos?pageSize=20");
    assert.equal(req.headers.authorization, `Bearer ${TOKEN}`);
  } finally {
    await server.close();
  }
});

test("listAllMemos follows nextPageToken until exhausted", async () => {
  const server = await startMockServer((req, res) => {
    if (!req.url.includes("pageToken")) {
      sendJson(res, 200, { memos: [memo({ name: "memos/one" })], nextPageToken: "tok2" });
    } else {
      assert.match(req.url, /pageToken=tok2/);
      sendJson(res, 200, { memos: [memo({ name: "memos/two" })] });
    }
  });
  try {
    const all = await new MemosClient(server.url, TOKEN).listAllMemos({ pageSize: 1 });
    assert.deepEqual(all.map((m) => m.name), ["memos/one", "memos/two"]);
    assert.equal(server.requests.length, 2);
  } finally {
    await server.close();
  }
});

test("createMemo posts content and PRIVATE visibility to /api/memos", async () => {
  const server = await startMockServer((_req, res) => sendJson(res, 200, memo()));
  try {
    const created = await new MemosClient(server.url, TOKEN).createMemo("new note");
    assert.equal(created.name, "memos/abc123");
    const req = server.requests[0];
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/api/memos");
    assert.deepEqual(req.body, { content: "new note", visibility: "PRIVATE" });
  } finally {
    await server.close();
  }
});

test("updateMemo patches /api/memos/{id} with updateMask=content", async () => {
  const server = await startMockServer((_req, res) => sendJson(res, 200, memo({ content: "edited" })));
  try {
    await new MemosClient(server.url, TOKEN).updateMemo("memos/abc123", "edited");
    const req = server.requests[0];
    assert.equal(req.method, "PATCH");
    assert.equal(req.url, "/api/memos/abc123?updateMask=content");
    assert.deepEqual(req.body, { content: "edited" });
  } finally {
    await server.close();
  }
});

test("deleteMemo sends DELETE to /api/memos/{id}", async () => {
  const server = await startMockServer((_req, res) => sendJson(res, 200, {}));
  try {
    await new MemosClient(server.url, TOKEN).deleteMemo("memos/abc123");
    assert.equal(server.requests[0].method, "DELETE");
    assert.equal(server.requests[0].url, "/api/memos/abc123");
  } finally {
    await server.close();
  }
});

test("getProfile reads /api/instance/profile and parses the version", async () => {
  const server = await startMockServer((_req, res) =>
    sendJson(res, 200, { version: "26.11.0", accessMode: "INSTANCE_ACCESS_MODE_PRIVATE", needsSetup: false }),
  );
  try {
    const profile = await new MemosClient(server.url, TOKEN).getProfile();
    assert.equal(profile.version, "26.11.0");
    assert.equal(server.requests[0].url, "/api/instance/profile");
  } finally {
    await server.close();
  }
});

test("a 401 becomes an auth error with an actionable message", async () => {
  const server = await startMockServer((_req, res) => sendJson(res, 401, { code: 16, message: "authentication required" }));
  try {
    await assert.rejects(
      () => new MemosClient(server.url, TOKEN).listMemos(),
      (e: unknown) => {
        assert.ok(e instanceof MemosError);
        assert.equal(e.kind, "auth");
        assert.match(e.message, /token/i);
        return true;
      },
    );
  } finally {
    await server.close();
  }
});

test("a 410 from a legacy v1 endpoint becomes a version-mismatch error", async () => {
  const server = await startMockServer((_req, res) =>
    sendJson(res, 410, { code: 12, message: "API v1 has been removed" }),
  );
  try {
    await assert.rejects(
      () => new MemosClient(server.url, TOKEN).listMemos(),
      (e: unknown) => {
        assert.ok(e instanceof MemosError);
        assert.equal(e.kind, "legacy-api");
        assert.match(e.message, /26\.10/);
        return true;
      },
    );
  } finally {
    await server.close();
  }
});

test("a connection refusal becomes a network error", async () => {
  const client = new MemosClient("http://127.0.0.1:1", TOKEN, { timeoutMs: 500 });
  await assert.rejects(
    () => client.listMemos(),
    (e: unknown) => {
      assert.ok(e instanceof MemosError);
      assert.equal(e.kind, "network");
      return true;
    },
  );
});

test("checkConnection reports an OK version and a working token", async () => {
  const server = await startMockServer((req: CapturedRequest, res) => {
    if (req.url === "/api/instance/profile") {
      sendJson(res, 200, { version: "26.11.0" });
    } else {
      sendJson(res, 200, { memos: [] });
    }
  });
  try {
    const report = await new MemosClient(server.url, TOKEN).checkConnection();
    assert.equal(report.ok, true);
    assert.equal(report.version, "26.11.0");
  } finally {
    await server.close();
  }
});

test("checkConnection rejects a pre-26.10 server with a clear message", async () => {
  const server = await startMockServer((_req, res) => sendJson(res, 200, { version: "0.31.0" }));
  try {
    const report = await new MemosClient(server.url, TOKEN).checkConnection();
    assert.equal(report.ok, false);
    assert.match(report.message, /26\.10/);
  } finally {
    await server.close();
  }
});
