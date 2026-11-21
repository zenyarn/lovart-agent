export const MARKDOWN_LIMIT = 256 * 1024;
export function readMarkdown(bytes: Uint8Array): string {
  if (!bytes.length || bytes.length > MARKDOWN_LIMIT)
    throw new Error("Markdown 文件应为 1 字节至 256 KiB");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (text.includes("\0")) throw new Error("Markdown 必须是 UTF-8 文本");
  return text;
}
export function attachmentName(name: string): string {
  return (
    (name.split(/[\\/]/).pop() || "attachment")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .slice(0, 255) || "attachment"
  );
}
