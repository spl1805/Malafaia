import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function start(page: Page, transparent = false) {
  await page.goto("/");
  await expect(page.getByLabel("Nome do projeto")).toHaveValue(
    "Um lugar para respirar",
  );
  await page.getByRole("button", { name: "Novo", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Nome do projeto", exact: true })
    .last()
    .fill("Teste Lume");
  await page.getByLabel("Largura (px)", { exact: true }).fill("400");
  await page.getByLabel("Altura (px)", { exact: true }).fill("300");
  if (transparent) await page.getByLabel("Fundo transparente").check();
  await page.getByRole("button", { name: "Criar documento" }).click();
  await expect(page.getByLabel("Nome do projeto", { exact: true })).toHaveValue(
    "Teste Lume",
  );
}
async function pixel(page: Page, x: number, y: number) {
  return page
    .locator("canvas.artwork-canvas")
    .evaluate(
      (el: HTMLCanvasElement, pos) =>
        Array.from(el.getContext("2d")!.getImageData(pos.x, pos.y, 1, 1).data),
      { x, y },
    );
}
async function drag(page: Page, a: [number, number], b: [number, number]) {
  const box = (await page.getByTestId("editor-canvas").boundingBox())!;
  const dimensions = await page
    .getByTestId("editor-canvas")
    .evaluate((el: HTMLCanvasElement) => ({ w: el.width, h: el.height }));
  await page.mouse.move(
    box.x + (a[0] / dimensions.w) * box.width,
    box.y + (a[1] / dimensions.h) * box.height,
  );
  await page.mouse.down();
  await page.mouse.move(
    box.x + (b[0] / dimensions.w) * box.width,
    box.y + (b[1] / dimensions.h) * box.height,
    { steps: 10 },
  );
  await page.mouse.up();
}

test("pincel e borracha alteram pixels; desfazer e refazer restauram a imagem", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await start(page, true);
  await page.getByRole("button", { name: "Pincel (B)", exact: true }).click();
  await drag(page, [80, 100], [200, 100]);
  expect(await pixel(page, 140, 100)).toEqual([248, 164, 97, 255]);
  await page
    .getByRole("button", { name: "Desfazer (Ctrl Z)", exact: true })
    .click();
  await expect.poll(() => pixel(page, 140, 100)).toEqual([0, 0, 0, 0]);
  await page
    .getByRole("button", { name: "Refazer (Ctrl Shift Z)", exact: true })
    .click();
  await expect.poll(() => pixel(page, 140, 100)).toEqual([248, 164, 97, 255]);
  await page.getByRole("button", { name: "Borracha (E)", exact: true }).click();
  await drag(page, [140, 80], [140, 120]);
  expect((await pixel(page, 140, 100))[3]).toBe(0);
  expect(errors).toEqual([]);
});

test("formas, visibilidade, duplicação e bloqueio de camadas funcionam", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Retângulo (U)", exact: true })
    .click();
  await drag(page, [60, 60], [160, 130]);
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Retângulo",
      exact: true,
    }),
  ).toBeVisible();
  expect(await pixel(page, 100, 90)).toEqual([248, 164, 97, 255]);
  await page
    .getByRole("button", { name: "Ocultar Retângulo", exact: true })
    .click();
  expect(await pixel(page, 100, 90)).toEqual([255, 255, 255, 255]);
  await page
    .getByRole("button", { name: "Mostrar Retângulo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Duplicar camada", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Retângulo · cópia",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bloquear Retângulo · cópia", exact: true })
    .click();
  await expect(page.getByLabel("Posição X", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Excluir camada", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Desbloqueie" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Desbloquear Retângulo · cópia", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Excluir camada", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Retângulo · cópia",
      exact: true,
    }),
  ).toHaveCount(0);
});

