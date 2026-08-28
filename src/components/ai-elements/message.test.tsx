import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageResponse } from "@/components/ai-elements/message";

describe("MessageResponse", () => {
  it("使用 Streamdown 渲染 Markdown 结构", () => {
    const html = renderToStaticMarkup(
      <MessageResponse>{"## 标题\n\n**重点**\n\n- 第一项\n- 第二项\n\n```ts\nconst ready = true;\n```"}</MessageResponse>,
    );

    expect(html).toContain("<h2");
    expect(html).toContain('data-streamdown="strong">重点</span>');
    expect(html).toContain("<ul");
    expect(html).toContain("<code");
    expect(html).toContain('data-animate-icon="true"');
  });

  it("流式阶段补全未闭合的 Markdown", () => {
    const html = renderToStaticMarkup(<MessageResponse isAnimating>{"正在生成 **重点"}</MessageResponse>);

    expect(html).toContain('data-streamdown="strong">重点</span>');
    expect(html).toContain("--streamdown-caret");
  });

  it("代码块复制按钮中的图标保持居中", () => {
    const stylesheet = readFileSync(new URL("../../index.css", import.meta.url), "utf8");
    const copyButtonRule = stylesheet.match(
      /\.streamdown-message \[data-streamdown="code-block-copy-button"\] \{([^}]*)\}/,
    )?.[1];

    expect(copyButtonRule).toContain("display: inline-flex");
    expect(copyButtonRule).toContain("align-items: center");
    expect(copyButtonRule).toContain("justify-content: center");
    expect(copyButtonRule).toContain("line-height: 1");
  });
});
