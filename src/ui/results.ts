/**
 * Maps Memos data onto Wox result rows.
 *
 * Keeping this separate from the plugin entry point means the interesting part
 * (what the user sees, and what each action does) is testable without a Wox
 * host. Action callbacks are injected as plain functions.
 *
 * Static UI strings are `i18n:` keys: Wox resolves them from plugin.json using
 * the user's UI language, so no translation API calls are needed per query.
 */
import type {
  PluginSettingDefinitionItem,
  Result,
  ResultAction,
  WoxImage,
} from "@wox-launcher/wox-plugin";
import type { Memo } from "../memos/client";
import {
  buildPreviewMarkdown,
  extractTags,
  formatTimestamp,
  titleFromContent,
} from "./format";

export interface MemoActionHandlers {
  openInBrowser(memo: Memo): Promise<void>;
  copy(text: string): Promise<void>;
  update(memo: Memo, content: string): Promise<void>;
  remove(memo: Memo): Promise<void>;
}

/** i18n keys defined in plugin.json (en_US / zh_CN). */
export const LABELS = {
  open: "i18n:action_open",
  copy: "i18n:action_copy",
  edit: "i18n:action_edit",
  del: "i18n:action_delete",
  create: "i18n:action_create",
  content: "i18n:edit_content_label",
  contentTooltip: "i18n:edit_content_tooltip",
  tags: "i18n:property_tags",
  created: "i18n:property_created",
  attachments: "i18n:property_attachments",
  visibility: "i18n:property_visibility",
  createSubtitle: "i18n:create_subtitle",
} as const;

const MEMO_ICON: WoxImage = { ImageType: "emoji", ImageData: "📝" };
const INFO_ICON: WoxImage = { ImageType: "emoji", ImageData: "⚠️" };
const CREATE_ICON: WoxImage = { ImageType: "emoji", ImageData: "➕" };

export function buildInfoResult(title: string, subtitle: string): Result {
  return {
    Id: `info:${title}`,
    Title: title,
    SubTitle: subtitle,
    Icon: INFO_ICON,
    Score: 1000,
    Actions: [],
  };
}

/** Shown when a search finds nothing: Enter turns the typed text into a memo. */
export function buildCreateResult(
  content: string,
  onCreate: (content: string) => Promise<void>,
): Result {
  return {
    Id: "create",
    Title: content,
    SubTitle: LABELS.createSubtitle,
    Icon: CREATE_ICON,
    Score: 1000,
    Actions: [
      {
        Id: "create-memo",
        Name: LABELS.create,
        IsDefault: true,
        Action: async () => {
          await onCreate(content);
        },
      },
    ],
  };
}

export function memoToResult(memo: Memo, handlers: MemoActionHandlers, score = 100): Result {
  const tags = extractTags(memo.content ?? "");
  const created = formatTimestamp(memo.createTime);
  const attachments = memo.attachments ?? [];
  const previewData = buildPreviewMarkdown(memo.content ?? "", attachments);

  const properties: Record<string, string> = {};
  if (tags.length > 0) properties[LABELS.tags] = tags.join(", ");
  if (created) properties[LABELS.created] = created;
  if (attachments.length > 0) properties[LABELS.attachments] = String(attachments.length);
  properties[LABELS.visibility] = memo.visibility ?? "PRIVATE";

  const actions: ResultAction[] = [
    {
      Id: `open:${memo.name}`,
      Name: LABELS.open,
      Icon: { ImageType: "emoji", ImageData: "🌐" },
      IsDefault: true,
      Action: async () => {
        await handlers.openInBrowser(memo);
      },
    },
    {
      Id: `copy:${memo.name}`,
      Name: LABELS.copy,
      Icon: { ImageType: "emoji", ImageData: "📋" },
      Action: async () => {
        await handlers.copy(memo.content ?? "");
      },
    },
    {
      Id: `edit:${memo.name}`,
      Name: LABELS.edit,
      Icon: { ImageType: "emoji", ImageData: "✏️" },
      Type: "form",
      Form: [
        {
          Type: "textbox",
          Value: {
            Key: "content",
            Label: LABELS.content,
            Suffix: "",
            DefaultValue: memo.content ?? "",
            Tooltip: LABELS.contentTooltip,
            MaxLines: 8,
            Validators: [],
          },
          DisabledInPlatforms: [],
          IsPlatformSpecific: false,
        } as PluginSettingDefinitionItem,
      ],
      OnSubmit: async (_ctx, formCtx) => {
        const next = formCtx.Values["content"];
        if (!next || next === memo.content) return;
        await handlers.update(memo, next);
      },
    },
    {
      Id: `delete:${memo.name}`,
      Name: LABELS.del,
      Icon: { ImageType: "emoji", ImageData: "🗑️" },
      PreventHideAfterAction: true,
      Action: async () => {
        await handlers.remove(memo);
      },
    },
  ];

  return {
    Id: memo.name,
    IdentityKey: memo.name,
    Title: titleFromContent(memo.content ?? ""),
    SubTitle: created
      ? `${created}${tags.length ? ` · ${tags.map((t) => `#${t}`).join(" ")}` : ""}`
      : "",
    Icon: MEMO_ICON,
    Score: score,
    Tails: created ? [{ Type: "text", Text: created }] : undefined,
    Preview: {
      PreviewType: "markdown",
      PreviewData: previewData,
      PreviewProperties: properties,
    },
    Actions: actions,
  };
}

export function buildMemoResults(memos: Memo[], handlers: MemoActionHandlers): Result[] {
  return memos.map((memo, i) => memoToResult(memo, handlers, 100 - i));
}
