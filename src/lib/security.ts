import ipaddr from "ipaddr.js";

export function isOwnerEmail(
  email: string | undefined,
  configured: string | undefined,
): boolean {
  if (!email || !configured) return false;
  const allowed = configured
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export function safeReturnPath(path: string | null | undefined): string {
  if (
    !path ||
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\x00-\x1f]/.test(path)
  )
    return "/protected";
  return path;
}

export function isPublicAddress(address: string): boolean {
  try {
    return ipaddr.process(address).range() === "unicast";
  } catch {
    return false;
  }
}
