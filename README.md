# wox-memos

Wox 2 启动器插件，用于连接**自建 Memos 26.10+ 服务器**：创建、搜索、浏览、编辑、删除备忘录。

## 为什么另写一个

社区里的 [Wox.Plugin.Memos](https://github.com/qianlifeng/Wox.Plugin.Memos) 调用的是 `/api/v1/memos`。Memos 从 **26.10.0** 起把 REST 路由改成了 `/api/...`，旧路径直接返回 `410 Gone`（`"API v1 has been removed"`）。所以在较新的 Memos 上，那个插件无论怎么填服务器地址和令牌都连不上。

这个实现直接面向 26.x 的 `/api` 契约，并顺手补了几处工程问题：

| | Wox.Plugin.Memos | 本项目 |
|---|---|---|
| API | `/api/v1`（已废弃） | `/api`（26.10+） |
| 分页 | `page` / `pageSize` | `nextPageToken` 不透明游标 |
| 搜索 | 拉 100 条本地过滤 | 服务端 CEL `content.contains`，失败自动回退本地 |
| 版本问题 | 报 410，看不懂 | 启动时可 `memos check` 自检，明确提示需要 26.10+ |
| 认证 | Bearer + Cookie 混用 | 只用 Bearer 个人访问令牌（PAT） |
| 地址填错 | 拼成 `/api/v1/api/memos` | 自动剥掉误填的 `/api`、`/api/v1` 后缀 |
| 图片附件 | 起一个本地 HTTP 代理 | 不代理；私有附件注明需在 Memos 中查看（markdown 渲染器无法附带 Bearer 头） |
| 结构 | UI 与 HTTP 混在少数文件 | `memos/`（HTTP）、`ui/`（纯函数映射）、`index.ts`（薄胶水），核心逻辑 41 个单元测试覆盖 |

## 兼容性

| 依赖 | 要求 |
|---|---|
| Memos | **26.10.0 或更新**（0.30 / 0.31 / 26.9 用的是 `/api/v1`，不支持） |
| Wox | 2.0.0+（Node.js 运行时插件） |
| Node.js | 18+（构建/开发时；发布的 `.wox` 已打包全部依赖） |
| 系统 | Windows / macOS / Linux（主要在 Windows 上使用） |

## 安装

**方式 A：从 Release 装（推荐）**

下载 `wox.plugin.memos.wox`，在 Wox 里导入，或解压到 Wox 插件目录（`%APPDATA%\wox\plugins\` 下新建一个文件夹）。

**方式 B：本地构建**

```bash
npm ci
npm run package      # 生成 wox.plugin.memos.wox
```

把生成的 `.wox` 导入 Wox 即可。`dist/` 里也有可直接使用的 `index.js` + `plugin.json`。

**方式 C：wpm**

本项目没有发布到 wpm 插件市场，暂不支持 `wpm install`。

## 配置

在 Wox → 插件 → Memos → 设置里填三项：

| 设置 | 值 |
|---|---|
| Memos 服务器地址 | 根地址，例如 `http://192.168.0.14:5230`。**不要**带 `/api` 或 `/api/v1`，不要带尾部斜杠 |
| 访问令牌 (Access Token) | 个人访问令牌，`memos_pat_` 开头 |
| 请求超时 | 默认 `10000`（毫秒） |

**生成令牌**：打开 Memos 网页 → 右上角头像 → 设置 → **Access Tokens / 访问令牌** → 新建（可设描述、过期时间）→ **立刻复制**，明文只显示这一次。令牌只授予你自己账号的权限，别用浏览器会话 cookie。

> 本仓库的默认 `host` 已预填 `http://192.168.0.14:5230`，这是本次部署的机器；换机器时改掉即可。

配置完先跑一次自检：

```
memos check
```

正常会显示 `连接正常 / Connection OK` 加版本号；若令牌失效、版本过旧、服务器不可达，会直接给出可操作的原因。

## 用法

| 输入 | 作用 |
|---|---|
| `memos` | 列出最近 30 条 |
| `memos 买菜` | 搜索（服务端过滤），无结果时按 Enter 直接创建这条 |
| `memos create 明天交电费 #生活` | 强制创建 |
| `memos check` | 连接 / 版本 / 令牌自检 |

结果项的操作：`Enter` 在浏览器打开、复制内容、编辑（表单）、删除。预览面板显示全文、标签、时间、可见性。

## 开发

```bash
npm ci
npm test             # node:test + 本地真实 HTTP server，41 tests
npm run typecheck    # tsc --noEmit
npm run build        # esbuild 打包成自包含 dist/index.js
npm run package      # 再打成 .wox
npm run check        # typecheck + test

# 不装 Wox，先命令行验证服务器和令牌是否可用
MEMOS_HOST=http://192.168.0.14:5230 MEMOS_TOKEN=memos_pat_... npm run verify:live
```

`verify:live` 会打印服务器版本、连接结果，成功时再列出前 3 条备忘录。配置 Wox 之前先跑它，能省掉大部分排查。

测试不 mock `fetch`：起一个 loopback HTTP server，断言真实的请求方法、路径、查询参数、Bearer 头和 JSON body。

## 已知限制

- 只支持个人访问令牌；不支持 SSO / 会话 cookie 登录。
- 私有附件图片不会在预览里内嵌（需要 Bearer 头，markdown 渲染器给不了），只列出文件名并提示到 Memos 中查看。
- 搜索走 `content.contains`，是子串匹配，不是全文检索。
- 列表默认取最近 30 条；如需翻页，用关键词缩小范围。

## CI

仓库里带了一份 GitHub Actions 配置模板：`docs/ci-workflow.yml`（跑 `npm ci` → typecheck → 41 个测试 → 打包，并上传 `.wox` 产物）。

> 初次推送时当前 `gh` 令牌没有 `workflow` scope，所以配置以模板形式放在 `docs/`，没有放进 `.github/workflows/`。
> 想启用 CI：在 GitHub 网页上把 `docs/ci-workflow.yml` 的内容新建为 `.github/workflows/ci.yml` 即可（网页登录具备该权限），或在本地 `git mv` 后用带 `workflow` scope 的凭据推送。

## License

MIT
