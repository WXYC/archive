import { test, expect } from "@playwright/test";

test.describe("Archive Player", () => {
  test("should load and display date selector", async ({ page }) => {
    await page.goto("/");

    // Check for the card title (CardTitle is a div, not a heading)
    await expect(page.getByText("WXYC Archive Player")).toBeVisible();

    // Check for date selector label
    await expect(page.getByText("Select Date")).toBeVisible();
  });

  test("should display hour selector dropdown", async ({ page }) => {
    await page.goto("/");

    // Check for hour selector
    await expect(page.getByText("Select Hour")).toBeVisible();
    await expect(page.getByRole("combobox")).toBeVisible();
  });

  test("should change hour selection", async ({ page }) => {
    await page.goto("/");

    // Click the hour dropdown
    await page.getByRole("combobox").click();

    // Select 3:00 PM (hour 15)
    await page.getByRole("option", { name: "3:00 PM" }).click();

    // Verify selection changed
    await expect(page.getByRole("combobox")).toContainText("3:00 PM");
  });

  test("should show play button", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: /play/i })).toBeVisible();
  });

  test("should toggle to pause button when clicked", async ({ page }) => {
    await page.goto("/");

    // Click play
    await page.getByRole("button", { name: /play/i }).click();

    // Should now show pause
    await expect(page.getByRole("button", { name: /pause/i })).toBeVisible();
  });

  test("should update URL when date changes", async ({ page }) => {
    await page.goto("/");

    // Wait for page to initialize (CardTitle is a div, not a heading)
    await expect(page.getByText("WXYC Archive Player")).toBeVisible();

    // The URL should contain timestamp parameter after initialization
    await expect(page).toHaveURL(/\?t=\d{14}/);
  });
});

test.describe("Authentication", () => {
  test("should show DJ Sign In button when not logged in", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("button", { name: /dj sign in/i })).toBeVisible();
  });

  test("should open login dialog when clicking sign in", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /dj sign in/i }).click();

    // Dialog should be visible with title
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.locator('[data-slot="dialog-title"]')).toContainText("DJ Sign In");
  });

  test("should show login form fields", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /dj sign in/i }).click();

    // Check for form fields
    await expect(page.getByLabel(/username or email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  });

  test("should close dialog when clicking outside or pressing escape", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /dj sign in/i }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Press escape
    await page.keyboard.press("Escape");

    // Dialog should be closed
    await expect(page.getByRole("dialog")).not.toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/");

    await page.getByRole("button", { name: /dj sign in/i }).click();

    // Fill in invalid credentials
    await page.getByLabel(/username or email/i).fill("invaliduser");
    await page.getByLabel(/password/i).fill("wrongpassword");

    // Submit
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Should show an error (actual error message depends on backend)
    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Theme Toggle", () => {
  test("should have theme toggle button", async ({ page }) => {
    await page.goto("/");

    // Theme toggle button should be visible (has sun/moon icon)
    await expect(page.getByRole("button", { name: /toggle theme/i })).toBeVisible();
  });
});

test.describe("Mobile Responsiveness", () => {
  test("should show date picker popover on mobile", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    // On mobile, the calendar is in a popover with a button trigger
    const dateButton = page.getByRole("button", { name: /january|february|march|april|may|june|july|august|september|october|november|december/i });
    await expect(dateButton).toBeVisible();
  });
});

test.describe("Selected Archive Display", () => {
  test("should display selected archive info", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Selected Archive")).toBeVisible();
  });
});
