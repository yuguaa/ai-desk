export type ImageAttachment = {
  id: string;
  name: string;
  type: "image";
  data: string;
  mimeType: string;
};

export type FileAttachment = {
  id: string;
  name: string;
  type: "file";
  content: string;
  size: number;
};

export type Attachment = ImageAttachment | FileAttachment;

export const MAX_ATTACHMENT_COUNT = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function mimeTypeFromExtension(name: string) {
  const extension = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];
  return extension ? EXTENSION_MIME_TYPES[extension] : undefined;
}

export function isImageFile(file: File) {
  return IMAGE_MIME_TYPES.includes(file.type) || IMAGE_EXTENSIONS.some((extension) => file.name.toLowerCase().endsWith(extension));
}

export function isImageAttachment(attachment: Attachment): attachment is ImageAttachment {
  return attachment.type === "image";
}

export function validateImageAttachments(images: ImageAttachment[]) {
  if (images.length > MAX_ATTACHMENT_COUNT) throw new Error(`每条消息最多添加 ${MAX_ATTACHMENT_COUNT} 张图片`);
  let total = 0;
  for (const image of images) {
    if (!IMAGE_MIME_TYPES.includes(image.mimeType) || !image.data || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(image.data)) {
      throw new Error("图片格式无效，仅支持 PNG、JPEG、WebP 和 GIF");
    }
    const bytes = image.data.length / 4 * 3 - (image.data.endsWith("==") ? 2 : image.data.endsWith("=") ? 1 : 0);
    if (bytes > MAX_IMAGE_BYTES) throw new Error(`${image.name} 超过单张 10 MB 限制`);
    total += bytes;
    /* 校验文件签名，不能只相信扩展名或剪贴板提供的 MIME。 */
    const signature = atob(image.data.slice(0, 16));
    const valid = image.mimeType === "image/png" ? signature.startsWith("\x89PNG\r\n\x1a\n")
      : image.mimeType === "image/jpeg" ? signature.startsWith("\xff\xd8\xff")
      : image.mimeType === "image/gif" ? /^GIF8[79]a/.test(signature)
      : signature.startsWith("RIFF") && signature.slice(8, 12) === "WEBP";
    if (!valid) throw new Error(`${image.name} 的图片内容与格式不匹配`);
  }
  if (total > MAX_TOTAL_IMAGE_BYTES) throw new Error("每条消息图片总大小不能超过 20 MB");
}

export function validateAttachments(attachments: Attachment[]) {
  if (attachments.length > MAX_ATTACHMENT_COUNT) throw new Error(`每条消息最多添加 ${MAX_ATTACHMENT_COUNT} 个附件`);
  validateImageAttachments(attachments.filter(isImageAttachment));
}

/* 图片走视觉输入，其余文件按 UTF-8 文本读取；二进制文件快速失败。 */
export function readAttachments(files: File[]) {
  if (files.length > MAX_ATTACHMENT_COUNT) return Promise.reject(new Error(`每条消息最多添加 ${MAX_ATTACHMENT_COUNT} 个附件`));
  return Promise.all(files.map((file) => isImageFile(file) ? readImageFile(file) : readTextFile(file)))
    .then((attachments) => { validateAttachments(attachments); return attachments; });
}

function readImageFile(file: File): Promise<ImageAttachment> {
  const mimeType = file.type || mimeTypeFromExtension(file.name) || "";
  if (!file.size || file.size > MAX_IMAGE_BYTES) {
    return Promise.reject(new Error(`${file.name} 无法添加：仅支持不超过 10 MB 的 PNG、JPEG、WebP、GIF 图片`));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取图片 ${file.name}`));
    reader.onabort = () => reject(new Error(`图片读取已取消：${file.name}`));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ id: crypto.randomUUID(), name: file.name || "粘贴的图片", type: "image", data: result.slice(result.indexOf(",") + 1), mimeType });
    };
    reader.readAsDataURL(file);
  });
}

function readTextFile(file: File): Promise<FileAttachment> {
  if (!file.size) return Promise.reject(new Error(`${file.name} 是空文件，无法作为附件`));
  if (file.size > MAX_FILE_BYTES) return Promise.reject(new Error(`${file.name} 超过单文件 1 MB 限制`));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取文件 ${file.name}`));
    reader.onabort = () => reject(new Error(`文件读取已取消：${file.name}`));
    reader.onload = () => {
      let content: string;
      try {
        content = new TextDecoder("utf-8", { fatal: true }).decode(reader.result as ArrayBuffer);
      } catch {
        reject(new Error(`${file.name} 是二进制文件，仅支持文本文件和图片`));
        return;
      }
      resolve({ id: crypto.randomUUID(), name: file.name || "未命名文件", type: "file", content, size: file.size });
    };
    reader.readAsArrayBuffer(file);
  });
}

export function imageContents(images: ImageAttachment[]) {
  return images.map(({ type, data, mimeType }) => ({ type, data, mimeType }));
}

/* 文件内容拼进发送正文，正文与附件块之间用空行分隔。 */
export function appendFileContents(text: string, files: FileAttachment[]) {
  const blocks = files.map((file) => `<file name="${file.name}">\n${file.content}\n</file>`);
  return [text.trim(), ...blocks].filter(Boolean).join("\n\n");
}
