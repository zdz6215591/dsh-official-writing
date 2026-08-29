# 公文写作助手 · dsh 插件

[English](README.md) | 中文

DeepSeek Harness 双面 Cordis 插件：Host 走 `ctx.llm` 的独立临时上下文，Client 是嵌在 dsh 里的公文写作工作台。

这不是聊天机器人。写完一句停约 5 秒，工具把下一句补出来；整篇点校验，错别字 / 口语 / 逻辑缺口标在原文上，右侧列出批注，点一条就改。所有自动改动都带「选中文本」高亮，点击即消失。

## 能力

- 左侧活动栏入口，插在「工作区 / 搜索 / 视图选项 / 添加工作区」右侧，tooltip：`公文写作助手`。点击打开，再次点击收起。
- 首次引导：加密性质 → 公文文体 → 必填标题与可选写作意图。标题预填到正文 `h1`。
- Tiptap 长文版心、实时字数、本地持久化（关工作台 / 刷新不丢）。
- 可拖动毛玻璃工具条：`模型设置` / `修改文体` / `联想` / `深度+校验`，位置记忆。
- 智能联想：段末静止约 5 秒触发；`Tab` / `→` 采纳。联想始终关闭深度思考。
- 智能校核：快速（关思考）/ 深度（开思考）。定位靠原文片段实时查找，不用过期偏移量。
- 批注栏与正文独立滚动：悬停只高亮，点击才滚动；互不绑架。
- 选区改写：篇幅 / 虚实 / 文笔三组互斥，可叠加「融入参考内容」「自定义修改指令」。流式结果，可替换或复制。
- 加密模式禁止把正文送出本地。没有本地模型时禁用 AI 并明确提示。

模型全部来自 dsh，界面不收集 API Key。除 dsh 自身通道外不应出现插件自建 `/api/*` 请求。

## 安装

PowerShell 一键安装：

```powershell
irm https://raw.githubusercontent.com/zdz6215591/dsh-official-writing/main/install.ps1 | iex
```

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/zdz6215591/dsh-official-writing/main/install.sh | bash
```

或手动加入 web profile：

```bash
dsh plugin --profile web add github:zdz6215591/dsh-official-writing
```

重启 `dsh web`。活动栏按钮出现在工作区顶栏按钮组右侧。

## 约定

- 文体 id：`notice_letter` / `info_summary` / `policy` / `research` / `general`。任何未知值回落到 `general`。
- 校核 JSON 解析：直接解析 → 抽取 ` ```json ` 代码块 → 截取首尾花括号。
- 联想 10–50 字；校核温度 0.1，改写 0.5，联想 0.3。
- 超时：校核 35s，流式 20s。

## 开发

```bash
npm install
npm run build
npm test
```

## 许可证

MIT
