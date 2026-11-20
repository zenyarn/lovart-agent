import { it, expect } from "vitest";
import { isOwnerEmail, safeReturnPath, isPublicAddress } from "../security";
it("requires explicit owner email and rejects missing owner", () => {
  expect(isOwnerEmail("A@EXAMPLE.COM", "a@example.com")).toBe(true);
  expect(isOwnerEmail("a@example.com", "")).toBe(false);
  expect(isOwnerEmail("evil@example.com", "a@example.com")).toBe(false);
});
it("rejects offsite auth redirect", () => {
  expect(safeReturnPath("//evil.test")).toBe("/protected");
  expect(safeReturnPath("/canvas?projectId=x")).toBe("/canvas?projectId=x");
  expect(safeReturnPath("/\\evil.test")).toBe("/protected");
});
it("blocks private and mapped addresses", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "::ffff:127.0.0.1",
    "192.168.1.1",
  ])
    expect(isPublicAddress(ip)).toBe(false);
  expect(isPublicAddress("8.8.8.8")).toBe(true);
});

it("accepts both configured accounts but not partial matches", () => {
  const emails = "owner@example.com, second@example.com";
  expect(isOwnerEmail("OWNER@example.com", emails)).toBe(true);
  expect(isOwnerEmail("second@example.com", emails)).toBe(true);
  expect(isOwnerEmail("ner@example.com", emails)).toBe(false);
});
