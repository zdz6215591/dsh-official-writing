// src/tests/marks.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { Schema } from "@tiptap/pm/model";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { splitBlock } from "@tiptap/pm/commands";

// src/shared/locate.ts
function firstDiffSpan(from, to) {
  if (!from || from === to) return null;
  let start = 0;
  const maxStart = Math.min(from.length, to.length);
  while (start < maxStart && from[start] === to[start]) start += 1;
  let fromEnd = from.length;
  let toEnd = to.length;
  while (fromEnd > start && toEnd > start && from[fromEnd - 1] === to[toEnd - 1]) {
    fromEnd -= 1;
    toEnd -= 1;
  }
  return { start, end: fromEnd, insert: to.slice(start, toEnd) };
}
function tightenIssueSpan(issue2) {
  if (issue2.type === "insert") return issue2;
  const original = issue2.original ?? "";
  const suggestion = issue2.suggestion ?? "";
  const span = firstDiffSpan(original, suggestion);
  if (!span || span.end - span.start <= 0) return issue2;
  if (span.end - span.start >= original.length) return issue2;
  return {
    ...issue2,
    original: original.slice(span.start, span.end),
    suggestion: span.insert
  };
}
function locateInText(text, issue2) {
  const type = issue2.type;
  const context = issue2.context ?? "";
  const original = issue2.original ?? "";
  if (type === "insert") {
    if (context) {
      const idx2 = indexOfNeedle(text, context, issue2.start);
      if (idx2 >= 0) return { start: idx2, end: idx2 + context.length };
    }
    return null;
  }
  if (!original) return null;
  if (context) {
    const ctxIdx = indexOfNeedle(text, context, issue2.start);
    if (ctxIdx >= 0) {
      const rel = context.indexOf(original);
      if (rel >= 0) return { start: ctxIdx + rel, end: ctxIdx + rel + original.length };
      const inner = text.indexOf(original, ctxIdx);
      if (inner >= 0 && inner <= ctxIdx + context.length) {
        return { start: inner, end: inner + original.length };
      }
    }
  }
  if (original.length < 4) return null;
  const idx = indexOfNeedle(text, original, issue2.start);
  if (idx >= 0) return { start: idx, end: idx + original.length };
  return null;
}
function visualMarkRange(text, issue2) {
  const loc = locateInText(text, issue2);
  if (!loc) return null;
  if (issue2.type === "insert") return loc;
  const original = issue2.original ?? "";
  const suggestion = issue2.suggestion ?? "";
  const span = firstDiffSpan(original, suggestion);
  if (!span || span.end <= span.start) return loc;
  if (span.end - span.start >= original.length) return loc;
  return { start: loc.start + span.start, end: loc.start + span.end };
}
function indexOfNeedle(text, needle, hint) {
  if (!needle) return -1;
  if (typeof hint === "number" && hint >= 0 && text.slice(hint, hint + needle.length) === needle) {
    return hint;
  }
  return text.indexOf(needle);
}

