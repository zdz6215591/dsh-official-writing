# dsh-official-writing

English | [中文](README.zh.md)

An official-document writing workbench for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It is a dual-face Cordis plugin: the host half talks to `ctx.llm` on a private, one-shot channel; the browser half is an in-app writing studio.

It is a writing tool, not a chatbot. Pause at the end of a sentence and the next clause is suggested. Finish a draft, run audit, and accept or ignore notes that stay locked to the current text.

## What it does

- Activity-bar entry next to **Workspace / Search / View options / Add workspace**, tooltip `公文写作助手`. Click to open, click again to close.
- First-run wizard: secrecy mode → document type → required title + optional intent. The title seeds the document `h1`.
- Tiptap editor with comfortable long-form layout, live character count, and durable local persistence.
- Draggable frosted toolbar: **模型设置 / 修改文体 / 联想 / 深度+校验**, with position memory.
- Ghost autocomplete after ~5 seconds at a paragraph end (Tab / → to accept). Thinking is always off for this path.
- Full-document audit in **quick** (no thinking) or **deep** (thinking on). Notes locate by live substring search, never by stale offsets.
- Independent comment pane: hover highlights, click scrolls, neither side hijacks the other while scrolling.
- Selection rewrite with exclusive length / abstraction / diction groups, plus composable reference text and custom instructions. Streaming result, replace or copy.
- Encrypted mode never sends body text to a cloud route. If no local model is available, AI actions are disabled with an explicit toast.

All model traffic uses the harness `ctx.llm` stream. There is no plugin-owned `/api/*` backend and no API key field in this UI.

## Install

One-liner (PowerShell):

```powershell
irm https://raw.githubusercontent.com/zdz6215591/dsh-official-writing/main/install.ps1 | iex
```

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/zdz6215591/dsh-official-writing/main/install.sh | bash
```

Or add the GitHub package to the `web` profile yourself:

```bash
dsh plugin --profile web add github:zdz6215591/dsh-official-writing
```

Restart `dsh web`. The activity-bar button appears to the right of the workspace header actions.

Peer runtime (already present in a stock web profile):

- `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-llm`
- `@deepseek-ai/dsh-typert-protocol`

## Architecture

| Face | Role |
| --- | --- |
| Host `apply` | `officialWriting` Typert service: `catalog`, `startJob`, `pollJob`, `cancelJob`. Jobs call `ctx.llm.stream` with plugin-sourced messages so nothing lands in the visible session log. |
| `./typert` | Strict Host invocation descriptors for the gateway. |
| `./remote` | Client Remote contribution mounted with `ctx.remote.$mount`. |
| `./client` | Web module-loader factory. Registers `shell.overlay` and injects the activity-bar control. |

Autocomplete / rewrite stream token-by-token over job polling (~48 ms). Audit waits for a complete JSON object, then degrades `JSON.parse` → fenced block → first/last braces.

Document types are `notice_letter` / `info_summary` / `policy` / `research` / `general`. Unknown stored ids collapse to `general` so style instructions never miss.

## Development

```bash
npm install
npm run build
npm test
```

`lib/client.js` is a `window.__ModuleLoader__.load` factory. Tiptap is bundled; `react` and `@deepseek-ai/cordis` stay external.

## License

MIT
