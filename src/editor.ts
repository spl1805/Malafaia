import landscapeSvg from "./assets/demo-landscape.svg?raw";

export type Tool =
  | "move"
  | "brush"
  | "eraser"
  | "text"
  | "rectangle"
  | "ellipse"
  | "crop"
  | "eyedropper"
  | "hand";
export type Layer = {
  id: string;
  name: string;
  kind: "image" | "paint" | "text" | "shape";
  canvas: HTMLCanvasElement;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  locked: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
};
export type Project = {
  name: string;
  width: number;
  height: number;
  layers: Layer[];
  selected: string;
};
export type SavedLayer = Omit<Layer, "canvas"> & { data: string };
export type SavedProject = Omit<Project, "layers"> & {
  version: 1;
  layers: SavedLayer[];
};
export type Point = { x: number; y: number };
export const uid = () => crypto.randomUUID();
export const clamp = (x: number, min: number, max: number) =>
  Math.min(max, Math.max(min, x));

export function surface(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}
export function makeLayer(
  name: string,
  canvas: HTMLCanvasElement,
  kind: Layer["kind"] = "paint",
): Layer {
  return {
    id: uid(),
    name,
    kind,
    canvas,
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height,
    opacity: 100,
    visible: true,
    locked: false,
    brightness: 100,
    contrast: 100,
    saturation: 100,
  };
}
export function blankProject(
  name: string,
  width: number,
  height: number,
  transparent = false,
): Project {
  const canvas = surface(width, height);
  if (!transparent) {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
  }
  const background = makeLayer("Fundo", canvas);
  return { name, width, height, layers: [background], selected: background.id };
}
export function drawProject(
  ctx: CanvasRenderingContext2D,
  project: Project,
  background?: string,
) {
  ctx.clearRect(0, 0, project.width, project.height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, project.width, project.height);
  }
  for (const layer of project.layers) {
    if (!layer.visible) continue;
    ctx.save();
    ctx.globalAlpha = layer.opacity / 100;
    ctx.filter = `brightness(${layer.brightness}%) contrast(${layer.contrast}%) saturate(${layer.saturation}%)`;
    ctx.drawImage(layer.canvas, layer.x, layer.y, layer.width, layer.height);
    ctx.restore();
  }
}
export function composite(project: Project, background?: string) {
  const canvas = surface(project.width, project.height);
  drawProject(canvas.getContext("2d")!, project, background);
  return canvas;
}
export function snapshot(project: Project): SavedProject {
  return {
    ...project,
    version: 1,
    layers: project.layers.map(({ canvas, ...layer }) => ({
      ...layer,
      data: canvas.toDataURL("image/png"),
    })),
  };
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("Não foi possível abrir esta imagem."));
    img.src = src;
  });
}
export async function restore(input: unknown): Promise<Project> {
  if (!input || typeof input !== "object")
    throw new Error("Arquivo de projeto inválido.");
  const data = input as SavedProject;
  if (
    data.version !== 1 ||
    typeof data.name !== "string" ||
    data.name.length > 200 ||
    !Number.isInteger(data.width) ||
    !Number.isInteger(data.height) ||
    data.width < 1 ||
    data.height < 1 ||
    data.width > 4096 ||
    data.height > 4096 ||
    data.width * data.height > 16_000_000 ||
    !Array.isArray(data.layers) ||
    !data.layers.length ||
    data.layers.length > 40
  )
    throw new Error(
      "Projeto inválido ou acima do limite de 4096 px / 16 megapixels.",
    );
  const ids = new Set<string>();
  const layers = await Promise.all(
    data.layers.map(async (layer) => {
      if (
        !layer ||
        typeof layer.id !== "string" ||
        ids.has(layer.id) ||
        typeof layer.name !== "string" ||
        typeof layer.data !== "string" ||
        !layer.data.startsWith("data:image/png;base64,") ||
        !["paint", "image", "text", "shape"].includes(layer.kind) ||
        ![
          layer.x,
          layer.y,
          layer.width,
          layer.height,
          layer.opacity,
          layer.brightness,
          layer.contrast,
          layer.saturation,
        ].every(Number.isFinite) ||
        layer.width <= 0 ||
        layer.height <= 0 ||
        layer.width > 16384 ||
        layer.height > 16384 ||
        layer.opacity < 0 ||
        layer.opacity > 100 ||
        layer.brightness < 0 ||
        layer.brightness > 200 ||
        layer.contrast < 0 ||
        layer.contrast > 200 ||
        layer.saturation < 0 ||
        layer.saturation > 200
      )
        throw new Error("O projeto contém uma camada inválida.");
      ids.add(layer.id);
      const img = await loadImage(layer.data);
      if (img.width * img.height > 16_000_000)
        throw new Error("Uma camada excede o limite de 16 megapixels.");
      const canvas = surface(img.width, img.height);
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      return {
        ...layer,
        visible: layer.visible !== false,
        locked: layer.locked === true,
        canvas,
      };
    }),
  );
  return {
    name: data.name,
    width: data.width,
    height: data.height,
    layers,
    selected: ids.has(data.selected) ? data.selected : layers.at(-1)!.id,
  };
}
export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
export function textLayer(
  text: string,
  color: string,
  size: number,
  font: string,
  bold: boolean,
): Layer {
  const measure = surface(1, 1).getContext("2d")!;
  measure.font = `${bold ? "700" : "400"} ${size}px ${font}`;
  const lines = text.split("\n").slice(0, 20);
  const canvas = surface(
    Math.min(
      4096,
      Math.max(...lines.map((line) => measure.measureText(line).width)) +
        size * 0.5,
    ),
    Math.min(4096, lines.length * size * 1.25 + size * 0.4),
  );
  const ctx = canvas.getContext("2d")!;
  ctx.font = measure.font;
  ctx.fillStyle = color;
  ctx.textBaseline = "top";
  lines.forEach((line, i) =>
    ctx.fillText(line, size * 0.15, i * size * 1.25 + size * 0.12),
  );
  return makeLayer(text.split("\n")[0].slice(0, 24) || "Texto", canvas, "text");
}
export async function demoProject(): Promise<Project> {
  const width = 1440,
    height = 1000;
  const canvas = surface(width, height);
  const ctx = canvas.getContext("2d")!;
  try {
    const img = await loadImage(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(landscapeSvg)}`,
    );
    const ratio = Math.max(width / img.width, height / img.height);
    ctx.drawImage(
      img,
      (width - img.width * ratio) / 2,
      (height - img.height * ratio) / 2,
      img.width * ratio,
      img.height * ratio,
    );
  } catch {
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#b0bba6");
    gradient.addColorStop(0.4, "#455f57");
    gradient.addColorStop(1, "#162c2c");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#293e36";
    ctx.beginPath();
    ctx.moveTo(0, 650);
    ctx.lineTo(650, 120);
    ctx.lineTo(1100, 650);
    ctx.lineTo(1440, 210);
    ctx.lineTo(1440, 1000);
    ctx.lineTo(0, 1000);
    ctx.fill();
  }
  const photo = makeLayer("Paisagem · Montanhas", canvas, "image");
  const overlayCanvas = surface(width, height);
  const shade = overlayCanvas.getContext("2d")!;
  const gradient = shade.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "rgba(9,22,22,.12)");
  gradient.addColorStop(0.45, "rgba(9,22,22,.07)");
  gradient.addColorStop(1, "rgba(9,22,22,.85)");
  shade.fillStyle = gradient;
  shade.fillRect(0, 0, width, height);
  const overlay = makeLayer("Luz e profundidade", overlayCanvas, "shape");
  const title = textLayer(
    "O mundo pede\numa pausa.",
    "#fffaf0",
    112,
    "Georgia, serif",
    false,
  );
  title.x = 86;
  title.y = 610;
  const detailCanvas = surface(width, height);
  const detail = detailCanvas.getContext("2d")!;
  detail.fillStyle = "#fffaf0";
  detail.font = "500 19px sans-serif";
  detail.fillText("L U G A R E S   Q U E   I N S P I R A M", 104, 97);
  detail.strokeStyle = "#fffaf0";
  detail.lineWidth = 1.5;
  detail.strokeRect(1180, 58, 156, 48);
  detail.font = "16px sans-serif";
  detail.fillText("COLEÇÃO  01", 1202, 88);
  detail.font = "17px sans-serif";
  detail.fillText("UM ESTUDO DA NATUREZA", 104, 937);
  detail.fillText("LUME STUDIO / 01", 1150, 937);
  detail.fillRect(104, 573, 54, 3);
  const details = makeLayer("Detalhes editoriais", detailCanvas, "text");
  return {
    name: "Um lugar para respirar",
    width,
    height,
    layers: [photo, overlay, title, details],
    selected: title.id,
  };
}
const DB_NAME = "lume-studio";
async function database() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("projects");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function persist(data: SavedProject) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(data, "current");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function recover(): Promise<SavedProject | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const req = db
        .transaction("projects")
        .objectStore("projects")
        .get("current");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
