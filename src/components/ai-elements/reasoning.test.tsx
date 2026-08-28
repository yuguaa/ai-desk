import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Reasoning } from "@/components/ai-elements/reasoning";

describe("Reasoning", () => {
  it("占满对话内容列宽度", () => {
    const html = renderToStaticMarkup(<Reasoning content="分析内容" />);

    expect(html).toContain("w-full");
    expect(html).not.toContain("max-w-[72ch]");
  });
});