test("texto e ajustes são preservados ao salvar e reabrir o projeto", async ({
  page,
}) => {
  await start(page);
  await page.getByRole("button", { name: "Texto (T)", exact: true }).click();
  await page.getByTestId("editor-canvas").click({ position: { x: 30, y: 30 } });
  await page
    .getByLabel("Seu texto", { exact: true })
    .fill("Olá, criatividade!");
  await page
    .getByRole("button", { name: "Adicionar texto", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Olá, criatividade!",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("button", { name: "P&B", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Saturação", exact: true }),
  ).toHaveValue("0");
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Arquivo", exact: true }).click();
  await page.getByRole("button", { name: /Salvar projeto/ }).click();
  const file = await downloaded;
  const savedPath = (await file.path())!;
  const data = JSON.parse(await readFile(savedPath, "utf8"));
  expect(data.layers).toHaveLength(2);
  expect(data.layers[1].saturation).toBe(0);
  // Mutate the current project, then recover the saved version through the file picker.
  await page.getByRole("button", { name: "Original", exact: true }).click();
  await page
    .getByLabel("Abrir projeto Lume", { exact: true })
    .setInputFiles({
      name: "teste.lume",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await expect(
    page.getByRole("slider", { name: "Saturação", exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByText("Salvo neste navegador", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Nome do projeto", { exact: true })).toHaveValue(
    "Teste Lume",
  );
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Olá, criatividade!",
      exact: true,
    }),
  ).toBeVisible();
});

test("importa PNG, exporta PNG/JPEG e mantém as dimensões", async ({
  page,
}) => {
  await start(page);
  const png = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 60;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 60, 40);
    return c.toDataURL().split(",")[1];
  });
  await page
    .getByLabel("Importar imagens", { exact: true })
    .setInputFiles({
      name: "Vermelho.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Vermelho",
      exact: true,
    }),
  ).toBeVisible();
  expect(await pixel(page, 200, 150)).toEqual([255, 0, 0, 255]);
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  const downloadPng = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar PNG", exact: true }).click();
  const pngData = await readFile((await (await downloadPng).path())!);
  expect(pngData.readUInt32BE(16)).toBe(400);
  expect(pngData.readUInt32BE(20)).toBe(300);
  await page.getByRole("button", { name: "Exportar", exact: true }).click();
  await page.getByRole("button", { name: /JPEG Arquivo menor/ }).click();
  const downloadJpeg = page.waitForEvent("download");
  await page.getByRole("button", { name: "Baixar JPEG", exact: true }).click();
  const jpgData = await readFile((await (await downloadJpeg).path())!);
  expect(jpgData[0]).toBe(0xff);
  expect(jpgData[1]).toBe(0xd8);
  const size = await page.evaluate(async (base64) => {
    const img = new Image();
    img.src = "data:image/jpeg;base64," + base64;
    await img.decode();
    return [img.width, img.height];
  }, jpgData.toString("base64"));
  expect(size).toEqual([400, 300]);
});

test("recorte mantém as camadas e desfazer recupera o tamanho anterior", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Adicionar camada", exact: true })
    .click();
  await page.getByRole("button", { name: "Recortar (C)", exact: true }).click();
  await drag(page, [50, 50], [250, 200]);
  await page.getByRole("button", { name: "Aplicar", exact: true }).click();
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "width",
    "200",
  );
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "height",
    "150",
  );
  await expect(
    page.getByRole("button", { name: /^Selecionar camada/ }),
  ).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "width",
    "400",
  );
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "height",
    "300",
  );
});

test("rejeita projeto inválido sem substituir o documento atual", async ({
  page,
}) => {
  await start(page);
  await page
    .getByLabel("Abrir projeto Lume", { exact: true })
    .setInputFiles({
      name: "invalido.lume",
      mimeType: "application/json",
      buffer: Buffer.from('{"version":1,"width":99999,"layers":[]}'),
    });
  await expect(
    page.getByRole("status").filter({ hasText: "Projeto inválido" }),
  ).toBeVisible();
  await expect(page.getByLabel("Nome do projeto")).toHaveValue("Teste Lume");
  await expect(page.getByTestId("editor-canvas")).toHaveAttribute(
    "width",
    "400",
  );
});

test("mover, redimensionar, opacidade e brilho alteram apenas a camada escolhida", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Retângulo (U)", exact: true })
    .click();
  await drag(page, [60, 60], [160, 130]);
  await page.getByRole("button", { name: "Mover (V)", exact: true }).click();
  await drag(page, [100, 90], [150, 110]);
  expect(await pixel(page, 70, 70)).toEqual([255, 255, 255, 255]);
  expect(await pixel(page, 150, 110)).toEqual([248, 164, 97, 255]);
  await page.getByLabel("Largura da camada", { exact: true }).fill("200");
  await page.getByLabel("Largura da camada", { exact: true }).press("Tab");
  expect(await pixel(page, 260, 110)).toEqual([248, 164, 97, 255]);
  await page
    .getByRole("slider", { name: "Opacidade da camada", exact: true })
    .press("Home");
  expect(await pixel(page, 150, 110)).toEqual([255, 255, 255, 255]);
  await page
    .getByRole("slider", { name: "Opacidade da camada", exact: true })
    .press("End");
  await page.getByRole("button", { name: "Ajustes", exact: true }).click();
  await page.getByRole("slider", { name: "Brilho", exact: true }).press("Home");
  expect(await pixel(page, 150, 110)).toEqual([0, 0, 0, 255]);
  expect(await pixel(page, 20, 20)).toEqual([255, 255, 255, 255]);
  await page
    .getByRole("button", { name: "Desfazer (Ctrl Z)", exact: true })
    .click();
  await expect.poll(() => pixel(page, 150, 110)).toEqual([248, 164, 97, 255]);
});

test("interface móvel permite abrir camadas sem transbordamento horizontal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByTestId("editor-canvas")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "Mostrar ou ocultar camadas" })
    .click();
  await expect(
    page.getByRole("button", { name: "Adicionar camada", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Adicionar camada", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Selecionar camada Camada 5",
      exact: true,
    }),
  ).toBeVisible();
});
