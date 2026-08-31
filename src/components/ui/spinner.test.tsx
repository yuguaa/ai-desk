import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("使用稳定方形盒并与相邻文字共用紧凑基线", () => {
    const html = renderToStaticMarkup(<Spinner />);

    expect(html).toContain("self-center");
    expect(html).toContain("align-middle");
    expect(html).toContain("leading-none");
  });
});
