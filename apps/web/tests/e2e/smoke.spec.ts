import { test, expect } from "@playwright/test";

test("login, create space, switch spaces, invite a member, capture and link notes", async ({ page }) => {
  const spaceName = `E2E Space ${Date.now()}`;

  await page.goto("/login");
  await page.getByPlaceholder("Email").fill("alice@mnemo.dev");
  await page.getByPlaceholder("Password").fill("mnemo-dev-password");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/spaces$/);

  await page.getByPlaceholder("New space name").fill(spaceName);
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("link", { name: new RegExp(spaceName) })).toBeVisible();

  await page.getByRole("link", { name: new RegExp(spaceName) }).click();
  await expect(page.getByRole("heading", { name: spaceName })).toBeVisible();

  // Switch to another space and back, proving the switcher navigates correctly.
  const switcher = page.getByRole("combobox", { name: "Switch space" });
  const otherOption = switcher.locator("option").nth(1);
  const otherLabel = await otherOption.textContent();
  await switcher.selectOption({ index: 1 });
  await expect(page.getByRole("heading", { name: otherLabel ?? "" })).toBeVisible();

  await page.goto("/spaces");
  await page.getByRole("link", { name: new RegExp(spaceName) }).click();

  // Capture two notes and confirm they appear in the space's knowledge list.
  await page.getByPlaceholder("Title").fill("Note One");
  await page.getByPlaceholder("Content").fill("First captured item.");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: /Note One/ })).toBeVisible();

  await page.getByPlaceholder("Title").fill("Note Two");
  await page.getByPlaceholder("Content").fill("Second captured item.");
  await page.getByRole("button", { name: "Add" }).click();
  await expect(page.getByRole("link", { name: /Note Two/ })).toBeVisible();

  // Open Note One, edit it, and link it to Note Two.
  await page.getByRole("link", { name: /Note One/ }).click();
  const titleInput = page.locator("input").first();
  await expect(titleInput).toHaveValue("Note One");
  await titleInput.fill("Note One (edited)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(titleInput).toHaveValue("Note One (edited)");

  await expect(page.getByText("Not linked to anything yet.")).toBeVisible();
  // Scoped by accessible name rather than by container: the picker now renders a
  // relation-type combobox alongside the item one (and one per existing link), so
  // getByRole("main").getByRole("combobox") is no longer unambiguous. This selector
  // had already been narrowed once before, when the persistent Sidebar's space
  // switcher first made the unscoped version ambiguous.
  await page.getByRole("combobox", { name: "Link to item" }).selectOption({ label: "Note Two" });
  await page.getByRole("combobox", { name: "Relation type" }).selectOption("references");
  await page.getByRole("button", { name: "Link" }).click();
  await expect(page.getByRole("link", { name: "Note Two" })).toBeVisible();

  // The graph page should render a canvas with both linked notes as nodes.
  const spaceUrl = page.url().replace(/\/items\/.*$/, "");
  await page.goto(`${spaceUrl}/graph`);
  await expect(page.locator("canvas")).toBeVisible();

  // Semantic search should surface Note Two as the top result for its own title.
  await page.goto(`${spaceUrl}/search`);
  await page.getByPlaceholder("Search this space's knowledge...").fill("Note Two");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: /Note Two/ }).first()).toBeVisible();

  await page.goto(spaceUrl);
  await page.getByPlaceholder("Invite by email (must already have an account)").fill("carol@mnemo.dev");
  await page.getByRole("button", { name: "Invite" }).click();
  await expect(page.getByText("carol@mnemo.dev")).toBeVisible();

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