// src/client/extensions/docText.ts
function getDocPlainText(doc) {
  const map = [];
  let text = "";
  let first = true;
  doc.descendants((node, pos) => {
    if (node.isBlock && node.isTextblock) {
      if (!first) {
        text += "\n";
        map.push(-1);
      }
      first = false;
    }
    if (node.isText && node.text) {
      for (let i = 0; i < node.text.length; i++) {
        map.push(pos + i);
        text += node.text[i];
      }
    }
    return true;
  });
  return { text, map };
}
function plainCaretToPos(doc, caret) {
  let i = 0;
  let found = 1;
  let first = true;
  let done = false;
  doc.descendants((node, pos) => {
    if (done) return false;
    if (node.isBlock && node.isTextblock) {
      if (!first) {
        if (caret <= i) {
          found = pos;
          done = true;
          return false;
        }
        i += 1;
      }
      first = false;
    }
    if (node.isText && node.text) {
      const len = node.text.length;
      if (caret <= i + len) {
        found = pos + (caret - i);
        done = true;
        return false;
      }
      i += len;
    }
    return true;
  });
  if (!done) found = Math.max(1, Math.min(doc.content.size, found));
  return found;
}
function markSliceValid(doc, issue2) {
  if (typeof issue2.from !== "number" || typeof issue2.to !== "number") return false;
  if (issue2.from < 1 || issue2.to > doc.content.size || issue2.from >= issue2.to) return false;
  if (issue2.type === "insert") return true;
  const slice = String(doc.textBetween(issue2.from, issue2.to, "\n", "") || "");
  if (!slice) return false;
  const original = issue2.original || "";
  const expected = String(tightenIssueSpan(issue2).original || original);
  return slice === expected || slice === original;
}
function pinIssuesToDoc(doc, issues) {
  const { text } = getDocPlainText(doc);
  const next = [];
  for (const issue2 of issues) {
    if (typeof issue2.from === "number" && typeof issue2.to === "number" && markSliceValid(doc, issue2)) {
      next.push(issue2);
      continue;
    }
    const loc = visualMarkRange(text, issue2);
    if (!loc) continue;
    const from = plainCaretToPos(doc, loc.start);
    const to = plainCaretToPos(doc, loc.end);
    if (from < 1 || to > doc.content.size || from >= to) continue;
    const probe = { ...issue2, from, to };
    if (!markSliceValid(doc, probe)) continue;
    next.push({ ...issue2, start: loc.start, end: loc.end, from, to });
  }
  return next;
}
function mapPinnedIssue(issue2, mapping, docSize) {
  if (typeof issue2.from !== "number" || typeof issue2.to !== "number") return null;
  const from = mapping.map(issue2.from, 1);
  const to = mapping.map(issue2.to, -1);
  if (from < 1 || to > docSize || from >= to) return null;
  return { ...issue2, from, to };
}

