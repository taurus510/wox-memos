import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeHost,
  validateToken,
  readConfig,
  isSupportedVersion,
  type RawSettings,
} from "../src/config";

test("normalizeHost strips a trailing slash", () => {
  assert.equal(normalizeHost("http://192.168.0.14:5230/"), "http://192.168.0.14:5230");
});

test("normalizeHost trims surrounding whitespace", () => {
  assert.equal(normalizeHost("  https://memos.example.com  "), "https://memos.example.com");
});

test("normalizeHost removes an accidental /api or /api/v1 suffix", () => {
  assert.equal(normalizeHost("http://host:5230/api/v1/"), "http://host:5230");
  assert.equal(normalizeHost("http://host:5230/api/"), "http://host:5230");
});

test("normalizeHost rejects non-http URLs and garbage", () => {
  assert.throws(() => normalizeHost("ftp://host:5230"), /http/);
  assert.throws(() => normalizeHost("not a url"), /http/);
  assert.throws(() => normalizeHost(""), /empty/i);
});

test("validateToken accepts a memos_pat_ token", () => {
  const r = validateToken("memos_pat_abcdefghijklmnopqrstuvwxyz123456");
  assert.equal(r.ok, true);
  assert.equal(r.warning, undefined);
});

test("validateToken rejects an empty token", () => {
  const r = validateToken("   ");
  assert.equal(r.ok, false);
  assert.match(r.error ?? "", /access token/i);
});

test("validateToken warns but allows a token without the memos_pat_ prefix", () => {
  const r = validateToken("some-legacy-token");
  assert.equal(r.ok, true);
  assert.match(r.warning ?? "", /memos_pat_/);
});

test("readConfig combines host, token and defaults", () => {
  const raw: RawSettings = { host: " http://host:5230/ ", token: "memos_pat_x", timeoutMs: "" };
  const cfg = readConfig(raw);
  assert.equal(cfg.host, "http://host:5230");
  assert.equal(cfg.token, "memos_pat_x");
  assert.equal(cfg.timeoutMs, 10000);
});

test("readConfig honours a numeric timeout and rejects a negative one", () => {
  assert.equal(readConfig({ host: "http://h", token: "memos_pat_x", timeoutMs: "2500" }).timeoutMs, 2500);
  assert.throws(() => readConfig({ host: "http://h", token: "memos_pat_x", timeoutMs: "-1" }), /timeout/i);
});

test("readConfig rejects missing settings with an actionable message", () => {
  assert.throws(() => readConfig({ host: "", token: "", timeoutMs: "" }), /server url/i);
  assert.throws(() => readConfig({ host: "http://h", token: "", timeoutMs: "" }), /access token/i);
});

test("isSupportedVersion requires Memos 26.10 or newer", () => {
  assert.equal(isSupportedVersion("26.11.0"), true);
  assert.equal(isSupportedVersion("26.10.0"), true);
  assert.equal(isSupportedVersion("26.9.0"), false);
  assert.equal(isSupportedVersion("0.31.0"), false);
  assert.equal(isSupportedVersion("garbage"), false);
});
