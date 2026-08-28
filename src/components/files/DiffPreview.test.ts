import { describe, expect, it } from "vitest";
import { parseDiff } from "@/components/files/DiffPreview";

describe("parseDiff", () => {
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
});