// src/tests/marks.test.ts
var schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      toDOM() {
        return ["p", 0];
      }
    },
    text: { group: "inline" }
  }
});
function issue(partial) {
  return {
    type: "polish",
    reason: "test",
    context: partial.context || "",
    start: -1,
    end: -1,
    ...partial
  };
}
function paragraphDoc(text) {
  return schema.node("doc", null, [schema.node("paragraph", null, text ? [schema.text(text)] : [])]);
}
function posOf(doc, needle) {
  let found = -1;
  doc.descendants((node, pos) => {
    if (found >= 0 || !node.isText || !node.text) return true;
    const at = node.text.indexOf(needle);
    if (at >= 0) found = pos + at;
    return true;
  });
  return found;
}
test("plainCaretToPos pins \u624B\u63E1 not \u4E13", () => {
  const source = "\u4F18\u9009\u624B\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE\uFF0C\u5B9E\u73B0\u6559\u5B66\u4E0E\u5B9E\u8DF5\u7684\u8D44\u6E90\u4E92\u901A\u3002";
  const doc = paragraphDoc(source);
  const text = source;
  const start = text.indexOf("\u624B\u63E1");
  const from = plainCaretToPos(doc, start);
  const to = plainCaretToPos(doc, start + 2);
  assert.equal(doc.textBetween(from, to, "\n", ""), "\u624B\u63E1");
  const zhuan = text.indexOf("\u4E13");
  assert.notEqual(from, plainCaretToPos(doc, zhuan));
});
test("markSliceValid rejects a one-character slice of a longer original", () => {
  const source = "\u4F18\u9009\u624B\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE";
  const doc = paragraphDoc(source);
  const zhuan = posOf(doc, "\u4E13");
  assert.equal(
    markSliceValid(doc, issue({ id: "bad", original: "\u624B\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE", suggestion: "\u638C\u63E1", from: zhuan, to: zhuan + 1 })),
    false
  );
});
test("split paragraph maps the pinned mark, does not jump to \u5173\u4E8E", () => {
  const source = "\u5173\u4E8E\u4FC3\u8FDB\u79D1\u6280\u6210\u679C\u8F6C\u5316\u3002\u5B9A\u4E3A4\u67083\u65E5\u4E0A\u53489\u70B9\u4E8E\u7EFC\u5408\u697C\u53EC\u5F00\u3002";
  const doc = paragraphDoc(source);
  const pinned = pinIssuesToDoc(doc, [
    issue({
      id: "yu",
      original: "\u4E0A\u53489\u70B9\u4E8E\u7EFC\u5408\u697C",
      suggestion: "\u4E0A\u53489:00\u5728\u7EFC\u5408\u697C",
      context: "\u5B9A\u4E3A4\u67083\u65E5\u4E0A\u53489\u70B9\u4E8E\u7EFC\u5408\u697C\u53EC\u5F00\u3002"
    })
  ]);
  assert.equal(pinned.length, 1);
  assert.equal(doc.textBetween(pinned[0].from, pinned[0].to, "\n", ""), "\u70B9\u4E8E");
  let state = EditorState.create({ schema, doc });
  const splitAt = posOf(state.doc, "\u5B9A\u4E3A");
  assert.ok(splitAt > 0);
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, splitAt)));
  let mapped = null;
  const ok = splitBlock(state, (tr) => {
    mapped = mapPinnedIssue(pinned[0], tr.mapping, tr.doc.content.size);
    state = state.apply(tr);
  });
  assert.equal(ok, true);
  assert.ok(mapped);
  assert.equal(state.doc.textBetween(mapped.from, mapped.to, "\n", ""), "\u70B9\u4E8E");
  assert.ok(state.doc.textBetween(0, mapped.from, "\n", "").includes("\u5173\u4E8E"));
  assert.notEqual(state.doc.textBetween(mapped.from, mapped.to, "\n", ""), "\u4E8E");
});
test("already pinned short \u4E8E stays on 9\u70B9\u4E8E after a split before it", () => {
  const source = "\u5173\u4E8E\u4FC3\u8FDB\u79D1\u6280\u6210\u679C\u8F6C\u5316\u3002\u5B9A\u4E3A4\u67083\u65E5\u4E0A\u53489\u70B9\u4E8E\u7EFC\u5408\u697C\u53EC\u5F00\u3002";
  const doc = paragraphDoc(source);
  const at = posOf(doc, "9\u70B9\u4E8E") + 2;
  const pinned = issue({
    id: "yu",
    original: "\u4E8E",
    suggestion: "\u5728",
    context: "\u4E0A\u53489\u70B9\u4E8E\u7EFC\u5408\u697C",
    from: at,
    to: at + 1
  });
  assert.equal(doc.textBetween(at, at + 1, "\n", ""), "\u4E8E");
  assert.equal(doc.textBetween(posOf(doc, "\u5173\u4E8E") + 1, posOf(doc, "\u5173\u4E8E") + 2, "\n", ""), "\u4E8E");
  let state = EditorState.create({ schema, doc });
  state = state.apply(state.tr.setSelection(TextSelection.create(state.doc, posOf(state.doc, "\u5B9A\u4E3A"))));
  splitBlock(state, (tr) => {
    const mapped = mapPinnedIssue(pinned, tr.mapping, tr.doc.content.size);
    assert.ok(mapped);
    assert.equal(tr.doc.textBetween(mapped.from, mapped.to, "\n", ""), "\u4E8E");
    assert.ok(tr.doc.textBetween(0, mapped.from, "\n", "").includes("\u5173\u4E8E"));
    assert.match(tr.doc.textBetween(Math.max(1, mapped.from - 4), mapped.from, "\n", ""), /点$/);
  });
});
test("mapPinnedIssue only moves positions after the split", () => {
  const mapped = mapPinnedIssue(
    issue({ id: "a", original: "\u4E8E", suggestion: "\u5728", from: 40, to: 41 }),
    {
      map(pos) {
        return pos >= 20 ? pos + 2 : pos;
      }
    },
    80
  );
  assert.deepEqual({ from: mapped?.from, to: mapped?.to }, { from: 42, to: 43 });
  const beforeSplit = mapPinnedIssue(
    issue({ id: "b", original: "\u4E8E", suggestion: "\u5728", from: 8, to: 9 }),
    {
      map(pos) {
        return pos >= 20 ? pos + 2 : pos;
      }
    },
    80
  );
  assert.deepEqual({ from: beforeSplit?.from, to: beforeSplit?.to }, { from: 8, to: 9 });
});
//# sourceMappingURL=marks.test.js.map
