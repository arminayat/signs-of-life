import { test, expect } from "@playwright/test";
test("creates a project, saves its preferences and pauses notifications", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "A little closer to your products." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Project name" })
    .fill(`Orbit ${testInfo.project.name}`);
  await page
    .getByRole("textbox", { name: "Description" })
    .fill("A calmer way to keep up.");
  await page
    .getByRole("button", { name: "Create project", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `Orbit ${testInfo.project.name}`,
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("textbox", { name: "Timezone" }).fill("Europe/Berlin");
  await page.getByText("My Telegram", { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "My Telegram" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preferences saved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pause notifications" }).click();
  await expect(
    page.getByRole("button", { name: "Resume notifications" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await page
    .getByLabel("Connection", { exact: true })
    .selectOption({
      label: "Example organization / Example production · supabase",
    });
  await page
    .getByLabel("Supabase project", { exact: true })
    .selectOption({ label: "Example organization / Example production" });
  await page
    .getByRole("button", { name: "Add source", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.locator("main").getByText("Example production", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveJSProperty(
    "scrollWidth",
    await page.locator("body").evaluate((element) => element.clientWidth),
  );
  expect(errors).toEqual([]);
});
test("creates a pending email destination and shows its verification state", async ({
  page,
}, testInfo) => {
  await page.goto("/destinations");
  await page
    .getByRole("button", { name: "Add destination", exact: true })
    .click();
  await page.getByLabel("Channel", { exact: true }).selectOption("email");
  await page
    .getByRole("textbox", { name: "Destination name" })
    .fill(`Inbox ${testInfo.project.name}`);
  await page
    .getByRole("textbox", { name: "Email address" })
    .fill(`${testInfo.project.name}@example.test`);
  await page
    .getByRole("button", { name: "Send verification", exact: true })
    .click();
  await expect(
    page.getByText("Check your inbox and confirm your email address.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `Inbox ${testInfo.project.name}` }),
  ).toBeVisible();
  await expect(
    page.getByText("verification pending", { exact: true }).first(),
  ).toBeVisible();
});
test("opens accessible dialogs, switches themes and renders the dashboard without overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "New project", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.screenshot({
    path: `artifacts/dashboard-${testInfo.project.name}-dark.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use light theme" }).click();
  await page.screenshot({
    path: `artifacts/dashboard-${testInfo.project.name}-light.png`,
    fullPage: true,
  });
  const sizes = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
});
