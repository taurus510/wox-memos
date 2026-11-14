import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMemoResults, buildInfoResult, buildCreateResult, LABELS, type MemoActionHandlers } from "../src/ui/results";
import type { Memo } from "../src/memos/client";

function memo(over: Partial<Memo> = {}): Memo {
  return {
    name: "memos/abc123",
    content: "买菜 #生活\n第二行内容",
    createTime: "2026-11-14T09:31:37Z",
    visibility: "PRIVATE",
    attachments: [],
    ...over,
  };
}

function handlers(): MemoActionHandlers & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async openInBrowser(m) {
      calls.push(`open:${m.name}`);
    },
    async copy(text) {
      calls.push(`copy:${text}`);
    },
    async update(m, content) {
      calls.push(`update:${m.name}:${content}`);
    },
    async remove(m) {
      calls.push(`remove:${m.name}`);
    },
  };
}

test("buildMemoResults uses the first content line as the title", () => {
  const [result] = buildMemoResults([memo()], handlers());
  assert.equal(result.Title, "买菜");
  assert.equal(result.Id, "memos/abc123");
});

test("buildMemoResults keeps the full memo text and tags in the preview", () => {
  const [result] = buildMemoResults([memo()], handlers());
  assert.equal(result.Preview?.PreviewType, "markdown");
  assert.match(result.Preview?.PreviewData ?? "", /买菜 #生活/);
  assert.match(result.Preview?.PreviewData ?? "", /第二行内容/);
});

test("buildMemoResults exposes four actions with open as the default", () => {
  const [result] = buildMemoResults([memo()], handlers());
  const names = (result.Actions ?? []).map((a) => a.Name);
  assert.equal(names.length, 4);
  assert.equal((result.Actions ?? []).filter((a) => a.IsDefault).length, 1);
  assert.equal((result.Actions ?? [])[0].IsDefault, true);
});

test("triggering the copy action really calls the handler with the memo text", async () => {
  const h = handlers();
  const [result] = buildMemoResults([memo()], h);
  const copy = (result.Actions ?? []).find((a) => a.Name === LABELS.copy);
  assert.ok(copy && copy.Type !== "form");
  await copy.Action({} as never, { ContextData: {}, ResultId: "", ResultActionId: "" } as never);
  assert.deepEqual(h.calls, ["copy:买菜 #生活\n第二行内容"]);
});

test("submitting the edit form updates only when the content changed", async () => {
  const h = handlers();
  const [result] = buildMemoResults([memo()], h);
  const edit = (result.Actions ?? []).find((a) => a.Type === "form");
  assert.ok(edit && edit.Type === "form");
  await edit.OnSubmit({} as never, {
    Values: { content: "买菜 #生活\n第二行内容" },
    ContextData: {},
    ResultId: "",
    ResultActionId: "",
  } as never);
  assert.deepEqual(h.calls, []);
  await edit.OnSubmit({} as never, {
    Values: { content: "改过了" },
    ContextData: {},
    ResultId: "",
    ResultActionId: "",
  } as never);
  assert.deepEqual(h.calls, ["update:memos/abc123:改过了"]);
});

test("buildInfoResult renders a failure with its message as subtitle", () => {
  const result = buildInfoResult("Could not load memos", "HTTP 401: token rejected");
  assert.equal(result.Title, "Could not load memos");
  assert.equal(result.SubTitle, "HTTP 401: token rejected");
  assert.deepEqual(result.Actions, []);
});

test("buildCreateResult invokes create with the typed text on the default action", async () => {
  const created: string[] = [];
  const result = buildCreateResult("buy milk", async (text) => {
    created.push(text);
  });
  assert.equal(result.Title, "buy milk");
  const action = (result.Actions ?? [])[0];
  assert.equal(action.IsDefault, true);
  assert.ok(action.Type !== "form");
  await action.Action({} as never, { ContextData: {}, ResultId: "", ResultActionId: "" } as never);
  assert.deepEqual(created, ["buy milk"]);
});
