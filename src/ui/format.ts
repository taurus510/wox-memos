/** Pure presentation helpers. No Wox SDK imports, no I/O — trivially testable. */

export interface PreviewAttachment {
  filename?: string;
  type?: string;
  externalLink?: string;
}

const TAG_RE = /#([^\s#]+)/g;

/** Hashtags Memos-style: `#` followed by non-whitespace, non-`#` characters. */
export function extractTags(content: string): string[] {
  const tags: string[] = [];
  for (const match of (content ?? "").matchAll(TAG_RE)) {
    const tag = match[1];
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

export function stripTags(content: string): string {
  return (content ?? "")
    .replace(TAG_RE, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Result titles use the first non-empty line so multi-line notes stay scannable. */
export function titleFromContent(content: string, maxLen = 60): string {
  const first = (content ?? "")
    .split(/\r?\n/)
    .map((line) => stripTags(line))
    .find((line) => line.length > 0);
  if (!first) return "(empty memo)";
  if (first.length <= maxLen) return first;
  return `${first.slice(0, maxLen)}…`;
}

/** Render an ISO timestamp in the machine's local time; never throw on bad input. */
export function formatTimestamp(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Last path segment of a resource name (`memos/abc` -> `abc`). */
export function memoIdFromName(name: string): string {
  if (!name) return "";
  const parts = name.split("/");
  return parts[parts.length - 1] ?? "";
}

/**
 * Markdown for Wox's preview panel. Attachments are listed as links/text rather
 * than embedded through a local proxy: private attachments need a Bearer header,
 * which a markdown renderer cannot supply. Link text stays useful and honest.
 */
export function buildPreviewMarkdown(content: string, attachments: PreviewAttachment[] = []): string {
  const blocks: string[] = [content ?? ""];
  const imageBlocks: string[] = [];
  const fileBlocks: string[] = [];

  for (const a of attachments) {
    const label = a.filename || "attachment";
    const isImage =
      (a.type ?? "").startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/i.test(label);
    if (isImage && a.externalLink) {
      imageBlocks.push(`![${label}](${a.externalLink})`);
    } else if (isImage) {
      imageBlocks.push(`- 🖼 ${label} (private attachment — open in Memos to view)`);
    } else {
      fileBlocks.push(`- 📎 ${label}`);
    }
  }

  return [...blocks, ...imageBlocks, ...fileBlocks].filter((b) => b !== "").join("\n\n");
}
