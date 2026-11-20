import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { loadEnvFile } from "node:process";
import fs from "node:fs/promises";
loadEnvFile(".env");
let cookies: { name: string; value: string; domain: string; path: string }[] =
    [],
  projectId: string,
  logout: () => Promise<unknown>;
test.beforeAll(async () => {
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { persistSession: false } },
  );
  const {
    data: { users },
  } = await admin.auth.admin.listUsers();
  const owner = users.find(
    (u) =>
      u.email_confirmed_at &&
      process.env.APP_OWNER_EMAILS!.split(",").includes(u.email!),
  );
  if (!owner) throw Error("需要先完成授权账号登录");
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: owner.email!,
  });
  if (error) throw Error("测试会话创建失败");
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookies,
        setAll(values) {
          for (const v of values) {
            cookies = cookies.filter((c) => c.name !== v.name);
            cookies.push({
              name: v.name,
              value: v.value,
              domain: "localhost",
              path: "/",
            });
          }
        },
      },
    },
  );
  const { error: sessionError } = await client.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  });
  if (sessionError) throw Error("测试会话验证失败");
  logout = () => client.auth.signOut({ scope: "local" });
  projectId =
    process.env.E2E_PROJECT_ID ||
    JSON.parse(await fs.readFile(".local/integration-state.json", "utf8"))
      .projectId;
});
test.afterAll(async () => {
  await logout?.();
});
test.beforeEach(async ({ context, page }) => {
  await context.addCookies(cookies);
  page.on("requestfailed", (r) =>
    console.log(
      "Request failed",
      new URL(r.url()).hostname,
      r.failure()?.errorText,
    ),
  );
});
test("home and projects render reference layout and open existing canvas", async ({
  page,
}) => {
  await page.goto("/protected", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: "Lovart 让设计更简单" }),
  ).toBeVisible();
  await expect(page.getByRole("textbox", { name: "生图提示词" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "最近项目" })).toBeVisible();
  await page.screenshot({
    path: "docs/images/setup/app-home.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("link", { name: "查看全部" }).click();
  await expect(page).toHaveURL(/\/projects$/);
  await page.screenshot({
    path: "docs/images/setup/app-projects.png",
    fullPage: true,
    caret: "initial",
  });
  await page
    .locator(`a.project-card[href="/canvas?projectId=${projectId}"]`)
    .click();
  await expect(page).toHaveURL(new RegExp(projectId));
  await expect(page.getByAltText("生成结果", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("生成结果", { exact: true })
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
});
test("canvas configuration, reference selection, width bounds and screenshots", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/canvas?projectId=${projectId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByAltText("生成结果", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("生成结果", { exact: true })
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
  await page.getByRole("button", { name: /[124]K · (1:1|16:9)/ }).click();
  await expect(
    page.getByRole("button", { name: "4K", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "2K", exact: true }).click();
  await page.getByRole("button", { name: "16:9", exact: true }).click();
  await expect(page.getByRole("button", { name: "2K · 16:9" })).toBeVisible();
  await page.screenshot({ path: "docs/images/setup/app-canvas-config.png" });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "参考图", exact: true }).click();
  await page.getByRole("button", { name: "从画布选择" }).click();
  await page.getByAltText("生成结果", { exact: true }).click();
  await expect(page.getByAltText("参考图", { exact: true })).toHaveCount(1);
  await page.getByTitle("移除参考图").click();
  await expect(page.getByAltText("参考图", { exact: true })).toHaveCount(0);
  const separator = page.getByRole("separator", { name: "调整对话面板宽度" });
  await separator.focus();
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "620");
  for (let i = 0; i < 20; i++) await page.keyboard.press("ArrowRight");
  await expect(separator).toHaveAttribute("aria-valuenow", "320");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", "420");
  await page.screenshot({ path: "docs/images/setup/app-canvas.png" });
  expect(errors).toEqual([]);
});
test("small screen switches between canvas and conversation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/canvas?projectId=${projectId}`, {
    waitUntil: "domcontentloaded",
  });
  await expect(page.getByRole("textbox", { name: "生图提示词" })).toBeVisible();
  await page.getByRole("button", { name: "画布", exact: true }).click();
  await expect(page.getByAltText("生成结果", { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page
        .getByAltText("生成结果", { exact: true })
        .evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({ path: "docs/images/setup/app-mobile.png" });
  await page.getByRole("button", { name: "对话", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "生图提示词" })).toBeVisible();
});

test("pointer resize and node movement persist across refresh", async ({
  page,
}) => {
  await page.goto(`/canvas?projectId=${projectId}`, {
    waitUntil: "domcontentloaded",
  });
  const image = page.getByAltText("生成结果", { exact: true });
  await expect(image).toBeVisible();
  const separator = page.getByRole("separator", { name: "调整对话面板宽度" });
  const handle = await separator.boundingBox();
  if (!handle) throw Error("missing resize handle");
  await page.mouse.move(handle.x + handle.width / 2, 200);
  await page.mouse.down();
  await page.mouse.move(handle.x - 500, 200, { steps: 8 });
  await page.mouse.up();
  await expect(separator).toHaveAttribute("aria-valuenow", "620");
  const before = await page.request.get(`/api/projects/${projectId}`);
  const prior = await before.json();
  const bounds = await image.boundingBox();
  if (!bounds) throw Error("missing image");
  const saved = page.waitForResponse(
    (r) =>
      r.url().endsWith(`/api/projects/${projectId}/canvas`) &&
      r.request().method() === "PUT" &&
      r.status() === 200,
  );
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + bounds.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bounds.x + bounds.width / 2 + 60,
    bounds.y + bounds.height / 2 + 80,
    { steps: 10 },
  );
  await page.mouse.up();
  await saved;
  const changed = await (
    await page.request.get(`/api/projects/${projectId}`)
  ).json();
  expect(changed.nodes[0].x).not.toBe(prior.nodes[0].x);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(separator).toHaveAttribute("aria-valuenow", "620");
  const restored = await (
    await page.request.get(`/api/projects/${projectId}`)
  ).json();
  expect(restored.nodes[0].x).toBe(changed.nodes[0].x);
  expect(restored.nodes[0].y).toBe(changed.nodes[0].y);
});
