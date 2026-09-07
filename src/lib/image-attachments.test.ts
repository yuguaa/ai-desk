// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { imageContents, MAX_IMAGE_BYTES, readImageFiles, validateImageAttachments, type ImageAttachment } from "@/lib/image-attachments";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZe0AAAAASUVORK5CYII=";
const image: ImageAttachment = { id: "one", name: "one.png", type: "image", mimeType: "image/png", data: png };

describe("image attachments", () => {
  it("读取真实图片，RPC 内容不携带客户端标识和文件名", async () => {
    const files = [new File([Uint8Array.from(atob(png), (value) => value.charCodeAt(0))], "one.png", { type: "image/png" })];
    const images = await readImageFiles(files);
    expect(images[0]).toMatchObject({ name: "one.png", mimeType: "image/png", data: png });
    expect(imageContents(images)).toEqual([{ type: "image", mimeType: "image/png", data: png }]);
  });

  it("拒绝伪装图片、空文件、不支持格式和超限文件", async () => {
    await expect(readImageFiles([new File(["text"], "fake.png", { type: "image/png" })])).rejects.toThrow("不匹配");
    await expect(readImageFiles([new File([], "empty.png", { type: "image/png" })])).rejects.toThrow("无法添加");
    await expect(readImageFiles([new File(["<svg/>"], "vector.svg", { type: "image/svg+xml" })])).rejects.toThrow("无法添加");
    await expect(readImageFiles([new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" })])).rejects.toThrow("10 MB");
  });

  it("校验合并后的数量、总大小和原生截图数据格式", () => {
    expect(() => validateImageAttachments(Array(6).fill(image))).toThrow("5 张");
    expect(() => validateImageAttachments([{ ...image, data: "https://example.com/image.png" }])).toThrow("格式无效");
    const large = { ...image, data: btoa("\x89PNG\r\n\x1a\n" + "x".repeat(8 * 1024 * 1024)) };
    expect(() => validateImageAttachments([large, large, large])).toThrow("20 MB");
  });
});
