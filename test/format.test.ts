import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractTags,
  stripTags,
  titleFromContent,
  formatTimestamp,
  buildPreviewMarkdown,
  memoIdFromName,
  type PreviewAttachment,
} from "../src/ui/format";

test("extractTags finds ascii and Chinese hashtags", () => {
  assert.deepEqual(extractTags("买菜 #生活 #工作/项目 done"), ["生活", "工作/项目"]);
});

test("extractTags dedupes and ignores a bare hash", () => {
  assert.deepEqual(extractTags("#a #a #b #"), ["a", "b"]);
});

test("stripTags removes hashtags but keeps the sentence", () => {
  assert.equal(stripTags("今天 #生活 买菜 #生活"), "今天 买菜");
});

test("titleFromContent uses first non-empty line, strips tags and truncates", () => {
  assert.equal(titleFromContent("#工作\n第二行", 40), "第二行");
  assert.equal(titleFromContent("一条很长的备忘内容用于测试截断", 5), "一条很长的…");
});

test("titleFromContent falls back when content is blank", () => {
  assert.equal(titleFromContent("   \n  ", 40), "(empty memo)");
});

test("formatTimestamp renders an ISO timestamp as a local date-time", () => {
  const s = formatTimestamp("2026-11-14T09:31:37Z");
  assert.match(s, /2026/);
  assert.match(s, /11/);
});

test("formatTimestamp returns empty for missing or invalid input", () => {
  assert.equal(formatTimestamp(undefined), "");
  assert.equal(formatTimestamp("not-a-date"), "");
});

test("buildPreviewMarkdown contains content and attachment names", () => {
  const attachments: PreviewAttachment[] = [
    { filename: "photo.png", type: "image/png", externalLink: "https://x/photo.png" },
  ];
  const md = buildPreviewMarkdown("hello #work", attachments);
  assert.match(md, /hello/);
  assert.match(md, /photo\.png/);
  assert.match(md, /#work/);
});

test("memoIdFromName extracts the id from a memos/{id} resource name", () => {
  assert.equal(memoIdFromName("memos/abc123"), "abc123");
  assert.equal(memoIdFromName("abc123"), "abc123");
  assert.equal(memoIdFromName(""), "");
});
