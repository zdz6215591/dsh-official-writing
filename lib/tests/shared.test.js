// src/tests/shared.test.ts
import assert from "node:assert/strict";
import test from "node:test";

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

// src/shared/locate.ts
function locateInText(text, issue) {
  const type = issue.type;
  const context = issue.context ?? "";
  const original = issue.original ?? "";
  if (type === "insert") {
    if (context) {
      const idx2 = indexOfContext(text, context, issue.start);
      if (idx2 >= 0) return { start: idx2, end: idx2 + context.length };
    }
    return null;
  }
  if (!original) return null;
  if (context) {
    const ctxIdx = indexOfContext(text, context, issue.start);
    if (ctxIdx >= 0) {
      const rel = context.indexOf(original);
      if (rel >= 0) return { start: ctxIdx + rel, end: ctxIdx + rel + original.length };
      const inner = text.indexOf(original, ctxIdx);
      if (inner >= 0 && inner <= ctxIdx + context.length) {
        return { start: inner, end: inner + original.length };
      }
    }
  }
  const idx = indexOfOriginal(text, original, issue.start);
  if (idx >= 0) return { start: idx, end: idx + original.length };
  return null;
}
function indexOfContext(text, needle, _hint) {
  if (!needle) return -1;
  return text.indexOf(needle);
}
function indexOfOriginal(text, needle, hint) {
  if (!needle) return -1;
  if (typeof hint !== "number" || hint < 0) return text.indexOf(needle);
  if (text.slice(hint, hint + needle.length) === needle) return hint;
  let idx = text.indexOf(needle);
  if (idx < 0) return -1;
  let best = idx;
  let bestDist = Math.abs(idx - hint);
  while (idx >= 0) {
    const dist = Math.abs(idx - hint);
    if (dist < bestDist) {
      best = idx;
      bestDist = dist;
    }
    idx = text.indexOf(needle, idx + 1);
  }
  return best;
}
function relocateIssues(text, issues) {
  const next = [];
  for (const issue of issues) {
    const range = locateInText(text, issue);
    if (!range) continue;
    next.push({ ...issue, start: range.start, end: range.end });
  }
  next.sort((a, b) => a.start - b.start || a.end - b.end);
  return next;
}
function applyIssueToText(text, issue) {
  const range = locateInText(text, issue);
  if (!range) return null;
  const suggestion = issue.suggestion ?? "";
  if (issue.type === "insert") {
    const from = range.end;
    return {
      text: text.slice(0, from) + suggestion + text.slice(from),
      from,
      to: from + suggestion.length
    };
  }
  return {
    text: text.slice(0, range.start) + suggestion + text.slice(range.end),
    from: range.start,
    to: range.start + suggestion.length
  };
}

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
function resolveEffort(opts) {
  const efforts = opts.efforts;
  if (!efforts?.length) return void 0;
  if (opts.requested && efforts.some((item) => item.id === opts.requested)) return opts.requested;
  if (opts.preferOff) return pickOffEffort(efforts);
  return pickOffEffort(efforts) || efforts[0]?.id;
}
function streamAttempts(opts) {
  const advertised = resolveEffort(opts);
  const attempts = [];
  const push = (attempt) => {
    const key = `${attempt.reasoningEffort || ""}|${attempt.purpose || ""}`;
    if (attempts.some((item) => `${item.reasoningEffort || ""}|${item.purpose || ""}` === key)) return;
    attempts.push(attempt);
  };
  push({});
  if (advertised) push({ reasoningEffort: advertised });
  if (opts.preferOff) push({ purpose: "session-title" });
  return attempts;
}
function isUnsupportedEffort(error) {
  if (!error || typeof error !== "object") return false;
  const row = error;
  const hay = `${row.code || ""} ${row.message || ""}`;
  if (/UNSUPPORTED_REASONING_EFFORT|does not support reasoning effort|不支持.*推理|不支持.*思考/i.test(hay)) {
    return true;
  }
  return row.cause ? isUnsupportedEffort(row.cause) : false;
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
    "\u4F60\u662F\u4E13\u4E1A\u516C\u6587\u5199\u4F5C\u79D8\u4E66\u3002\u6839\u636E\u5149\u6807\u524D\u7684\u4E0A\u4E0B\u6587\uFF0C\u7ACB\u523B\u8F93\u51FA\u7EED\u5199\u6B63\u6587\u3002",
    "\u5FC5\u987B\u628A\u7EED\u5199\u5199\u5728\u53EF\u89C1\u6B63\u6587\u91CC\uFF0C\u4E0D\u8981\u53EA\u5728\u601D\u8003\u8FC7\u7A0B\u4E2D\u5199\u3002\u4E0D\u8981\u8F93\u51FA\u601D\u8003\u8FC7\u7A0B\u3002",
    "\u7981\u6B62\uFF1A\u6807\u9898\u3001\u89E3\u91CA\u3001\u91CD\u590D\u4E0A\u6587\u3001\u91CD\u590D\u6807\u70B9\u3001Markdown\u3001\u5BF9\u8BDD\u8154\u3001\u5F15\u53F7\u5305\u88F9\u3001\u7F16\u53F7\u5217\u8868\u3002",
    "\u957F\u5EA6 8\u201340 \u5B57\u3002\u81EA\u7136\u8854\u63A5\u4E0A\u6587\uFF0C\u7B26\u5408\u673A\u5173\u516C\u6587\u7528\u8BCD\u3002",
    "\u82E5\u4E0A\u6587\u4EE5\u4E0D\u5B8C\u6574\u7684\u53E5\u5B50\u7ED3\u5C3E\uFF0C\u5FC5\u987B\u5148\u628A\u8BE5\u53E5\u8865\u5B8C\u6574\uFF0C\u518D\u89C6\u60C5\u51B5\u7EED\u5199\u3002",
    `\u5F53\u524D\u6587\u4F53\uFF1A${styleGuide(input.docType)}`,
    title ? `\u516C\u6587\u6807\u9898\uFF1A${title}` : "",
    intent ? `\u5199\u4F5C\u610F\u56FE\uFF1A${intent}` : ""
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
function extractGhostFromReasoning(raw) {
  const cleaned = cleanModelText(raw).replace(/\s+/g, " ").trim();
  if (!cleaned) return "";
  const quoted = cleaned.match(/[「“"]([^」”"]{8,80})[」”"]/);
  if (quoted?.[1]) return quoted[1].trim();
  const sentences = cleaned.split(/(?<=[。！？；])/).map((item) => item.trim()).filter((item) => item.length >= 8);
  const last = sentences.at(-1) || cleaned;
  return last.slice(0, 60);
}

// src/shared/local.ts
function isLocalRoute(provider, providerName = "") {
  const hay = `${provider} ${providerName}`.toLowerCase();
  return /ollama|vllm|lm[- ]?studio|localai|localhost|127\.0\.0\.1|\blocal\b|gguf|llama\.cpp|kobold|openvino/.test(
    hay
  );
}

// src/tests/shared.test.ts
test("normalizeDocType never falls through", () => {
  assert.equal(normalizeDocType("notice_letter"), "notice_letter");
  assert.equal(normalizeDocType("notice"), "notice_letter");
  assert.equal(normalizeDocType("report"), "research");
  assert.equal(normalizeDocType("totally-unknown"), "general");
  assert.equal(normalizeDocType(void 0), "general");
});
test("styleGuide always returns a non-empty brief", () => {
  assert.ok(styleGuide("notice_letter").length > 10);
  assert.ok(styleGuide("nope").includes("\u901A\u7528\u673A\u5173\u516C\u6587"));
});
test("locate uses context, not stale offsets", () => {
  const text = "\u73B0\u5C06\u6709\u5173\u60C5\u51B5\u62A5\u544A\u5982\u4E0B\u3002\n\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002\n\u7279\u6B64\u901A\u77E5\u3002";
  const range = locateInText(text, {
    type: "typo",
    original: "\u8D2F\u5F7B\u6267\u884C",
    context: "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002",
    start: 999,
    end: 1e3
  });
  assert.ok(range);
  assert.equal(text.slice(range.start, range.end), "\u8D2F\u5F7B\u6267\u884C");
});
test("locate never expands to the whole context span", () => {
  const text = "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u5E76\u6293\u597D\u843D\u5B9E\u3002";
  const range = locateInText(text, {
    type: "polish",
    original: "\u8D2F\u5F7B\u6267\u884C",
    context: "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u5E76\u6293\u597D\u843D\u5B9E\u3002",
    start: 0
  });
  assert.ok(range);
  assert.equal(text.slice(range.start, range.end), "\u8D2F\u5F7B\u6267\u884C");
  assert.notEqual(text.slice(range.start, range.end), "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u5E76\u6293\u597D\u843D\u5B9E\u3002");
});
test("locate ignores bogus model offsets and uses the first original", () => {
  const text = "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002\u968F\u540E\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002";
  const range = locateInText(text, {
    type: "typo",
    original: "\u8D2F\u5F7B\u6267\u884C",
    context: "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002",
    start: 999
  });
  assert.ok(range);
  assert.equal(range.start, text.indexOf("\u8D2F\u5F7B\u6267\u884C"));
});
test("locate prefers the occurrence nearest a real previous offset", () => {
  const text = "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002\u968F\u540E\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002";
  const second = text.lastIndexOf("\u8D2F\u5F7B\u6267\u884C");
  const range = locateInText(text, {
    type: "typo",
    original: "\u8D2F\u5F7B\u6267\u884C",
    start: second
  });
  assert.ok(range);
  assert.equal(range.start, second);
});
test("insert locates by preceding context", () => {
  const text = "\u4F1A\u8BAE\u6307\u51FA\u5DE5\u4F5C\u8FDB\u5C55\u987A\u5229\u3002\u4E0B\u4E00\u6B65\u5C06\u7EC6\u5316\u5206\u5DE5\u3002";
  const range = locateInText(text, {
    type: "insert",
    original: "",
    context: "\u5DE5\u4F5C\u8FDB\u5C55\u987A\u5229\u3002"
  });
  assert.ok(range);
  const applied = applyIssueToText(text, {
    type: "insert",
    original: "",
    context: "\u5DE5\u4F5C\u8FDB\u5C55\u987A\u5229\u3002",
    suggestion: "\u5404\u8D23\u4EFB\u5355\u4F4D\u8981\u5012\u6392\u5DE5\u671F\u3002"
  });
  assert.ok(applied);
  assert.match(applied.text, /顺利。各责任单位/);
});
test("relocateIssues drops vanished originals", () => {
  const kept = relocateIssues("\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002", [
    {
      id: "1",
      type: "typo",
      original: "\u8D2F\u5F7B\u6267\u884C",
      suggestion: "\u6293\u597D\u843D\u5B9E",
      reason: "\u66F4\u5E84\u91CD",
      context: "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002",
      start: 0,
      end: 0
    },
    {
      id: "2",
      type: "polish",
      original: "\u4E0D\u5B58\u5728\u7684\u53E5\u5B50",
      suggestion: "x",
      reason: "x",
      context: "\u4E0D\u5B58\u5728\u7684\u53E5\u5B50",
      start: 0,
      end: 0
    }
  ]);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, "1");
});
test("parseJsonObject degrades through fences and braces", () => {
  const fenced = parseJsonObject('\u8BF4\u660E\u5982\u4E0B\n```json\n{"suggestions":[]}\n```');
  assert.deepEqual(fenced, { suggestions: [] });
  const noisy = parseJsonObject('\u597D\u7684\u3002{"suggestions":[{"type":"typo"}]} \u5B8C\u6BD5');
  assert.equal(noisy.suggestions.length, 1);
  assert.throws(() => parseJsonObject("\u4E0D\u662F json"));
});
test("cleanModelText strips wrappers", () => {
  assert.equal(cleanModelText("```\n\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002\n```"), "\u8BF7\u8BA4\u771F\u8D2F\u5F7B\u6267\u884C\u3002");
  assert.equal(cleanModelText("\u300C\u8BF7\u4E88\u590D\u51FD\u300D"), "\u8BF7\u4E88\u590D\u51FD");
});
test("extractGhostFromReasoning keeps a quoted continuation", () => {
  assert.equal(
    extractGhostFromReasoning("\u53EF\u4EE5\u7EED\u5199\u4E3A\u300C\u73B0\u5C31\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B\u3002\u300D\u7136\u540E\u7ED3\u675F\u3002"),
    "\u73B0\u5C31\u6709\u5173\u4E8B\u9879\u901A\u77E5\u5982\u4E0B\u3002"
  );
});
test("autocomplete prompt forbids extras", () => {
  const prompt = autocompleteSystem({ docType: "notice", title: "\u901A\u77E5" });
  assert.match(prompt, /立刻输出续写/);
  assert.match(prompt, /通知/);
});
test("local route detection", () => {
  assert.equal(isLocalRoute("ollama", "Ollama"), true);
  assert.equal(isLocalRoute("deepseek-official", "DeepSeek"), false);
  assert.equal(isLocalRoute("openai", "vLLM OpenAI-compatible"), true);
});
test("pickOffEffort prefers true off over low", () => {
  assert.equal(
    pickOffEffort([
      { id: "low", name: "Low" },
      { id: "high", name: "High" },
      { id: "off", name: "Off" }
    ]),
    "off"
  );
  assert.equal(pickOffEffort([{ id: "low", name: "Low" }, { id: "high", name: "High" }]), void 0);
  assert.equal(
    resolveEffort({ requested: "high", efforts: [{ id: "off", name: "Off" }, { id: "high", name: "High" }] }),
    "high"
  );
  assert.equal(resolveEffort({ preferOff: true, efforts: [{ id: "low", name: "Low" }] }), void 0);
  assert.equal(resolveEffort({ preferOff: true, efforts: [] }), void 0);
  assert.equal(
    isUnsupportedEffort({
      code: "UNSUPPORTED_REASONING_EFFORT",
      message: 'provider x model y does not support reasoning effort "off"'
    }),
    true
  );
  const deepseek = streamAttempts({
    preferOff: true,
    efforts: [
      { id: "off", name: "Off" },
      { id: "high", name: "High" }
    ]
  });
  assert.equal(deepseek[0]?.reasoningEffort, void 0);
  assert.equal(deepseek[1]?.reasoningEffort, "off");
  const noReasoning = streamAttempts({ preferOff: true, efforts: [] });
  assert.deepEqual(noReasoning[0], {});
  assert.ok(noReasoning.some((item) => item.purpose === "session-title"));
});
//# sourceMappingURL=shared.test.js.map
