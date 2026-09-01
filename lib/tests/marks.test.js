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

// src/client/extensions/docText.ts
function findNeedleInDoc(doc, needle, hintFrom) {
  if (!needle) return null;
  let best = null;
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    const text = node.textContent || "";
    let idx = text.indexOf(needle);
    while (idx >= 0) {
      const from = pos + 1 + idx;
      const to = from + needle.length;
      const dist = typeof hintFrom === "number" ? Math.abs(from - hintFrom) : 0;
      if (!best || dist < best.dist) best = { from, to, dist };
      if (typeof hintFrom !== "number") break;
      idx = text.indexOf(needle, idx + 1);
    }
    return false;
  });
  return best ? { from: best.from, to: best.to } : null;
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
function pinOne(doc, issue2) {
  if (issue2.type === "insert") {
    const found = findNeedleInDoc(doc, issue2.context || "");
    if (!found) return null;
    return { ...issue2, from: found.to, to: found.to };
  }
  const original = issue2.original || "";
  if (!original) return null;
  const full = findNeedleInDoc(doc, original);
  if (!full) return null;
  const tight = tightenIssueSpan(issue2);
  const fragment = String(tight.original || "");
  if (fragment && fragment !== original) {
    const inner = original.indexOf(fragment);
    if (inner >= 0) {
      const from = full.from + inner;
      const to = from + fragment.length;
      const probe = { ...issue2, from, to };
      if (markSliceValid(doc, probe)) return { ...issue2, from, to };
    }
  }
  return { ...issue2, from: full.from, to: full.to };
}
function pinIssuesToDoc(doc, issues) {
  const next = [];
  for (const issue2 of issues) {
    const pinned = pinOne(doc, { ...issue2, from: void 0, to: void 0 });
    if (pinned) next.push(pinned);
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
    heading: {
      content: "inline*",
      group: "block",
      attrs: { level: { default: 1 } },
      toDOM() {
        return ["h1", 0];
      }
    },
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
test("pinIssuesToDoc keeps a heading plus body original", () => {
  const title = "\u5173\u4E8E\u4EBA\u624D\u5DE5\u4F5C\u53CA\u57F9\u8BAD\u7684\u610F\u89C1\u5EFA\u8BAE";
  const body = "\u4F18\u9009\u624B\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE\uFF0C\u5B9E\u73B0\u6559\u5B66\u4E0E\u5B9E\u8DF5\u7684\u8D44\u6E90\u4E92\u901A\u3002";
  const doc = schema.node("doc", null, [
    schema.node("heading", { level: 1 }, [schema.text(title)]),
    schema.node("paragraph", null, [schema.text(body)])
  ]);
  const pinned = pinIssuesToDoc(doc, [
    issue({
      id: "shouwo",
      original: "\u4F18\u9009\u624B\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE",
      suggestion: "\u5EFA\u8BAE\u9080\u8BF7\u638C\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE"
    })
  ]);
  assert.equal(pinned.length, 1);
  const slice = doc.textBetween(pinned[0].from, pinned[0].to, "\n", "");
  assert.ok(slice.length >= 2);
  assert.ok("\u4F18\u9009\u624B\u63E1\u9879\u76EE\u8D44\u6E90\u3001\u4EA7\u4E1A\u7EBF\u7D22\u7684\u4E13\u5BB6\u6388\u8BFE".includes(slice));
  assert.notEqual(slice, "\u4E13");
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
