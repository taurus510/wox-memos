/**
 * Connectivity check against a live Memos server, without Wox.
 *
 *   MEMOS_HOST=http://192.168.0.14:5230 MEMOS_TOKEN=memos_pat_... npm run verify:live
 *
 * Exit 0 = connected and token works, 1 = reachable but broken, 2 = bad args.
 */
import { MemosClient } from "../src/memos/client";

async function main(): Promise<number> {
  const host = process.env.MEMOS_HOST ?? "http://192.168.0.14:5230";
  const token = process.env.MEMOS_TOKEN ?? "";

  if (!token) {
    console.error(
      "MEMOS_TOKEN is required. Create a personal access token in Memos → Settings → Access Tokens.",
    );
    return 2;
  }

  const client = new MemosClient(host, token);
  const report = await client.checkConnection();
  console.log(`server : ${host}`);
  console.log(`version: ${report.version ?? "unknown"}`);
  console.log(`result : ${report.ok ? "OK" : "FAILED"} — ${report.message}`);

  if (report.ok) {
    const page = await client.listMemos({ pageSize: 3 });
    console.log(`sample : ${page.memos.length} memo(s) readable`);
    for (const m of page.memos) {
      console.log(`  - ${m.name}: ${(m.content ?? "").split("\n")[0].slice(0, 60)}`);
    }
  }
  return report.ok ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e: Error) => {
    console.error(`verify failed: ${e.message}`);
    process.exit(1);
  });
