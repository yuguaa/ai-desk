// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { appendFileContents, imageContents, MAX_FILE_BYTES, MAX_IMAGE_BYTES, readAttachments, validateImageAttachments, type FileAttachment, type ImageAttachment } from "@/lib/attachments";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZe0AAAAASUVORK5CYII=";
const image: ImageAttachment = { id: "one", name: "one.png", type: "image", mimeType: "image/png", data: png };

describe("readAttachments", () => {
  it("图片走视觉输入，RPC 内容不携带客户端标识和文件名", async () => {
    const files = [new File([Uint8Array.from(atob(png), (value) => value.charCodeAt(0))], "one.png", { type: "image/png" })];
    const attachments = await readAttachments(files);
    expect(attachments[0]).toMatchObject({ name: "one.png", type: "image", mimeType: "image/png", data: png });
    expect(imageContents([attachments[0] as ImageAttachment])).toEqual([{ type: "image", mimeType: "image/png", data: png }]);
  });

  it("文本文件按 UTF-8 读取内容", async () => {
    const attachments = await readAttachments([new File(["const a = 1;\n"], "demo.ts", { type: "text/plain" })]);
    expect(attachments[0]).toMatchObject({ name: "demo.ts", type: "file", content: "const a = 1;\n", size: 13 });
  });

  it("图片扩展名在 MIME 缺失时也能识别为图片", async () => {
    const attachments = await readAttachments([new File([Uint8Array.from(atob(png), (value) => value.charCodeAt(0))], "one.png", { type: "" })]);
    expect(attachments[0]).toMatchObject({ type: "image", mimeType: "image/png" });
  });

  it("二进制文件快速失败，不支持的类型给出明确提示", async () => {
    await expect(readAttachments([new File([new Uint8Array([0x00, 0xff, 0xfe, 0x01])], "video.bin", { type: "application/octet-stream" })])).rejects.toThrow("二进制文件");
    await expect(readAttachments([new File([], "empty.txt", { type: "text/plain" })])).rejects.toThrow("空文件");
    await expect(readAttachments([new File([new Uint8Array(MAX_FILE_BYTES + 1)], "large.txt", { type: "text/plain" })])).rejects.toThrow("1 MB");
  });

  it("拒绝伪装图片、空文件和超限图片；非图片扩展名按文本读取", async () => {
    await expect(readAttachments([new File(["text"], "fake.png", { type: "image/png" })])).rejects.toThrow("不匹配");
    await expect(readAttachments([new File([], "empty.png", { type: "image/png" })])).rejects.toThrow("无法添加");
    await expect(readAttachments([new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" })])).rejects.toThrow("10 MB");
    const svg = await readAttachments([new File(["<svg/>"], "vector.svg", { type: "image/svg+xml" })]);
    expect(svg[0]).toMatchObject({ type: "file", name: "vector.svg", content: "<svg/>" });
  });

  it("超过附件数量上限立即拒绝", async () => {
    const files = Array.from({ length: 6 }, () => new File(["x"], "f.txt", { type: "text/plain" }));
    await expect(readAttachments(files)).rejects.toThrow("5 个附件");
  });
});

describe("validateImageAttachments", () => {
  it("校验合并后的数量、总大小和原生截图数据格式", () => {
    expect(() => validateImageAttachments(Array(6).fill(image))).toThrow("5 张");
    expect(() => validateImageAttachments([{ ...image, data: "https://example.com/image.png" }])).toThrow("格式无效");
    const large = { ...image, data: btoa("\x89PNG\r\n\x1a\n" + "x".repeat(8 * 1024 * 1024)) };
    expect(() => validateImageAttachments([large, large, large])).toThrow("20 MB");
  });
});

describe("appendFileContents", () => {
  const file: FileAttachment = { id: "f1", name: "demo.ts", type: "file", content: "const a = 1;", size: 13 };

  it("正文为空时仅输出文件块", () => {
    expect(appendFileContents("", [file])).toBe('<file name="demo.ts">\nconst a = 1;\n</file>');
  });

  it("正文与文件块用空行分隔，多个文件顺序拼接", () => {
    const second: FileAttachment = { ...file, id: "f2", name: "b.md", content: "# hi" };
    expect(appendFileContents("  检查  ", [file, second])).toBe(
      '检查\n\n<file name="demo.ts">\nconst a = 1;\n</file>\n\n<file name="b.md">\n# hi\n</file>',
    );
  });
});
