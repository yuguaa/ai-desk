import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForAppUpdate } from "@/lib/app-update";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("app update check", () => {
  it("reports a newer published release", () => {
    const request = vi.fn(() => Promise.resolve(releaseResponse("v0.1.7")));
    vi.stubGlobal("fetch", request);

    return checkForAppUpdate("0.1.6").then((result) => {
      expect(result).toEqual({
        currentVersion: "0.1.6",
        latestVersion: "0.1.7",
        updateAvailable: true,
      });
      expect(request).toHaveBeenCalledWith(
        "https://api.github.com/repos/yuguaa/ai-desk/releases/latest",
        expect.objectContaining({ cache: "no-store", headers: expect.any(Object) }),
      );
    });
  });

  it.each(["0.1.6", "0.1.8"])("treats current version %s as up to date", (currentVersion) => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(releaseResponse("v0.1.6"))));

    return checkForAppUpdate(currentVersion).then((result) => {
      expect(result.updateAvailable).toBe(false);
    });
  });

  it("rejects a release with an invalid version tag", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(releaseResponse("nightly"))));

    return expect(checkForAppUpdate("0.1.6")).rejects.toThrow("最新版本信息格式无效");
  });

  it("rejects a failed GitHub release request", () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 403 }))));

    return expect(checkForAppUpdate("0.1.6")).rejects.toThrow("检查更新失败（HTTP 403）");
  });
});

function releaseResponse(tagName: string) {
  return new Response(JSON.stringify({ tag_name: tagName }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
