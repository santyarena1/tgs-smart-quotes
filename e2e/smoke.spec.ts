import { expect, test } from "@playwright/test";
import { apiBaseUrl, getCredentials, webBaseUrl } from "./helpers/env";

test.describe("smoke", () => {
  test.beforeAll(async ({ request }) => {
    try {
      const webRes = await fetch(webBaseUrl, { redirect: "follow" });
      if (!webRes.ok) {
        throw new Error(`HTTP ${webRes.status}`);
      }
    } catch (err) {
      throw new Error(
        `El servidor web no está disponible en ${webBaseUrl}. ` +
          "Levantá api+web antes de correr E2E (ver docs/E2E.md). " +
          `Detalle: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const health = await request.get(`${apiBaseUrl}/health`);
    if (!health.ok()) {
      throw new Error(
        `La API no responde en ${apiBaseUrl}/health (HTTP ${health.status()}). ` +
          "Levantá la API en el puerto 3001 antes de correr E2E (ver docs/E2E.md).",
      );
    }
  });

  test("login, dashboard y navegación a Presupuestos", async ({ page }) => {
    const { username, password } = getCredentials();

    await page.goto("/");

    await expect(page.locator("#login-user")).toBeVisible({ timeout: 20_000 });
    await page.locator("#login-user").fill(username);
    await page.locator("#login-pass").fill(password);
    await page.getByRole("button", { name: "Ingresar" }).click();

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText("The Gamer Shop")).toBeVisible();

    await page.getByRole("navigation", { name: "Principal" }).getByRole("button", {
      name: "Presupuestos",
    }).click();

    await expect(page.getByRole("heading", { name: "Presupuestos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "+ Nuevo presupuesto" })).toBeVisible();
    await expect(
      page.getByPlaceholder("Buscar por número, nombre, cliente o producto"),
    ).toBeVisible();
    await expect(page.getByText("Total presupuestos")).toBeVisible();
  });
});
