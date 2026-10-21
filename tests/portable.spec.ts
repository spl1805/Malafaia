import { test, expect } from "@playwright/test";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

test("o HTML portátil edita e exporta sem carregar recursos externos", async ({
  page,
  context,
}, testInfo) => {
  // Relocate just the HTML to prove it has no neighboring asset dependencies.
  const portable = testInfo.outputPath("downloaded", "Lume.html");
  await mkdir(dirname(portable), { recursive: true });
  await copyFile(resolve("releases/Lume.html"), portable);
  const errors: string[] = [];
  const externalRequests: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const fixtureUrl = "http://127.0.0.1:5173/__portable_test__/";
  // This cloud Chromium blocks all file:// navigation by administrator policy.
  // Fulfill only the initial document from disk; every other resource stays offline.
  await page.route(fixtureUrl, async (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: await readFile(portable, "utf8"),
    }),
  );
  page.on("request", (request) => {
    if (/^https?:/.test(request.url()) && request.url() !== fixtureUrl)
      externalRequests.push(request.url());
  });
  await context.setOffline(true);
  await page.goto(fixtureUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByLabel("Nome do projeto")).toHaveValue(
    "Um lugar para respirar",
  );
  await expect(
    page.getByRole("button", { name: /^Selecionar camada/ }),
  ).toHaveCount(4);
  await expect(
    page.getByText("Salvo neste navegador", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar camada", exact: true })
    .click();
  await page.getByRole("button", { name: "Pincel (B)", exact: true }).click();
  const box = (await page.getByTestId("editor-canvas").boundingBox())!;
  const x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.move(x - 30, y);
  await page.mouse.down();
  await page.mouse.move(x + 30, y, { steps: 8 });
  await page.mouse.up();
  const center = () =>
    page
      .locator("canvas.artwork-canvas")
      .evaluate((el: HTMLCanvasElement) =>
        Array.from(el.getContext("2d")!.getImageData(720, 500, 1, 1).data),
      );
  expect(await center()).toEqual([248, 164, 97, 255]);
  await page
    .getByRole("button", { name: "Desfazer (Ctrl Z)", exact: true })
    .click();
  await expect.poll(center).not.toEqual([248, 164, 97, 255]);
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PNG", exact: true }).click();
  const png = await readFile((await (await downloaded).path())!);
  expect(png.readUInt32BE(16)).toBe(1440);
  expect(png.readUInt32BE(20)).toBe(1000);
  expect(errors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
