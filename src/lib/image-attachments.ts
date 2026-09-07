export type ImageAttachment = {
  id: string;
  name: string;
  type: "image";
  data: string;
  mimeType: string;
};

export const MAX_IMAGE_COUNT = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;
export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function validateImageAttachments(images: ImageAttachment[]) {
  if (images.length > MAX_IMAGE_COUNT) throw new Error("每条消息最多添加 5 张图片");
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

export function readImageFiles(files: File[]) {
  if (files.length > MAX_IMAGE_COUNT) return Promise.reject(new Error("每条消息最多添加 5 张图片"));
  const invalid = files.find((file) => !IMAGE_MIME_TYPES.includes(file.type) || !file.size || file.size > MAX_IMAGE_BYTES);
  if (invalid) return Promise.reject(new Error(`${invalid.name} 无法添加：仅支持不超过 10 MB 的 PNG、JPEG、WebP、GIF 图片`));
  return Promise.all(files.map((file) => new Promise<ImageAttachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取图片 ${file.name}`));
    reader.onabort = () => reject(new Error(`图片读取已取消：${file.name}`));
    reader.onload = () => {
      const result = String(reader.result);
      resolve({ id: crypto.randomUUID(), name: file.name || "粘贴的图片", type: "image", data: result.slice(result.indexOf(",") + 1), mimeType: file.type });
    };
    reader.readAsDataURL(file);
  }))).then((images) => { validateImageAttachments(images); return images; });
}

export function imageContents(images: ImageAttachment[]) {
  return images.map(({ type, data, mimeType }) => ({ type, data, mimeType }));
}
