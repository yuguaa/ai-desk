import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiffPreview, parseDiff } from "@/components/files/DiffPreview";

describe("parseDiff", () => {
  it("大段替换不反复移动删除队列，跨 hunk 保留剩余删除行", () => {
    const count = 2000;
    const content = [
      `@@ -1,${count} +1,${count - 1} @@`,
      ...Array.from({ length: count }, (_, index) => `-old-${index}`),
      ...Array.from({ length: count - 1 }, (_, index) => `+new-${index}`),
      "@@ -3000 +3000 @@", "+tail",
    ].join("\n");
    const shift = Array.prototype.shift;
    let shifts = 0;
    /*
     * mock 内部也使用 shift，直接计数避免递归进入 mock。
     */
    Array.prototype.shift = function () {
      shifts++;
      return shift.call(this);
    };
    let rows: ReturnType<typeof parseDiff>;
    try {
      rows = parseDiff(content);
    } finally {
      Array.prototype.shift = shift;
    }
    expect(rows).toHaveLength(count + 1);
    expect(rows[0]).toEqual({ leftNumber: 1, rightNumber: 1, left: "old-0", right: "new-0" });
    expect(rows[count - 1]).toEqual({ leftNumber: count, rightNumber: null, left: `old-${count - 1}`, right: null });
    expect(rows[count]).toEqual({ leftNumber: null, rightNumber: 3000, left: null, right: "tail" });
    expect(shifts).toBe(0);
  });

  it("按 hunk 对齐上下文、删除和新增行", () => {
    const rows = parseDiff([
      "diff --git a/src/App.tsx b/src/App.tsx",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1,4 +1,4 @@",
      " const app = true;",
      "-const oldValue = 1;",
      "+const newValue = 2;",
      " export default app;",
    ].join("\n"));

    expect(rows).toEqual([
      { leftNumber: 1, rightNumber: 1, left: "const app = true;", right: "const app = true;" },
      { leftNumber: 2, rightNumber: 2, left: "const oldValue = 1;", right: "const newValue = 2;" },
      { leftNumber: 3, rightNumber: 3, left: "export default app;", right: "export default app;" },
    ]);
  });

  it("不会把 hunk 中以三个连字符开头的内容当作 diff 头", () => {
    const rows = parseDiff(["@@ -1 +1 @@", "---- old", "+--- new"].join("\n"));

    expect(rows).toEqual([{ leftNumber: 1, rightNumber: 1, left: "--- old", right: "--- new" }]);
  });

  it("删除队列耗尽后仍能配对后续删除，并在上下文处清空队列", () => {
    const rows = parseDiff(["@@ -1,4 +1,4 @@", "+added", "-old", "+new", "-removed", " context", "+tail"].join("\n"));
    expect(rows).toEqual([
      { leftNumber: null, rightNumber: 1, left: null, right: "added" },
      { leftNumber: 1, rightNumber: 2, left: "old", right: "new" },
      { leftNumber: 2, rightNumber: null, left: "removed", right: null },
      { leftNumber: 3, rightNumber: 3, left: "context", right: "context" },
      { leftNumber: null, rightNumber: 4, left: null, right: "tail" },
    ]);
  });

  it("在左右 diff 列中自动折行，不强制横向滚动", () => {
    const html = renderToStaticMarkup(createElement(DiffPreview, { path: "src/App.tsx", content: ["@@ -1 +1 @@", `-${"x".repeat(180)}`, `+${"y".repeat(180)}`].join("\n") }));

    expect(html).toContain("overflow-x-hidden");
    expect(html).toContain("[overflow-wrap:anywhere]");
    expect(html).not.toContain("min-w-[620px]");
  });
});
