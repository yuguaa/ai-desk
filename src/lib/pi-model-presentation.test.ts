import { describe, expect, it } from "vitest";
import { contextUsageLabel, piModelDescription, piModelKey, piModelName, piModelStatusLabel, thinkingLevelDescription, thinkingLevelLabel } from "@/lib/pi-model-presentation";

describe("Pi model presentation", () => {
  it("formats model identity consistently", () => {
    const model = { id: "gpt-5.4", provider: "openai", name: "GPT-5.4" };

    expect(piModelKey(model)).toBe("openai/gpt-5.4");
    expect(piModelName(model)).toBe("GPT-5.4");
    expect(piModelDescription(model)).toBe("openai · gpt-5.4");
    expect(piModelStatusLabel(model)).toBe("openai/GPT-5.4");
  });

  it("maps ChatGPT-style thinking labels and keeps unknown levels readable", () => {
    expect(thinkingLevelLabel("off")).toBe("即时");
    expect(thinkingLevelLabel("medium")).toBe("中等");
    expect(thinkingLevelLabel("xhigh")).toBe("极高");
    expect(thinkingLevelDescription("high")).toContain("深入推理");
    expect(thinkingLevelLabel("extra_high")).toBe("Extra High");
  });

  it("formats context usage for the composer footer", () => {
    expect(contextUsageLabel({ tokens: 0, contextWindow: 1_000_000, percent: 0 })).toBe("上下文 0/1M · 0%");
    expect(contextUsageLabel({ tokens: 60_000, contextWindow: 200_000, percent: 30 })).toBe("上下文 60K/200K · 30%");
    expect(contextUsageLabel({ tokens: null, contextWindow: 1_000_000, percent: null })).toBe("上下文 --/1M · --");
    expect(contextUsageLabel(null)).toBe("上下文 --");
  });
});
