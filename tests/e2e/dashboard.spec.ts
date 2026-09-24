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
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.locator(".shell")).toHaveClass(/project-shell/);
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("link", { name: "Notifications" })
    .click();
  await page.getByRole("button", { name: "Notification preferences" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("textbox", { name: "Timezone" }).fill("Europe/Berlin");
  await page.getByText("My Telegram", { exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "My Telegram" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Preferences saved." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Notification preferences" }).click();
  await expect(
    page.getByRole("checkbox", { name: "My Telegram" }),
  ).toBeChecked();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Pause notifications" }).click();
  await expect(
    page.getByRole("button", { name: "Resume notifications" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("link", { name: "Sources", exact: true })
    .click();
  await page.reload();
  await expect(
    page
      .getByRole("navigation", { name: "Project navigation" })
      .getByRole("link", { name: "Sources", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await page.getByLabel("Connection", { exact: true }).selectOption({
    label: "Example organization",
  });
  await page
    .getByLabel("Supabase project", { exact: true })
    .selectOption({ label: "Example production" });
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
  await page
    .getByRole("navigation", { name: "Project navigation" })
    .getByRole("link", { name: "Overview" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Initial downloads", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Connect App Store Connect to see daily downloads."),
  ).toBeVisible();
  await page.getByRole("link", { name: "All projects", exact: true }).click();
  await expect(page.locator(".shell")).not.toHaveClass(/project-shell/);
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
    .fill(`${testInfo.project.name}-${crypto.randomUUID()}@example.test`);
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

test("shows collected project KPIs and accessible chart values", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("link")
    .filter({
      has: page.getByRole("heading", { name: "Clearspace", exact: true }),
    })
    .click();
  await expect(
    page.getByRole("img", { name: /^Initial downloads/ }),
  ).toBeVisible();
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "New accounts" })
      .locator(".stat-value"),
  ).toHaveText("1");
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Initial downloads" })
      .locator(".stat-value"),
  ).toHaveText("12");
  await expect(
    page
      .locator(".stat")
      .filter({ hasText: "Redownloads" })
      .locator(".stat-value"),
  ).toHaveText("3");
  const chart = page.locator(".project-chart").filter({
    has: page.getByRole("heading", {
      name: "Initial downloads",
      exact: true,
    }),
  });
  await chart.getByText("View daily values").click();
  await expect(
    chart.getByRole("cell", { name: "0", exact: true }),
  ).toBeVisible();
  await expect(
    chart.getByRole("cell", { name: "12", exact: true }),
  ).toBeVisible();
  await expect(
    chart.getByRole("cell", { name: "No data", exact: true }),
  ).toHaveCount(28);
  const sizes = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
});
