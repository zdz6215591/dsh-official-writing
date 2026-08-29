// src/index.ts
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/host/jobs.ts
import {
  BlockAssembler,
  createUserMessage
} from "@deepseek-ai/dsh-llm";

// src/shared/effort.ts
function pickOffEffort(efforts) {
  if (!efforts?.length) return void 0;
  const scored = efforts.map((item) => {
    const hay = `${item.id} ${item.name || ""}`.toLowerCase();
    if (/^(off|none|disabled|false)$/i.test(item.id) || /(关闭|不思考|no.?think|disabled|none)/i.test(hay)) {
      return { item, score: 0 };
    }
    if (/\boff\b/.test(hay)) return { item, score: 1 };
    return null;
  }).filter((row) => Boolean(row));
  scored.sort((a, b) => a.score - b.score);
  return scored[0]?.item.id;
}
function pickRequestedEffort(requested, efforts) {
  if (!efforts?.length) return void 0;
  if (requested && efforts.some((item) => item.id === requested)) return requested;
  return pickOffEffort(efforts) || efforts[0]?.id;
}

// src/shared/json.ts
function parseJsonObject(raw) {
  const text = (raw || "").trim();
  if (!text) throw new Error("\u6A21\u578B\u672A\u8FD4\u56DE\u5185\u5BB9");
  const attempts = [text, extractFenced(text), extractBraces(text)].filter(
    (item) => Boolean(item)
  );
  const seen = /* @__PURE__ */ new Set();
  let lastError = null;
  for (const attempt of attempts) {
    if (seen.has(attempt)) continue;
    seen.add(attempt);
    try {
      return JSON.parse(attempt);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  throw lastError ?? new Error("\u65E0\u6CD5\u89E3\u6790\u6821\u6838\u7ED3\u679C");
}
function extractFenced(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return match?.[1]?.trim() || null;
}
function extractBraces(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return text.slice(start, end + 1).trim();
}
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

// src/shared/locate.ts
function locateInText(text, issue) {
  const type = issue.type;
  const context = issue.context ?? "";
  const original = issue.original ?? "";
  if (type === "insert") {
    if (context) {
      const idx = text.indexOf(context);
      if (idx >= 0) return { start: idx, end: idx + context.length };
    }
    return null;
  }
  if (context) {
    const ctxIdx = indexOfPreferred(text, context, issue.start);
    if (ctxIdx >= 0) {
      if (original) {
        const rel = context.indexOf(original);
        if (rel >= 0) {
          return { start: ctxIdx + rel, end: ctxIdx + rel + original.length };
        }
        const inner = text.indexOf(original, ctxIdx);
        if (inner >= 0 && inner <= ctxIdx + context.length) {
          return { start: inner, end: inner + original.length };
        }
      }
      return { start: ctxIdx, end: ctxIdx + context.length };
    }
  }
  if (original) {
    const idx = indexOfPreferred(text, original, issue.start);
    if (idx >= 0) return { start: idx, end: idx + original.length };
  }
  return null;
}
function indexOfPreferred(text, needle, hint) {
  if (!needle) return -1;
  if (typeof hint === "number" && hint >= 0) {
    if (text.slice(hint, hint + needle.length) === needle) return hint;
    const nearby = text.indexOf(needle, Math.max(0, hint - needle.length));
    if (nearby >= 0) return nearby;
  }
  return text.indexOf(needle);
}
function normalizeAuditType(value) {
  if (value === "typo" || value === "polish" || value === "insert") return value;
  return null;
}

// src/shared/local.ts
function isLocalRoute(provider, providerName = "") {
  const hay = `${provider} ${providerName}`.toLowerCase();
  return /ollama|vllm|lm[- ]?studio|localai|localhost|127\.0\.0\.1|\blocal\b|gguf|llama\.cpp|kobold|openvino/.test(
    hay
  );
}

// src/shared/docTypes.ts
var LEGACY = {
  notice_letter: "notice_letter",
  info_summary: "info_summary",
  policy: "policy",
  research: "research",
  general: "general",
  notice2: "notice_letter",
  letter: "notice_letter",
  notice: "notice_letter",
  report: "research",
  decision: "policy",
  opinion: "policy"
};
function normalizeDocType(id) {
  if (!id) return "general";
  return LEGACY[id] ?? "general";
}

// src/shared/prompts.ts
var STYLE = {
  notice_letter: [
    "\u901A\u77E5\u4EE5\u7948\u4F7F\u53E5\u4E3A\u4E3B\uFF0C\u660E\u786E\u65F6\u95F4\u3001\u5730\u70B9\u3001\u4E8B\u9879\u3001\u8981\u6C42\uFF1B\u7528\u8BCD\u5177\u6307\u793A\u6027\u3001\u544A\u77E5\u6027\u3002",
    "\u5E38\u7528\u300C\u73B0\u5C31\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B\u300D\u300C\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u300D\u300C\u7279\u6B64\u901A\u77E5\u300D\u3002",
    "\u51FD\u7528\u4E8E\u4E0D\u76F8\u96B6\u5C5E\u673A\u5173\u4E4B\u95F4\uFF0C\u5E73\u548C\u3001\u5E73\u7B49\u3001\u793C\u8C8C\u3002",
    "\u5E38\u7528\u300C\u73B0\u5C31\u2026\u2026\u4E8B\u5B9C\u51FD\u5546\u5982\u4E0B\u300D\u300C\u8BF7\u4E88\u590D\u51FD\u300D\u300C\u4E13\u6B64\u51FD\u8FBE\u300D\u3002"
  ].join(""),
  info_summary: [
    "\u4FE1\u606F\u7A3F\u4E3B\u65E8\u7A81\u51FA\u3001\u6587\u5B57\u7CBE\u7EC3\uFF0C\u5BA2\u89C2\u4E2D\u7ACB\u3001\u53D9\u4E8B\u6D41\u7545\uFF0C\u7A81\u51FA\u65F6\u6548\u6027\u4E0E\u5DE5\u4F5C\u4EAE\u70B9\uFF0C\u542B\u65F6\u95F4\u3001\u5730\u70B9\u3001\u4EBA\u7269\u3001\u7ECF\u8FC7\u3001\u6210\u6548\u3002",
    "\u5DE5\u4F5C\u603B\u7ED3 / \u5DE5\u4F5C\u6C47\u62A5\u7ED3\u6784\u4E3A\u300C\u4E3B\u8981\u505A\u6CD5\u53CA\u6210\u6548\u2014\u5B58\u5728\u95EE\u9898\u2014\u4E0B\u6B65\u6253\u7B97\u300D\u3002",
    "\u5E73\u5B9E\u5BA2\u89C2\u3001\u6570\u636E\u8BE6\u5B9E\u3002\u591A\u7528\u300C\u4ECA\u5E74\u4EE5\u6765\u2026\u2026\u300D\u300C\u4E00\u662F\u6293\u2026\u2026\u4E8C\u662F\u4FC3\u2026\u2026\u300D\u300C\u53D6\u5F97\u4E86\u660E\u663E\u6210\u6548\u300D\u300C\u4E0B\u4E00\u6B65\u6211\u4EEC\u5C06\u2026\u2026\u300D\u3002"
  ].join(""),
  policy: [
    "\u653F\u7B56 / \u7BA1\u7406\u529E\u6CD5\u7528\u6761\u6587\u5F0F\u7ED3\u6784\uFF0C\u7528\u8BCD\u9AD8\u5EA6\u51C6\u786E\u4E25\u5BC6\uFF0C\u5177\u5F3A\u5236\u7EA6\u675F\u529B\u3002",
    "\u591A\u7528\u300C\u5E94\u5F53\u300D\u300C\u4E25\u7981\u300D\u300C\u81EA\u53D1\u5E03\u4E4B\u65E5\u8D77\u65BD\u884C\u300D\u300C\u8FDD\u53CD\u672C\u529E\u6CD5\u7684\u5C06\u2026\u2026\u300D\u3002",
    "\u610F\u89C1 / \u5B9E\u65BD\u610F\u89C1\u504F\u6307\u5BFC\u6027\u3001\u5B8F\u89C2\u6027\uFF0C\u7ED3\u6784\u5E38\u4E3A\u300C\u603B\u4F53\u8981\u6C42\u2014\u91CD\u70B9\u4EFB\u52A1\u2014\u4FDD\u969C\u63AA\u65BD\u300D\u3002",
    "\u51B3\u5B9A / \u51B3\u8BAE\u6743\u5A01\u679C\u65AD\u4E25\u8083\u3002\u591A\u7528\u300C\u4F1A\u8BAE\u51B3\u5B9A\u300D\u300C\u4E00\u81F4\u540C\u610F\u300D\u3002"
  ].join(""),
  research: [
    "\u8C03\u7814\u62A5\u544A\u624E\u5B9E\u6C42\u771F\u3001\u5BA2\u89C2\u52A1\u5B9E\uFF0C\u7ED3\u6784\u4E3A\u300C\u73B0\u72B6\u5256\u6790\u2014\u75DB\u70B9\u95EE\u9898\u68B3\u7406\u2014\u9488\u5BF9\u6027\u5BF9\u7B56\u5EFA\u8BAE\u300D\u3002",
    "\u591A\u7528\u300C\u7ECF\u5B9E\u5730\u8C03\u7814\u53D1\u73B0\u2026\u2026\u300D\u300C\u5236\u7EA6\u53D1\u5C55\u7684\u6838\u5FC3\u74F6\u9888\u5728\u4E8E\u2026\u2026\u300D\u300C\u4E3A\u6B64\u5EFA\u8BAE\u91C7\u53D6\u4EE5\u4E0B\u63AA\u65BD\u2026\u2026\u300D\u3002",
    "\u8BF7\u793A / \u62A5\u544A\u8C26\u606D\u89C4\u8303\uFF0C\u5FC5\u987B\u660E\u786E\u4E8B\u7531\u3001\u8BF7\u793A\u7F18\u7531\u4E0E\u5177\u4F53\u8BF7\u6C42\u3002",
    "\u591A\u7528\u300C\u59A5\u5426\uFF0C\u8BF7\u6279\u793A\u300D\u300C\u73B0\u5C06\u6709\u5173\u60C5\u51B5\u62A5\u544A\u5982\u4E0B\u300D\uFF0C\u8BF7\u6C42\u660E\u786E\u4E14\u5355\u4E00\u3002",
    "\u4F1A\u8BAE\u7EAA\u8981\u5BA2\u89C2\u7EAA\u5B9E\u3002\u591A\u7528\u300C\u4F1A\u8BAE\u542C\u53D6\u4E86\u2026\u2026\u300D\u300C\u4F1A\u8BAE\u6307\u51FA\u2026\u2026\u300D\u300C\u4F1A\u8BAE\u5F3A\u8C03\u2026\u2026\u300D\u3002"
  ].join(""),
  general: "\u901A\u7528\u673A\u5173\u516C\u6587\uFF1A\u4E25\u8083\u3001\u5E84\u91CD\u3001\u4E25\u8C28\u7684\u4E66\u9762\u7528\u8BCD\uFF0C\u5C42\u6B21\u6E05\u695A\uFF0C\u4E0D\u7528\u53E3\u8BED\u3001\u7F51\u7EDC\u8BED\u548C\u5BF9\u8BDD\u8154\u3002"
};
function styleGuide(docType) {
  return STYLE[normalizeDocType(docType)];
}
function autocompleteSystem(input) {
  const title = (input.title || "").trim();
  const intent = (input.intent || "").trim();
  return [
    "\u4F60\u662F\u4E13\u4E1A\u516C\u6587\u5199\u4F5C\u79D8\u4E66\u3002\u6839\u636E\u5149\u6807\u524D\u7684\u4E0A\u4E0B\u6587\uFF0C\u7ACB\u523B\u8F93\u51FA\u7EED\u5199\u6B63\u6587\uFF0C\u4E0D\u8981\u601D\u8003\u8FC7\u7A0B\u3002",
    "\u7981\u6B62\uFF1A\u6807\u9898\u3001\u89E3\u91CA\u3001\u91CD\u590D\u4E0A\u6587\u3001\u91CD\u590D\u6807\u70B9\u3001Markdown\u3001\u5BF9\u8BDD\u8154\u3001\u5F15\u53F7\u5305\u88F9\u3001\u7F16\u53F7\u5217\u8868\u3002",
    "\u957F\u5EA6 8\u201340 \u5B57\u3002\u81EA\u7136\u8854\u63A5\u4E0A\u6587\uFF0C\u7B26\u5408\u673A\u5173\u516C\u6587\u7528\u8BCD\u3002",
    "\u82E5\u4E0A\u6587\u4EE5\u4E0D\u5B8C\u6574\u7684\u53E5\u5B50\u7ED3\u5C3E\uFF0C\u5FC5\u987B\u5148\u628A\u8BE5\u53E5\u8865\u5B8C\u6574\uFF0C\u518D\u89C6\u60C5\u51B5\u7EED\u5199\u3002",
    `\u5F53\u524D\u6587\u4F53\uFF1A${styleGuide(input.docType)}`,
    title ? `\u516C\u6587\u6807\u9898\uFF1A${title}` : "",
    intent ? `\u5199\u4F5C\u610F\u56FE\uFF1A${intent}` : ""
  ].filter(Boolean).join("\n");
}
function auditSystem(input) {
  return [
    "\u4F60\u662F\u8D44\u6DF1\u673A\u5173\u516C\u6587\u5BA1\u6821\u4E13\u5BB6\u3002\u53EA\u6807\u771F\u6B63\u7684\u786C\u4F24\uFF0C\u4E0D\u8981\u5439\u6BDB\u6C42\u75B5\u3002",
    "\u53EA\u6807\uFF1A\u9519\u522B\u5B57\u3001\u8BED\u6CD5\u6807\u70B9\u786C\u4F24\uFF1B\u4E25\u91CD\u5F71\u54CD\u516C\u6587\u8D28\u611F\u7684\u53E3\u8BED\uFF1B\u660E\u663E\u7684\u5E38\u8BC6\u6027\u903B\u8F91\u7F3A\u5931\u3002",
    "\u8F93\u51FA\u4E25\u683C JSON\uFF0C\u4E0D\u8981\u4EFB\u4F55\u591A\u4F59\u8BF4\u660E\uFF0C\u4E0D\u8981\u5305\u5728 Markdown \u4EE3\u7801\u5757\u91CC\u3002\u5F62\u72B6\uFF1A",
    '{"suggestions":[{"type":"typo|polish|insert","original":"\u539F\u6587\u4E2D\u5B58\u5728\u7684\u95EE\u9898\u6587\u672C\uFF08insert \u65F6\u4E3A\u7A7A\u4E32\uFF09","suggestion":"\u5EFA\u8BAE\u6539\u6210\u4EC0\u4E48 / \u8981\u63D2\u5165\u4EC0\u4E48","context":"\u539F\u6587\u4E2D\u539F\u5C01\u4E0D\u52A8\u5B58\u5728\u7684\u8FDE\u7EED\u7247\u6BB5\uFF0C\u7528\u4E8E\u5B9A\u4F4D","explanation":"\u4E3A\u4EC0\u4E48\u6539","start":0,"end":0}]}',
    "context \u53D6\u6750\u89C4\u5219\uFF08\u6700\u5173\u952E\uFF09\uFF1A",
    "- typo / polish\uFF1A\u53D6 10\u201325 \u5B57\u8FDE\u7EED\u539F\u6587\uFF0C\u5FC5\u987B\u5305\u542B original\u3002",
    "- insert\uFF1A\u53D6\u63D2\u5165\u70B9\u524D\u65B9\u7D27\u90BB\u7684 8\u201315 \u5B57\u8FDE\u7EED\u539F\u6587\u3002",
    "context \u5FC5\u987B\u662F\u539F\u6587\u91CC\u539F\u5C01\u4E0D\u52A8\u5B58\u5728\u7684\u8FDE\u7EED\u6587\u672C\uFF0C\u4E0D\u80FD\u6709\u4EFB\u4F55\u6539\u5199\u3002",
    `\u5F53\u524D\u6587\u4F53\uFF1A${styleGuide(input.docType)}`
  ].join("\n");
}
var MODE_HINT = {
  expand: "\u6269\u5199\uFF1A\u5728\u4E0D\u6539\u53D8\u539F\u610F\u7684\u524D\u63D0\u4E0B\u8865\u5145\u5FC5\u8981\u5185\u5BB9\uFF0C\u7BC7\u5E45\u66F4\u8BE6\u7EC6\u3002",
  shorten: "\u7B80\u5199\uFF1A\u538B\u7F29\u7BC7\u5E45\uFF0C\u4FDD\u7559\u8981\u70B9\uFF0C\u66F4\u7CBE\u7B80\u3002",
  abstract: "\u62D4\u9AD8\u5199\u865A\uFF1A\u66F4\u5B8F\u89C2\u3001\u62BD\u8C61\uFF0C\u5F3A\u8C03\u610F\u4E49\u4E0E\u8981\u6C42\u3002",
  concrete: "\u7EC6\u5316\u5199\u5B9E\uFF1A\u66F4\u5177\u4F53\u52A1\u5B9E\uFF0C\u8865\u8DB3\u5BF9\u8C61\u3001\u65F6\u9650\u3001\u63AA\u65BD\u4E0E\u6570\u636E\u3002",
  professional: "\u6587\u7B14\u66F4\u6709\u6587\u91C7\uFF0C\u4F46\u4ECD\u987B\u5E84\u91CD\u5F97\u4F53\uFF0C\u7981\u6B62\u534E\u4E3D\u5806\u780C\u3002",
  plain: "\u6587\u7B14\u66F4\u901A\u4FD7\u6613\u61C2\uFF0C\u4F46\u4ECD\u987B\u4E66\u9762\u3001\u5E84\u91CD\uFF0C\u7981\u6B62\u53E3\u8BED\u3002",
  reference: "\u878D\u5165\u53C2\u8003\u5185\u5BB9\u4E2D\u7684\u4E8B\u5B9E\u3001\u6570\u636E\u4E0E\u8868\u8FF0\uFF0C\u4E0D\u5F97\u7F16\u9020\u672A\u7ED9\u51FA\u7684\u4E8B\u5B9E\u3002",
  custom: "\u4E25\u683C\u6309\u81EA\u5B9A\u4E49\u4FEE\u6539\u6307\u4EE4\u6267\u884C\u3002"
};
function rewriteSystem(input) {
  const modes = input.modes?.length ? input.modes : [];
  const extra = modes.map((mode) => MODE_HINT[mode]).filter(Boolean);
  return [
    "\u4F60\u662F\u8D44\u6DF1\u653F\u5E9C\u673A\u5173\u516C\u6587\u64B0\u7A3F\u4E13\u5BB6\u3002\u53EA\u8F93\u51FA\u6539\u5199\u540E\u7684\u7ED3\u679C\u672C\u8EAB\u3002",
    "\u7981\u6B62\uFF1A\u89E3\u91CA\u3001\u5BF9\u8BDD\u3001Markdown\u3001\u6807\u9898\u3001\u524D\u540E\u7F00\u3001\u5F15\u53F7\u5305\u88F9\u5168\u6587\u3002",
    "\u4FDD\u6301\u539F\u610F\uFF0C\u7B26\u5408\u673A\u5173\u516C\u6587\u8BED\u4F53\u3002",
    `\u5F53\u524D\u6587\u4F53\uFF1A${styleGuide(input.docType)}`,
    extra.length ? `\u9644\u52A0\u8981\u6C42\uFF1A
${extra.map((line) => `- ${line}`).join("\n")}` : "",
    input.reference?.trim() ? `\u5FC5\u987B\u878D\u5165\u7684\u53C2\u8003\u5185\u5BB9\uFF1A
${input.reference.trim()}` : "",
    input.custom?.trim() ? `\u81EA\u5B9A\u4E49\u4FEE\u6539\u6307\u4EE4\uFF1A
${input.custom.trim()}` : ""
  ].filter(Boolean).join("\n");
}
function cleanModelText(raw) {
  let text = (raw || "").trim();
  text = text.replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();
  text = text.replace(/^(续写|改写后|如下)[的]?[文本内容句段]*[：:]\s*/i, "").trim();
  if (text.startsWith("\u300C") && text.endsWith("\u300D") || text.startsWith('"') && text.endsWith('"') || text.startsWith("\u201C") && text.endsWith("\u201D")) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

// src/shared/types.ts
function parseRouteKey(value) {
  if (!value) return null;
  const idx = value.indexOf("::");
  if (idx <= 0) return null;
  const provider = value.slice(0, idx);
  const model = value.slice(idx + 2);
  if (!provider || !model) return null;
  return { provider, model };
}

// src/host/jobs.ts
var STREAM_TIMEOUT_MS = 8e3;
var AUDIT_TIMEOUT_MS = 2e4;
function finishError(finish) {
  if (!finish) return void 0;
  if (finish.kind === "error" || finish.kind === "aborted") {
    return new Error(finish.failure?.message || (finish.kind === "aborted" ? "\u5DF2\u53D6\u6D88" : "\u6A21\u578B\u8C03\u7528\u5931\u8D25"));
  }
  return void 0;
}
function withTimeout(signal, ms) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error("TIMEOUT")), ms);
  const onAbort = () => ctrl.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  if (signal?.aborted) ctrl.abort(signal.reason);
  return {
    signal: ctrl.signal,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  };
}
function asEffort(value) {
  return value ? value : void 0;
}
async function resolveRoute(ctx, request) {
  const providers = ctx.llm.listProviders();
  if (!providers.length) throw new Error("\u5F53\u524D\u6CA1\u6709\u53EF\u7528\u7684 dsh \u6A21\u578B\uFF0C\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u914D\u7F6E");
  const parsed = parseRouteKey(request.route);
  let provider = parsed?.provider;
  let model = parsed?.model;
  if (!provider || !model) {
    provider = providers[0].id;
    const models = await ctx.llm.listModels(provider);
    if (!models.length) throw new Error(`\u63D0\u4F9B\u65B9 ${providers[0].name} \u672A\u516C\u5E03\u53EF\u7528\u6A21\u578B`);
    model = models[0].id;
  }
  const info = providers.find((item) => item.id === provider);
  if (!info) throw new Error(`\u627E\u4E0D\u5230\u63D0\u4F9B\u65B9 ${provider}`);
  const resolved = await ctx.llm.resolveModelInfo(provider, model);
  const local = isLocalRoute(provider, info.name);
  if (request.encrypted && !local) {
    throw new Error("\u52A0\u5BC6\u6A21\u5F0F\u7981\u6B62\u628A\u6B63\u6587\u9001\u51FA\u672C\u5730\u3002\u8BF7\u5148\u914D\u7F6E\u53EF\u7528\u7684\u672C\u5730\u6A21\u578B\uFF0C\u6216\u6539\u56DE\u666E\u901A\u6A21\u5F0F\u3002");
  }
  return {
    provider,
    model,
    local,
    efforts: (resolved.reasoning?.efforts ?? []).map((item) => ({ id: item.id, name: item.name }))
  };
}
function userMessage(text) {
  return createUserMessage({
    content: [{ type: "text", text }],
    source: { kind: "plugin", plugin: "dsh-official-writing" }
  });
}
function deadline(promise, signal) {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(new Error("TIMEOUT"));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(new Error("TIMEOUT"));
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      }
    );
  });
}
async function streamText(ctx, options, onDelta) {
  const assembler = new BlockAssembler();
  for await (const chunk of ctx.llm.stream(options)) {
    if (options.signal?.aborted) throw new Error("TIMEOUT");
    assembler.push(chunk);
    if (chunk.type === "text-delta" && chunk.text) onDelta(chunk.text);
  }
  const error = finishError(assembler.finish);
  if (error) throw error;
  return assembler.blocks().filter((block) => block.type === "text").map((block) => block.text).join("");
}
async function streamMaybeOffThinking(ctx, options, onDelta, efforts, requested) {
  const off = pickOffEffort(efforts);
  const effort = requested ? asEffort(pickRequestedEffort(requested, efforts)) : asEffort(off || "off");
  const call = async (next) => deadline(streamText(ctx, next, onDelta), next.signal);
  try {
    return await call(effort ? { ...options, reasoningEffort: effort } : options);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/UNSUPPORTED_REASONING_EFFORT/i.test(message)) throw error;
    return await call(options);
  }
}
function buildAuditIssues(raw, source) {
  let parsed;
  try {
    parsed = parseJsonObject(raw);
  } catch {
    return [];
  }
  const record = asRecord(parsed);
  const list = record?.suggestions;
  if (!Array.isArray(list)) return [];
  const issues = [];
  let i = 0;
  for (const item of list) {
    const row = asRecord(item);
    if (!row) continue;
    const type = normalizeAuditType(row.type);
    if (!type) continue;
    const original = type === "insert" ? "" : asString(row.original);
    const suggestion = asString(row.suggestion);
    const context = asString(row.context);
    const explanation = asString(row.explanation) || asString(row.reason);
    if (type !== "insert" && !original && !context) continue;
    if (type === "insert" && !context) continue;
    const draft = {
      id: `audit-${Date.now().toString(36)}-${i++}`,
      type,
      original,
      suggestion,
      reason: explanation,
      context,
      start: typeof row.start === "number" ? row.start : 0,
      end: typeof row.end === "number" ? row.end : 0
    };
    const located = locateInText(source, draft);
    if (!located) continue;
    issues.push({ ...draft, start: located.start, end: located.end });
  }
  issues.sort((a, b) => a.start - b.start || a.end - b.end);
  return issues;
}
async function runJob(ctx, request, job) {
  const route = await resolveRoute(ctx, request);
  const timeoutMs = request.task === "audit" ? AUDIT_TIMEOUT_MS : STREAM_TIMEOUT_MS;
  const clock = withTimeout(job.abort.signal, timeoutMs);
  try {
    if (request.task === "autocomplete") {
      const before = request.textBefore || request.text || "";
      const system2 = autocompleteSystem({
        docType: request.docType,
        title: request.title,
        intent: request.intent
      });
      const raw2 = await streamMaybeOffThinking(
        ctx,
        {
          provider: route.provider,
          model: route.model,
          system: system2,
          messages: [userMessage(`\u5149\u6807\u524D\u4E0A\u4E0B\u6587\uFF1A
${before.slice(-800)}`)],
          temperature: 0.2,
          maxTokens: 64,
          signal: clock.signal
        },
        (delta) => {
          job.text += delta;
        },
        route.efforts
      );
      const cleaned = cleanModelText(raw2 || job.text);
      job.text = (cleaned || (raw2 || job.text).replace(/\s+/g, " ").trim()).slice(0, 60);
      return;
    }
    if (request.task === "rewrite") {
      const modes = request.modes || [];
      const system2 = rewriteSystem({
        docType: request.docType,
        modes,
        custom: request.custom,
        reference: request.reference
      });
      const raw2 = await streamMaybeOffThinking(
        ctx,
        {
          provider: route.provider,
          model: route.model,
          system: system2,
          messages: [
            userMessage(
              [
                request.contextBefore ? `\u4E0A\u6587\uFF1A
${request.contextBefore}` : "",
                `\u5F85\u6539\u5199\u6587\u672C\uFF1A
${request.text}`,
                request.contextAfter ? `\u4E0B\u6587\uFF1A
${request.contextAfter}` : ""
              ].filter(Boolean).join("\n\n")
            )
          ],
          temperature: 0.5,
          maxTokens: 1200,
          signal: clock.signal
        },
        (delta) => {
          job.text += delta;
        },
        route.efforts,
        request.effort
      );
      job.text = cleanModelText(raw2 || job.text);
      return;
    }
    const system = auditSystem({ docType: request.docType });
    const raw = await streamMaybeOffThinking(
      ctx,
      {
        provider: route.provider,
        model: route.model,
        system,
        messages: [
          userMessage(
            `\u6587\u4F53\uFF1A${normalizeDocType(request.docType)}
\u6807\u9898\uFF1A${request.title || ""}

\u6B63\u6587\uFF1A
${request.text}`
          )
        ],
        temperature: 0.1,
        maxTokens: 1800,
        signal: clock.signal
      },
      () => {
      },
      route.efforts,
      request.depth === "deep" ? request.effort : void 0
    );
    const issues = buildAuditIssues(raw, request.text);
    job.text = JSON.stringify({ suggestions: issues });
  } finally {
    clock.dispose();
  }
}

