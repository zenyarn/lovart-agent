import { isAlias, parseDocument, visit } from "yaml";
export const SKILL_LIMIT = 64 * 1024;
export type SkillInfo = { id: string; name: string; description: string };
export function parseSkill(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > SKILL_LIMIT)
    throw Error("SKILL.md 最大 64 KiB");
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (source.includes("\0")) throw Error("SKILL.md 必须是 UTF-8 文本");
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) throw Error("需要包含 name、description 的 YAML frontmatter");
  const doc = parseDocument(match[1]);
  if (doc.errors.length || doc.warnings.length)
    throw Error("frontmatter YAML 无效");
  visit(doc, (_, node) => {
    if (isAlias(node)) throw Error("frontmatter 不支持 YAML 别名");
  });
  const meta = doc.toJS({ maxAliasCount: 0 });
  if (!meta || typeof meta !== "object" || Array.isArray(meta))
    throw Error("frontmatter 必须是对象");
  if (
    typeof meta.name !== "string" ||
    meta.name.length > 64 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.name)
  )
    throw Error("技能名限 1–64 位小写字母、数字及单连字符");
  if (
    typeof meta.description !== "string" ||
    !meta.description.trim() ||
    meta.description.length > 2000
  )
    throw Error("description 应为 1–2000 字符");
  const body = source.slice(match[0].length);
  if (!body.trim()) throw Error("技能正文不能为空");
  return {
    name: meta.name as string,
    description: meta.description.trim() as string,
    body,
    source,
  };
}