// src/index.ts
var OfficialWritingGateway = class extends TypertRemoteService {
  static inject = ["llm"];
  jobs = /* @__PURE__ */ new Map();
  seq = 0;
  constructor(ctx) {
    super(ctx, "officialWriting");
    ctx.effect(() => () => {
      for (const job of this.jobs.values()) job.abort.abort();
      this.jobs.clear();
    });
  }
  async catalog() {
    const models = [];
    const failures = [];
    for (const provider of this.ctx.llm.listProviders()) {
      try {
        const listed = await this.ctx.llm.listModels(provider.id);
        for (const model of listed) {
          try {
            const info = await this.ctx.llm.resolveModelInfo(provider.id, model.id);
            models.push({
              provider: provider.id,
              model: model.id,
              providerName: provider.name,
              modelName: info.name || model.name || model.id,
              local: isLocalRoute(provider.id, provider.name),
              efforts: (info.reasoning?.efforts ?? []).map((item) => ({
                id: item.id,
                name: item.name
              }))
            });
          } catch (error) {
            models.push({
              provider: provider.id,
              model: model.id,
              providerName: provider.name,
              modelName: model.name || model.id,
              local: isLocalRoute(provider.id, provider.name),
              efforts: []
            });
            failures.push({
              provider: provider.id,
              name: `${provider.name} / ${model.id}`,
              message: error instanceof Error ? error.message : String(error)
            });
          }
        }
        if (!listed.length) {
          failures.push({
            provider: provider.id,
            name: provider.name,
            message: "\u672A\u516C\u5E03\u53EF\u7528\u6A21\u578B"
          });
        }
      } catch (error) {
        failures.push({
          provider: provider.id,
          name: provider.name,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
    return { models, failures };
  }
  startJob(request) {
    const jobId = `ow-${Date.now().toString(36)}-${++this.seq}`;
    const abort = new AbortController();
    const job = {
      jobId,
      text: "",
      done: false,
      abort,
      task: request.task
    };
    this.jobs.set(jobId, job);
    void this.execute(job, request);
    return snapshot(job);
  }
  pollJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) {
      return { jobId, text: "", done: true, error: "\u4EFB\u52A1\u4E0D\u5B58\u5728\u6216\u5DF2\u7ED3\u675F" };
    }
    const view = snapshot(job);
    if (job.done) this.jobs.delete(jobId);
    return view;
  }
  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return { jobId, text: "", done: true };
    job.abort.abort();
    job.done = true;
    job.error = job.error || "\u5DF2\u53D6\u6D88";
    this.jobs.delete(jobId);
    return snapshot(job);
  }
  async execute(job, request) {
    try {
      await runJob(this.ctx, request, job);
    } catch (error) {
      if (job.abort.signal.aborted) {
        job.error = "\u5DF2\u53D6\u6D88";
      } else if (error instanceof Error && /TIMEOUT|abort/i.test(error.message)) {
        job.error = request.task === "audit" ? "\u6821\u6838\u8D85\u65F6" : "\u8054\u60F3\u8D85\u65F6";
      } else {
        job.error = error instanceof Error ? error.message : String(error);
      }
    } finally {
      job.done = true;
    }
  }
};
function snapshot(job) {
  return {
    jobId: job.jobId,
    text: job.text,
    done: job.done,
    ...job.error ? { error: job.error } : {}
  };
}
var name = "official-writing";
var inject = ["llm"];
function apply(ctx) {
  new OfficialWritingGateway(ctx);
}
export {
  OfficialWritingGateway,
  apply,
  inject,
  name
};
//# sourceMappingURL=index.js.map
