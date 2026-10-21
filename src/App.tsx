import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  Aperture,
  ArrowDown,
  ArrowUp,
  Bold,
  Brush,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Crop,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FileImage,
  FilePlus2,
  FolderOpen,
  Hand,
  HelpCircle,
  ImagePlus,
  Layers,
  LockKeyhole,
  Maximize,
  Minus,
  MousePointer2,
  Pipette,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  Settings2,
  SlidersHorizontal,
  Square,
  Trash2,
  Type,
  Undo2,
  UnlockKeyhole,
  X,
  ZoomIn,
} from "lucide-react";
import {
  blankProject,
  clamp,
  composite,
  demoProject,
  download,
  drawProject,
  loadImage,
  makeLayer,
  persist,
  recover,
  restore,
  snapshot,
  surface,
  textLayer,
  uid,
  type Layer,
  type Point,
  type Project,
  type SavedProject,
  type Tool,
} from "./editor";

const tools = [
  { id: "move", name: "Mover", key: "V", icon: MousePointer2 },
  { id: "brush", name: "Pincel", key: "B", icon: Brush },
  { id: "eraser", name: "Borracha", key: "E", icon: Eraser },
  { id: "text", name: "Texto", key: "T", icon: Type },
  { id: "rectangle", name: "Retângulo", key: "U", icon: Square },
  { id: "ellipse", name: "Elipse", key: "O", icon: Circle },
  { id: "crop", name: "Recortar", key: "C", icon: Crop },
  { id: "eyedropper", name: "Conta-gotas", key: "I", icon: Pipette },
  { id: "hand", name: "Mão", key: "H", icon: Hand },
] as const;
const palette = [
  "#fffaf0",
  "#191e23",
  "#f8a461",
  "#e96a5b",
  "#ddbb72",
  "#8baf99",
  "#64b4c0",
  "#9a8ac4",
];
type Rect = { x: number; y: number; w: number; h: number };
type Gesture = {
  start: Point;
  last: Point;
  origin: Point;
  layer?: Layer;
  mode: Tool | "resize";
  changed: boolean;
  handle?: string;
  rect?: Rect;
};
type Modal = "new" | "export" | "text" | "help" | null;
const instructions: Record<Tool, string> = {
  move: "Arraste para mover a camada. Use as alças para redimensionar.",
  brush: "Pinte na camada selecionada. [ e ] ajustam o tamanho.",
  eraser: "Apague na camada selecionada, preservando a transparência.",
  text: "Clique na imagem para adicionar texto.",
  rectangle: "Arraste para desenhar. Segure Shift para um quadrado.",
  ellipse: "Arraste para desenhar. Segure Shift para um círculo.",
  crop: "Arraste uma área e pressione Enter para recortar. Esc cancela.",
  eyedropper: "Clique na imagem para capturar uma cor.",
  hand: "Arraste para navegar. Espaço ativa a mão temporariamente.",
};

function Thumb({ layer, tick }: { layer: Layer; tick: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 64, 48);
    const scale = Math.min(60 / layer.canvas.width, 44 / layer.canvas.height);
    ctx.drawImage(
      layer.canvas,
      (64 - layer.canvas.width * scale) / 2,
      (48 - layer.canvas.height * scale) / 2,
      layer.canvas.width * scale,
      layer.canvas.height * scale,
    );
  }, [layer, tick]);
  return <canvas ref={ref} width="64" height="48" aria-hidden="true" />;
}
function HexColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value.toUpperCase());
  useEffect(() => setDraft(value.toUpperCase()), [value]);
  const commit = () => {
    let hex = draft.trim();
    if (!hex.startsWith("#")) hex = "#" + hex;
    if (/^#[0-9a-f]{3}$/i.test(hex))
      hex =
        "#" +
        hex
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("");
    if (/^#[0-9a-f]{6}$/i.test(hex)) {
      onChange(hex.toLowerCase());
      setDraft(hex.toUpperCase());
    } else setDraft(value.toUpperCase());
  };
  return (
    <input
      aria-label="Código hexadecimal da cor"
      value={draft}
      maxLength={7}
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(value.toUpperCase());
          e.currentTarget.blur();
        }
      }}
    />
  );
}
function IconButton({
  label,
  children,
  active = false,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button${active ? " active" : ""}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}
function Dialog({
  title,
  subtitle,
  close,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  close: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const timer = setTimeout(
      () =>
        ref.current
          ?.querySelector<HTMLElement>(
            "input, textarea, select, button:not(.dialog-close)",
          )
          ?.focus(),
      30,
    );
    return () => {
      clearTimeout(timer);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="dialog-backdrop"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        className={`dialog${wide ? " wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            close();
          }
          if (e.key === "Tab") {
            const items = Array.from(
              ref.current!.querySelectorAll<HTMLElement>(
                "button:not(:disabled), input, select, textarea, a[href]",
              ),
            );
            const first = items[0],
              last = items.at(-1);
            if (e.shiftKey && document.activeElement === first) {
              e.preventDefault();
              last?.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <IconButton
          label="Fechar janela"
          onClick={close}
          className="icon-button dialog-close"
        >
          <X size={18} />
        </IconButton>
        <div className="dialog-eyebrow">LUME STUDIO</div>
        <h2 id="dialog-title">{title}</h2>
        {subtitle && <p className="dialog-subtitle">{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const [project, setProject] = useState<Project | null>(null);
  const current = useRef<Project | null>(null);
  const [tick, setTick] = useState(0);
  const [tool, setTool] = useState<Tool>("move");
  const [color, setColor] = useState("#f8a461");
  const [size, setSize] = useState(32);
  const [flow, setFlow] = useState(100);
  const [zoom, setZoom] = useState(0.5);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [space, setSpace] = useState(false);
  const [modal, setModal] = useState<Modal>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<"layers" | "adjustments">("layers");
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [saveState, setSaveState] = useState("Abrindo");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [crop, setCrop] = useState<Rect | null>(null);
  const [shape, setShape] = useState<Rect | null>(null);
  const [pointer, setPointer] = useState<Point | null>(null);
  const [newWidth, setNewWidth] = useState(1440);
  const [newHeight, setNewHeight] = useState(1000);
  const [newName, setNewName] = useState("Sem título");
  const [transparent, setTransparent] = useState(false);
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [quality, setQuality] = useState(92);
  const [text, setText] = useState("Sua ideia começa aqui.");
  const [fontSize, setFontSize] = useState(88);
  const [font, setFont] = useState("Georgia, serif");
  const [bold, setBold] = useState(false);
  const textPosition = useRef<Point>({ x: 100, y: 100 });
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectInput = useRef<HTMLInputElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const history = useRef<{ past: SavedProject[]; future: SavedProject[] }>({
    past: [],
    future: [],
  });
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const [mobilePanel, setMobilePanel] = useState(false);

  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4000);
  }, []);
  const fit = useCallback((p: Project = current.current!) => {
    if (!p || !stage.current) return;
    const bounds = stage.current.getBoundingClientRect();
    setZoom(
      clamp(
        Math.min(
          (bounds.width - (bounds.width < 600 ? 48 : 120)) / p.width,
          (bounds.height - 150) / p.height,
          1,
        ),
        0.03,
        4,
      ),
    );
    setPan({ x: 0, y: 0 });
  }, []);
  const save = useCallback((data: SavedProject) => {
    clearTimeout(saveTimer.current);
    setSaveState("Salvando…");
    saveTimer.current = setTimeout(() => {
      void persist(data)
        .then(() => setSaveState("Salvo neste navegador"))
        .catch(() => setSaveState("Salve uma cópia do projeto"));
    }, 650);
  }, []);
  const apply = useCallback(
    (next: Project, commit = true) => {
      current.current = next;
      setProject({ ...next });
      setTick((n) => n + 1);
      if (commit) {
        const data = snapshot(next);
        history.current.past.push(data);
        history.current.future = [];
        // Bound history by both count and encoded pixel data (approximately 48 MB).
        let total = 0;
        let keepFrom = history.current.past.length - 1;
        for (let i = history.current.past.length - 1; i >= 0; i--) {
          const bytes = history.current.past[i].layers.reduce(
            (sum, l) => sum + l.data.length * 2,
            0,
          );
          if (
            total + bytes > 48_000_000 &&
            i !== history.current.past.length - 1
          )
            break;
          total += bytes;
          keepFrom = i;
        }
        history.current.past = history.current.past.slice(
          Math.max(keepFrom, history.current.past.length - 20),
        );
        setHistoryCounts({ past: history.current.past.length, future: 0 });
        save(data);
      }
    },
    [save],
  );
  const replace = useCallback(
    (p: Project) => {
      history.current = { past: [], future: [] };
      apply(p);
      setCrop(null);
      setShape(null);
      setTimeout(() => fit(p), 0);
    },
    [apply, fit],
  );
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cached = await recover().catch(() => undefined);
        const initial = cached
          ? await restore(cached).catch(() => demoProject())
          : await demoProject();
        if (!cancelled) replace(initial);
      } catch {
        if (!cancelled) replace(blankProject("Sem título", 1440, 1000));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [replace]);
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(() => {
      if (current.current) fit();
    });
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [fit, !!project]);
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const preventPageZoom = (event: WheelEvent) => event.preventDefault();
    el.addEventListener("wheel", preventPageZoom, { passive: false });
    return () => el.removeEventListener("wheel", preventPageZoom);
  }, [!!project]);
  const selected = project?.layers.find((l) => l.id === project.selected);
  const patchLayer = useCallback(
    (patch: Partial<Layer>, commit = true) => {
      const p = current.current;
      if (!p) return;
      apply(
        {
          ...p,
          layers: p.layers.map((l) =>
            l.id === p.selected ? { ...l, ...patch } : l,
          ),
        },
        commit,
      );
    },
    [apply],
  );
  const addLayer = useCallback(
    (layer?: Layer) => {
      const p = current.current;
      if (!p) return;
      if (p.layers.length >= 40) {
        notify("Limite de 40 camadas por projeto.");
        return;
      }
      const next =
        layer ??
        makeLayer(`Camada ${p.layers.length + 1}`, surface(p.width, p.height));
      apply({ ...p, layers: [...p.layers, next], selected: next.id });
    },
    [apply, notify],
  );
  const deleteLayer = useCallback(() => {
    const p = current.current;
    if (!p) return;
    if (p.layers.length <= 1) {
      notify("Mantenha pelo menos uma camada no projeto.");
      return;
    }
    if (p.layers.find((l) => l.id === p.selected)?.locked) {
      notify("Desbloqueie a camada para excluí-la.");
      return;
    }
    const layers = p.layers.filter((l) => l.id !== p.selected);
    apply({ ...p, layers, selected: layers.at(-1)!.id });
  }, [apply, notify]);
  const duplicateLayer = useCallback(() => {
    const p = current.current,
      l = p?.layers.find((l) => l.id === p.selected);
    if (!p || !l) return;
    const copy = surface(l.canvas.width, l.canvas.height);
    copy.getContext("2d")!.drawImage(l.canvas, 0, 0);
    addLayer({
      ...l,
      id: uid(),
      name: `${l.name} · cópia`,
      canvas: copy,
      x: l.x + 20,
      y: l.y + 20,
      locked: false,
    });
  }, [addLayer]);
  const reorder = (direction: number) => {
    const p = current.current!;
    const layers = [...p.layers];
    const i = layers.findIndex((l) => l.id === p.selected),
      j = i + direction;
    if (j < 0 || j >= layers.length) return;
    [layers[i], layers[j]] = [layers[j], layers[i]];
    apply({ ...p, layers });
  };
  const undoRedo = useCallback(
    async (redo = false) => {
      if (busyRef.current) return;
      const h = history.current;
      if (redo ? !h.future.length : h.past.length <= 1) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const target = redo ? h.future.at(-1)! : h.past.at(-2)!;
        const p = await restore(target);
        if (redo) h.past.push(h.future.pop()!);
        else h.future.push(h.past.pop()!);
        apply(p, false);
        setHistoryCounts({ past: h.past.length, future: h.future.length });
        setCrop(null);
        save(snapshot(p));
      } catch {
        notify("Não foi possível restaurar esta etapa.");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [apply, notify, save],
  );
  const saveProject = useCallback(() => {
    if (!current.current) return;
    download(
      new Blob([JSON.stringify(snapshot(current.current))], {
        type: "application/json",
      }),
      `${current.current.name}.lume`,
    );
    notify("Projeto salvo. Abra o arquivo .lume para continuar editando.");
  }, [notify]);
  const importFiles = useCallback(
    async (files: File[]) => {
      if (busyRef.current || !current.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        for (const file of files) {
          if (
            !file.type.startsWith("image/") ||
            file.type === "image/svg+xml"
          ) {
            notify("Use uma imagem PNG, JPEG, WebP, GIF ou AVIF.");
            continue;
          }
          if (file.size > 30_000_000) {
            notify("Use uma imagem com menos de 30 MB.");
            continue;
          }
          const url = URL.createObjectURL(file);
          try {
            const img = await loadImage(url);
            const p = current.current!;
            const ratio = Math.min(
              1,
              p.width / img.width,
              p.height / img.height,
              4096 / img.width,
              4096 / img.height,
            );
            const bitmap = surface(img.width * ratio, img.height * ratio);
            bitmap
              .getContext("2d")!
              .drawImage(img, 0, 0, bitmap.width, bitmap.height);
            const layer = makeLayer(
              file.name.replace(/\.[^.]+$/, ""),
              bitmap,
              "image",
            );
            layer.x = Math.round((p.width - layer.width) / 2);
            layer.y = Math.round((p.height - layer.height) / 2);
            addLayer(layer);
            setTool("move");
          } finally {
            URL.revokeObjectURL(url);
          }
        }
      } catch (err) {
        notify(
          err instanceof Error
            ? err.message
            : "Não foi possível importar a imagem.",
        );
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [addLayer, notify],
  );
  const openProject = async (file: File) => {
    if (busyRef.current) return;
    if (file.size > 100_000_000) {
      notify("O projeto excede o limite de 100 MB.");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const p = await restore(JSON.parse(await file.text()));
      replace(p);
      notify("Projeto aberto.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Projeto inválido.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const cropProject = useCallback(() => {
    const p = current.current;
    if (!p || !crop) return;
    const x = Math.round(clamp(crop.x, 0, p.width - 1)),
      y = Math.round(clamp(crop.y, 0, p.height - 1));
    const width = Math.round(clamp(crop.w, 1, p.width - x)),
      height = Math.round(clamp(crop.h, 1, p.height - y));
    // Rasterize each layer individually at document resolution, preserving the stack and adjustments.
    const layers = p.layers.map((layer) => {
      const bitmap = surface(width, height);
      bitmap
        .getContext("2d")!
        .drawImage(
          layer.canvas,
          layer.x - x,
          layer.y - y,
          layer.width,
          layer.height,
        );
      return { ...layer, canvas: bitmap, x: 0, y: 0, width, height };
    });
    const next = { ...p, width, height, layers };
    apply(next);
    setCrop(null);
    fit(next);
    notify(`Imagem recortada para ${width} × ${height} px.`);
  }, [apply, crop, fit, notify]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        setCrop(null);
        setShape(null);
        if (modal) setModal(null);
      }
      if (
        (e.target as HTMLElement).closest(
          'input,textarea,select,[contenteditable="true"]',
        ) ||
        modal ||
        busyRef.current
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod) {
        if (["z", "y", "s", "o", "n", "d", "=", "+", "-", "0"].includes(key))
          e.preventDefault();
        if (key === "z") void undoRedo(e.shiftKey);
        if (key === "y") void undoRedo(true);
        if (key === "s") saveProject();
        if (key === "o") fileInput.current?.click();
        if (key === "n") setModal("new");
        if (key === "d") duplicateLayer();
        if (key === "0") fit();
        if (key === "+" || key === "=") setZoom((z) => clamp(z * 1.2, 0.05, 4));
        if (key === "-") setZoom((z) => clamp(z / 1.2, 0.05, 4));
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        setSpace(true);
      }
      const next = tools.find((t) => t.key.toLowerCase() === key);
      if (next) {
        setTool(next.id);
        setCrop(null);
      }
      if (key === "[") setSize((s) => Math.max(1, s - 4));
      if (key === "]") setSize((s) => Math.min(240, s + 4));
      if (key === "enter") cropProject();
      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        deleteLayer();
      }
      if (["arrowleft", "arrowright", "arrowup", "arrowdown"].includes(key)) {
        e.preventDefault();
        const p = current.current,
          layer = p?.layers.find((l) => l.id === p.selected);
        if (!layer || layer.locked) return;
        const distance = e.shiftKey ? 10 : 1;
        patchLayer({
          x:
            layer.x +
            (key === "arrowleft"
              ? -distance
              : key === "arrowright"
                ? distance
                : 0),
          y:
            layer.y +
            (key === "arrowup"
              ? -distance
              : key === "arrowdown"
                ? distance
                : 0),
        });
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpace(false);
    };
    const paste = (e: ClipboardEvent) => {
      if ((e.target as HTMLElement).closest("input,textarea") || modal) return;
      const images = Array.from(e.clipboardData?.files ?? []);
      if (images.length) {
        e.preventDefault();
        void importFiles(images);
      }
    };
    const blur = () => setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("paste", paste);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("paste", paste);
      window.removeEventListener("blur", blur);
    };
  }, [
    modal,
    undoRedo,
    saveProject,
    duplicateLayer,
    fit,
    cropProject,
    deleteLayer,
    patchLayer,
    importFiles,
  ]);

  useEffect(() => {
    if (!canvas.current || !overlay.current || !project) return;
    drawProject(canvas.current.getContext("2d")!, project);
    const ctx = overlay.current.getContext("2d")!;
    ctx.clearRect(0, 0, project.width, project.height);
    if (selected && tool === "move" && !space && selected.visible) {
      ctx.save();
      ctx.strokeStyle = selected.locked ? "#a7adb5" : "#f8a461";
      ctx.lineWidth = 1 / zoom;
      ctx.strokeRect(selected.x, selected.y, selected.width, selected.height);
      for (const x of [selected.x, selected.x + selected.width])
        for (const y of [selected.y, selected.y + selected.height]) {
          ctx.fillStyle = "#fffaf0";
          ctx.fillRect(x - 3 / zoom, y - 3 / zoom, 6 / zoom, 6 / zoom);
          ctx.strokeRect(x - 3 / zoom, y - 3 / zoom, 6 / zoom, 6 / zoom);
        }
      ctx.restore();
    }
    if (shape) {
      ctx.save();
      ctx.fillStyle = color;
      ctx.globalAlpha = flow / 100;
      if (tool === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          shape.x + shape.w / 2,
          shape.y + shape.h / 2,
          shape.w / 2,
          shape.h / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else ctx.fillRect(shape.x, shape.y, shape.w, shape.h);
      ctx.restore();
    }
    if (crop) {
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.beginPath();
      ctx.rect(0, 0, project.width, project.height);
      ctx.rect(crop.x, crop.y, crop.w, crop.h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5 / zoom;
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      ctx.strokeStyle = "rgba(255,255,255,.4)";
      ctx.lineWidth = 1 / zoom;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(crop.x + (crop.w * i) / 3, crop.y);
        ctx.lineTo(crop.x + (crop.w * i) / 3, crop.y + crop.h);
        ctx.moveTo(crop.x, crop.y + (crop.h * i) / 3);
        ctx.lineTo(crop.x + crop.w, crop.y + (crop.h * i) / 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [project, tick, selected, zoom, tool, space, crop, shape, color, flow]);

  const getPoint = (event: { clientX: number; clientY: number }) => {
    const bounds = overlay.current!.getBoundingClientRect();
    return {
      x:
        ((event.clientX - bounds.left) / bounds.width) * current.current!.width,
      y:
        ((event.clientY - bounds.top) / bounds.height) *
        current.current!.height,
    };
  };
  const paint = (layer: Layer, from: Point, to: Point, erase: boolean) => {
    const ctx = layer.canvas.getContext("2d")!;
    const sx = layer.canvas.width / layer.width,
      sy = layer.canvas.height / layer.height;
    ctx.save();
    ctx.globalCompositeOperation = erase ? "destination-out" : "source-over";
    ctx.globalAlpha = flow / 100;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = (size * (sx + sy)) / 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const a = { x: (from.x - layer.x) * sx, y: (from.y - layer.y) * sy },
      b = { x: (to.x - layer.x) * sx, y: (to.y - layer.y) * sy };
    if (a.x === b.x && a.y === b.y) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.restore();
  };
  const pointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || busyRef.current || !project) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const pos = getPoint(event),
      p = current.current!;
    const mode = space ? "hand" : tool;
    let layer = p.layers.find((l) => l.id === p.selected);
    if (mode === "hand") {
      gesture.current = {
        start: { x: event.clientX, y: event.clientY },
        last: pos,
        origin: pan,
        mode,
        changed: false,
      };
      return;
    }
    if (mode === "text") {
      textPosition.current = pos;
      setText("Sua ideia começa aqui.");
      setModal("text");
      return;
    }
    if (mode === "eyedropper") {
      const pixel = canvas
        .current!.getContext("2d")!
        .getImageData(
          clamp(Math.floor(pos.x), 0, p.width - 1),
          clamp(Math.floor(pos.y), 0, p.height - 1),
          1,
          1,
        ).data;
      if (pixel[3] === 0) {
        notify("Este pixel é transparente.");
        return;
      }
      const hex =
        "#" +
        [pixel[0], pixel[1], pixel[2]]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
      setColor(hex);
      notify(`Cor capturada: ${hex.toUpperCase()}`);
      return;
    }
    if (mode === "move") {
      if (layer && !layer.locked) {
        const handles = [
          { x: layer.x, y: layer.y, h: "nw" },
          { x: layer.x + layer.width, y: layer.y, h: "ne" },
          { x: layer.x, y: layer.y + layer.height, h: "sw" },
          { x: layer.x + layer.width, y: layer.y + layer.height, h: "se" },
        ];
        const handle = handles.find(
          (h) =>
            Math.abs(pos.x - h.x) < 10 / zoom &&
            Math.abs(pos.y - h.y) < 10 / zoom,
        );
        if (handle) {
          gesture.current = {
            mode: "resize",
            start: pos,
            last: pos,
            origin: { x: layer.x, y: layer.y },
            layer,
            changed: false,
            handle: handle.h,
            rect: { x: layer.x, y: layer.y, w: layer.width, h: layer.height },
          };
          return;
        }
      }
      // Keep the selected layer if its visible pixels are under the pointer; otherwise hit-test from the top.
      const hit = (candidate: Layer) => {
        if (!candidate.visible || candidate.opacity === 0) return false;
        const x =
            ((pos.x - candidate.x) / candidate.width) * candidate.canvas.width,
          y =
            ((pos.y - candidate.y) / candidate.height) *
            candidate.canvas.height;
        if (
          x < 0 ||
          y < 0 ||
          x >= candidate.canvas.width ||
          y >= candidate.canvas.height
        )
          return false;
        return (
          candidate.canvas
            .getContext("2d")!
            .getImageData(Math.floor(x), Math.floor(y), 1, 1).data[3] > 12
        );
      };
      layer = layer && hit(layer) ? layer : [...p.layers].reverse().find(hit);
      if (!layer) return;
      if (layer.locked) {
        notify("Camada bloqueada. Desbloqueie no painel de camadas.");
        return;
      }
      apply({ ...p, selected: layer.id }, false);
    }
    if (
      (mode === "brush" || mode === "eraser") &&
      layer &&
      (layer.locked || !layer.visible)
    ) {
      notify(
        layer.locked
          ? "Desbloqueie a camada para pintar."
          : "Torne a camada visível para pintar.",
      );
      return;
    }
    gesture.current = {
      start: pos,
      last: pos,
      origin: { x: layer?.x ?? 0, y: layer?.y ?? 0 },
      layer,
      mode,
      changed: false,
    };
    if ((mode === "brush" || mode === "eraser") && layer) {
      paint(layer, pos, pos, mode === "eraser");
      gesture.current.changed = true;
      apply({ ...p }, false);
    }
    if (mode === "crop") setCrop(null);
  };
  const pointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const pos = getPoint(event);
    setPointer(pos);
    const g = gesture.current;
    if (!g || busyRef.current) return;
    const p = current.current!;
    const dx = pos.x - g.start.x,
      dy = pos.y - g.start.y;
    if (g.mode === "hand") {
      setPan({
        x: g.origin.x + event.clientX - g.start.x,
        y: g.origin.y + event.clientY - g.start.y,
      });
      return;
    }
    if (g.mode === "move" && g.layer) {
      apply(
        {
          ...p,
          layers: p.layers.map((l) =>
            l.id === g.layer!.id
              ? {
                  ...l,
                  x: Math.round(g.origin.x + dx),
                  y: Math.round(g.origin.y + dy),
                }
              : l,
          ),
        },
        false,
      );
      g.changed = true;
    }
    if (g.mode === "resize" && g.layer && g.rect) {
      const r = g.rect,
        west = g.handle!.includes("w"),
        north = g.handle!.includes("n");
      let width = Math.max(8, r.w + (west ? -dx : dx)),
        height = Math.max(8, r.h + (north ? -dy : dy));
      if (event.shiftKey) height = width / (r.w / r.h);
      width = Math.min(width, 16384);
      height = Math.min(height, 16384);
      apply(
        {
          ...p,
          layers: p.layers.map((l) =>
            l.id === g.layer!.id
              ? {
                  ...l,
                  x: west ? r.x + r.w - width : r.x,
                  y: north ? r.y + r.h - height : r.y,
                  width,
                  height,
                }
              : l,
          ),
        },
        false,
      );
      g.changed = true;
    }
    if ((g.mode === "brush" || g.mode === "eraser") && g.layer) {
      paint(g.layer, g.last, pos, g.mode === "eraser");
      apply({ ...p }, false);
      g.changed = true;
    }
    if (["rectangle", "ellipse", "crop"].includes(g.mode)) {
      const end = { x: clamp(pos.x, 0, p.width), y: clamp(pos.y, 0, p.height) };
      if (event.shiftKey && g.mode !== "crop") {
        const dimension = Math.min(Math.abs(dx), Math.abs(dy));
        end.x = g.start.x + Math.sign(dx) * dimension;
        end.y = g.start.y + Math.sign(dy) * dimension;
      }
      const rect = {
        x: Math.min(g.start.x, end.x),
        y: Math.min(g.start.y, end.y),
        w: Math.abs(end.x - g.start.x),
        h: Math.abs(end.y - g.start.y),
      };
      g.rect = rect;
      if (g.mode === "crop") setCrop(rect);
      else setShape(rect);
      g.changed = true;
    }
    g.last = pos;
  };
  const pointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    gesture.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (!g || !g.changed) return;
    if ((g.mode === "rectangle" || g.mode === "ellipse") && g.rect) {
      const r = g.rect;
      if (r.w < 2 || r.h < 2) {
        setShape(null);
        return;
      }
      const bitmap = surface(r.w, r.h);
      const ctx = bitmap.getContext("2d")!;
      ctx.fillStyle = color;
      if (g.mode === "ellipse") {
        ctx.beginPath();
        ctx.ellipse(
          bitmap.width / 2,
          bitmap.height / 2,
          bitmap.width / 2,
          bitmap.height / 2,
          0,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      } else ctx.fillRect(0, 0, bitmap.width, bitmap.height);
      const layer = makeLayer(
        g.mode === "ellipse" ? "Elipse" : "Retângulo",
        bitmap,
        "shape",
      );
      layer.x = r.x;
      layer.y = r.y;
      layer.opacity = flow;
      addLayer(layer);
      setShape(null);
    } else if (g.mode !== "hand" && g.mode !== "crop")
      apply({ ...current.current! });
    if (g.mode === "crop" && g.rect && (g.rect.w < 2 || g.rect.h < 2))
      setCrop(null);
  };

  const exportImage = async () => {
    if (!current.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const p = current.current;
      const rendered = composite(p, format === "jpeg" ? "#ffffff" : undefined);
      const blob = await new Promise<Blob | null>((resolve) =>
        rendered.toBlob(resolve, `image/${format}`, quality / 100),
      );
      if (!blob) throw new Error("Falha ao exportar a imagem.");
      download(blob, `${p.name}.${format === "jpeg" ? "jpg" : "png"}`);
      setModal(null);
      notify("Sua imagem está pronta. Download iniciado.");
    } catch (e) {
      notify(e instanceof Error ? e.message : "Falha na exportação.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const activeTool = tools.find((t) => t.id === tool)!;
  const runMenu = (action: () => void) => {
    setMenu(null);
    action();
  };
  const chooseTool = (next: Tool) => {
    setTool(next);
    setCrop(null);
    setShape(null);
  };

  return (
    <div className={`app-shell ${mobilePanel ? "mobile-panel-open" : ""}`}>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        className="visually-hidden"
        aria-label="Importar imagens"
        onChange={(e) => {
          void importFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={projectInput}
        type="file"
        accept=".lume,application/json"
        className="visually-hidden"
        aria-label="Abrir projeto Lume"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void openProject(file);
          e.target.value = "";
        }}
      />
      <header className="app-header">
        <a
          className="brand"
          href="#"
          aria-label="Lume — início"
          onClick={(e) => {
            e.preventDefault();
            setModal("help");
          }}
        >
          <span className="brand-mark">
            <Aperture size={24} strokeWidth={2} />
          </span>
          <span>
            lume<span className="brand-dot">.</span>
          </span>
        </a>
        <nav className="main-menu" aria-label="Menu principal">
          {["Arquivo", "Editar", "Imagem", "Ajuda"].map((name) => (
            <div className="menu-wrap" key={name}>
              <button
                className={menu === name ? "menu-trigger open" : "menu-trigger"}
                onClick={() => setMenu(menu === name ? null : name)}
                aria-expanded={menu === name}
              >
                {name}
              </button>
              {menu === name && (
                <div className="dropdown" role="menu">
                  {name === "Arquivo" && (
                    <>
                      <button onClick={() => runMenu(() => setModal("new"))}>
                        <FilePlus2 size={15} />
                        Novo documento<kbd>Ctrl N</kbd>
                      </button>
                      <button
                        onClick={() =>
                          runMenu(() => fileInput.current?.click())
                        }
                      >
                        <ImagePlus size={15} />
                        Importar imagem<kbd>Ctrl O</kbd>
                      </button>
                      <button
                        onClick={() =>
                          runMenu(() => projectInput.current?.click())
                        }
                      >
                        <FolderOpen size={15} />
                        Abrir projeto .lume
                      </button>
                      <hr />
                      <button onClick={() => runMenu(saveProject)}>
                        <Save size={15} />
                        Salvar projeto<kbd>Ctrl S</kbd>
                      </button>
                      <button onClick={() => runMenu(() => setModal("export"))}>
                        <Download size={15} />
                        Exportar imagem
                      </button>
                    </>
                  )}
                  {name === "Editar" && (
                    <>
                      <button
                        disabled={historyCounts.past <= 1}
                        onClick={() => runMenu(() => void undoRedo())}
                      >
                        <Undo2 size={15} />
                        Desfazer<kbd>Ctrl Z</kbd>
                      </button>
                      <button
                        disabled={!historyCounts.future}
                        onClick={() => runMenu(() => void undoRedo(true))}
                      >
                        <Redo2 size={15} />
                        Refazer<kbd>Ctrl Shift Z</kbd>
                      </button>
                      <hr />
                      <button onClick={() => runMenu(duplicateLayer)}>
                        <Copy size={15} />
                        Duplicar camada<kbd>Ctrl D</kbd>
                      </button>
                      <button onClick={() => runMenu(deleteLayer)}>
                        <Trash2 size={15} />
                        Excluir camada<kbd>Del</kbd>
                      </button>
                    </>
                  )}
                  {name === "Imagem" && (
                    <>
                      <button onClick={() => runMenu(() => chooseTool("crop"))}>
                        <Crop size={15} />
                        Recortar imagem
                      </button>
                      <button
                        onClick={() =>
                          runMenu(() => setRightTab("adjustments"))
                        }
                      >
                        <SlidersHorizontal size={15} />
                        Ajustes de cor
                      </button>
                      <button onClick={() => runMenu(() => fit())}>
                        <Maximize size={15} />
                        Ajustar à tela<kbd>Ctrl 0</kbd>
                      </button>
                      <button
                        onClick={() =>
                          runMenu(() => {
                            setZoom(1);
                            setPan({ x: 0, y: 0 });
                          })
                        }
                      >
                        <ZoomIn size={15} />
                        Tamanho real
                      </button>
                    </>
                  )}
                  {name === "Ajuda" && (
                    <>
                      <button onClick={() => runMenu(() => setModal("help"))}>
                        <HelpCircle size={15} />
                        Guia e atalhos
                      </button>
                      <div className="dropdown-note">
                        Suas imagens ficam neste dispositivo.
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="save-status">
          <span
            className={
              saveState === "Salvo neste navegador"
                ? "status-dot"
                : "status-dot pending"
            }
          />
          {saveState === "Abrindo" ? "Abrindo estúdio…" : saveState}
        </div>
        <div className="header-actions">
          <button
            className="button quiet new-button"
            onClick={() => setModal("new")}
          >
            <Plus size={16} />
            Novo
          </button>
          <button
            className="button primary"
            onClick={() => setModal("export")}
            disabled={!project}
          >
            <Download size={16} />
            Exportar
            <ChevronDown size={13} />
          </button>
          <button
            className="avatar"
            onClick={() => setModal("help")}
            title="Sobre o Lume"
          >
            L
          </button>
        </div>
      </header>
      <div className="context-bar">
        <div className="tool-identity">
          <activeTool.icon size={17} />
          <span>{activeTool.name}</span>
          <ChevronDown size={12} />
        </div>
        <div className="context-options">
          {(tool === "brush" || tool === "eraser") && (
            <>
              <label className="compact-field">
                Tamanho
                <input
                  aria-label="Tamanho do pincel"
                  type="number"
                  min="1"
                  max="240"
                  value={size}
                  onChange={(e) => setSize(clamp(+e.target.value, 1, 240))}
                />
                <span>px</span>
              </label>
              <label className="compact-field">
                Fluxo
                <input
                  aria-label="Fluxo do pincel"
                  type="number"
                  min="1"
                  max="100"
                  value={flow}
                  onChange={(e) => setFlow(clamp(+e.target.value, 1, 100))}
                />
                <span>%</span>
              </label>
            </>
          )}
          {tool === "move" && (
            <>
              <span className="context-description">Seleção por camada</span>
              <span className="context-divider" />
              <span className="context-hint">
                <span className="mini-check">
                  <Check size={10} />
                </span>
                Mostrar controles
              </span>
            </>
          )}
          {tool === "text" && (
            <>
              <select
                aria-label="Fonte do texto"
                value={font}
                onChange={(e) => setFont(e.target.value)}
              >
                <option value="Georgia, serif">Georgia</option>
                <option value="Arial, sans-serif">Arial</option>
                <option value="monospace">Monoespaçada</option>
              </select>
              <label className="compact-field">
                <input
                  aria-label="Tamanho do texto"
                  type="number"
                  min="8"
                  max="400"
                  value={fontSize}
                  onChange={(e) => setFontSize(clamp(+e.target.value, 8, 400))}
                />
                <span>px</span>
              </label>
              <IconButton
                label="Texto em negrito"
                active={bold}
                onClick={() => setBold(!bold)}
              >
                <Bold size={16} />
              </IconButton>
            </>
          )}
          {["rectangle", "ellipse", "eyedropper"].includes(tool) && (
            <label className="inline-color">
              Cor
              <input
                aria-label="Cor da ferramenta"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <span>{color.toUpperCase()}</span>
            </label>
          )}
          {tool === "crop" && (
            <>
              <span className="context-description">Recorte livre</span>
              {crop && (
                <>
                  <span className="context-hint">
                    {Math.round(crop.w)} × {Math.round(crop.h)} px
                  </span>
                  <button
                    className="button small primary"
                    onClick={cropProject}
                  >
                    <Check size={14} />
                    Aplicar
                  </button>
                  <IconButton
                    label="Cancelar recorte"
                    onClick={() => setCrop(null)}
                  >
                    <X size={15} />
                  </IconButton>
                </>
              )}
            </>
          )}
          {tool === "hand" && (
            <span className="context-description">
              Arraste para explorar sua imagem
            </span>
          )}
        </div>
        <div className="history-actions">
          <IconButton
            label="Desfazer (Ctrl Z)"
            disabled={busy || historyCounts.past <= 1}
            onClick={() => void undoRedo()}
          >
            <Undo2 size={17} />
          </IconButton>
          <IconButton
            label="Refazer (Ctrl Shift Z)"
            disabled={busy || !historyCounts.future}
            onClick={() => void undoRedo(true)}
          >
            <Redo2 size={17} />
          </IconButton>
          <button
            className={`icon-button panel-toggle ${mobilePanel ? "active" : ""}`}
            aria-label="Mostrar ou ocultar camadas"
            aria-expanded={mobilePanel}
            onClick={() => setMobilePanel(!mobilePanel)}
          >
            <Layers size={17} />
          </button>
        </div>
      </div>
      {menu && <div className="menu-dismiss" onClick={() => setMenu(null)} />}
      <main className="editor-layout">
        <aside className="tool-rail" aria-label="Ferramentas de edição">
          <div className="rail-top">
            <span className="rail-dots">···</span>
            {tools.map(({ id, name, key, icon: Icon }, i) => (
              <div className={i === 6 ? "tool-group-break" : ""} key={id}>
                <button
                  className={`tool-button ${tool === id ? "selected" : ""}`}
                  aria-label={`${name} (${key})`}
                  aria-pressed={tool === id}
                  onClick={() => chooseTool(id)}
                >
                  <Icon size={20} strokeWidth={1.65} />
                  <span className="tool-tooltip">
                    {name}
                    <kbd>{key}</kbd>
                  </span>
                </button>
              </div>
            ))}
            <div className="rail-divider" />
            <label className="color-picker" title="Cor do primeiro plano">
              <span className="back-swatch" />
              <span className="front-swatch" style={{ background: color }} />
              <input
                aria-label="Cor do primeiro plano"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
            <span className="color-caption">COR</span>
          </div>
          <IconButton label="Guia e atalhos" onClick={() => setModal("help")}>
            <HelpCircle size={19} />
          </IconButton>
        </aside>
        <section className="workspace" aria-label="Área de edição">
          <div className="document-bar">
            <div className="document-tab">
              <FileImage size={14} />
              <input
                aria-label="Nome do projeto"
                value={project?.name ?? ""}
                maxLength={100}
                onChange={(e) => {
                  if (project)
                    apply(
                      { ...project, name: e.target.value || "Sem título" },
                      false,
                    );
                }}
                onBlur={() => {
                  if (current.current) apply(current.current);
                }}
              />
              <span className="file-extension">.lume</span>
              <span className="tab-dot" />
            </div>
            <button
              className="workspace-import"
              onClick={() => fileInput.current?.click()}
            >
              <ImagePlus size={14} />
              <span>Importar imagem</span>
            </button>
          </div>
          <div
            ref={stage}
            className={`stage tool-${space ? "hand" : tool} ${busy ? "busy" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              void importFiles(Array.from(e.dataTransfer.files));
            }}
            onWheel={(e) => {
              if (e.ctrlKey || e.metaKey) {
                setZoom((z) => clamp(z * (e.deltaY > 0 ? 0.9 : 1.1), 0.05, 4));
              } else setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
            }}
          >
            <div className="stage-topline">
              <span>ESPAÇO DE CRIAÇÃO</span>
              <span>
                {project
                  ? `${project.width} × ${project.height} px`
                  : "Preparando documento"}
              </span>
            </div>
            {project ? (
              <div
                className="canvas-position"
                style={{
                  width: project.width * zoom,
                  height: project.height * zoom,
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
                }}
              >
                <div className="canvas-label">
                  {project.name}
                  <span>RGB / 8 bits</span>
                </div>
                <div className="canvas-checker">
                  <canvas
                    className="artwork-canvas"
                    ref={canvas}
                    width={project.width}
                    height={project.height}
                  />
                  <canvas
                    className="interaction-canvas"
                    aria-label="Tela de edição"
                    data-testid="editor-canvas"
                    ref={overlay}
                    width={project.width}
                    height={project.height}
                    onPointerDown={pointerDown}
                    onPointerMove={pointerMove}
                    onPointerUp={pointerUp}
                    onPointerCancel={pointerUp}
                    onPointerLeave={() => setPointer(null)}
                  />
                </div>
                {pointer &&
                  (tool === "brush" || tool === "eraser") &&
                  !space && (
                    <div
                      className="brush-cursor"
                      style={{
                        width: size * zoom,
                        height: size * zoom,
                        left: pointer.x * zoom,
                        top: pointer.y * zoom,
                      }}
                    />
                  )}
              </div>
            ) : (
              <div className="loading-state">
                <Aperture size={32} />
                <p>Abrindo seu estúdio…</p>
              </div>
            )}
            <div className="canvas-controls">
              <IconButton
                label="Diminuir zoom"
                onClick={() => setZoom((z) => clamp(z / 1.2, 0.05, 4))}
              >
                <Minus size={16} />
              </IconButton>
              <button
                className="zoom-value"
                onClick={() => {
                  setZoom(1);
                  setPan({ x: 0, y: 0 });
                }}
                title="Ver em tamanho real"
              >
                {Math.round(zoom * 100)}%<ChevronDown size={11} />
              </button>
              <IconButton
                label="Aumentar zoom"
                onClick={() => setZoom((z) => clamp(z * 1.2, 0.05, 4))}
              >
                <Plus size={16} />
              </IconButton>
              <span />
              <IconButton label="Ajustar à tela (Ctrl 0)" onClick={() => fit()}>
                <Maximize size={15} />
              </IconButton>
            </div>
          </div>
          <footer className="workspace-status">
            <span className="status-instruction">
              <activeTool.icon size={13} />
              {instructions[tool]}
            </span>
            <span>
              {pointer
                ? `${Math.round(pointer.x)}, ${Math.round(pointer.y)} px`
                : "RGB · sRGB"}
              <span className="status-separator" />
              {project?.layers.length ?? 0} camadas
            </span>
          </footer>
        </section>
        <aside className="properties-panel" aria-label="Camadas e propriedades">
          <div className="panel-top">
            <span>Seu espaço de criação</span>
            <Settings2 size={15} />
          </div>
          <div className="panel-tabs">
            <button
              className={rightTab === "layers" ? "active" : ""}
              onClick={() => setRightTab("layers")}
            >
              <Layers size={15} />
              Camadas<span>{project?.layers.length ?? 0}</span>
            </button>
            <button
              className={rightTab === "adjustments" ? "active" : ""}
              onClick={() => setRightTab("adjustments")}
            >
              <SlidersHorizontal size={15} />
              Ajustes
            </button>
          </div>
          {rightTab === "layers" ? (
            <>
              <div className="layer-controls">
                <select
                  aria-label="Modo de mesclagem"
                  value="Normal"
                  disabled
                  title="Nesta versão, as camadas usam mesclagem normal"
                >
                  <option>Normal</option>
                </select>
                <label>
                  Opacidade<span>{selected?.opacity ?? 100}%</span>
                </label>
                <input
                  aria-label="Opacidade da camada"
                  type="range"
                  min="0"
                  max="100"
                  value={selected?.opacity ?? 100}
                  onChange={(e) =>
                    patchLayer({ opacity: +e.target.value }, false)
                  }
                  onPointerUp={() => {
                    if (current.current) apply(current.current);
                  }}
                  onKeyUp={(e) => {
                    if (/^(Arrow|Home|End|Page)/.test(e.key))
                      apply(current.current!);
                  }}
                />
              </div>
              <div className="layer-stack" aria-label="Lista de camadas">
                {[...(project?.layers ?? [])].reverse().map((layer) => (
                  <div
                    key={layer.id}
                    data-layer-name={layer.name}
                    className={`layer-row ${project?.selected === layer.id ? "active" : ""}`}
                    onClick={() =>
                      project &&
                      apply({ ...project, selected: layer.id }, false)
                    }
                  >
                    <button
                      className="layer-visibility"
                      aria-label={`${layer.visible ? "Ocultar" : "Mostrar"} ${layer.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (project)
                          apply({
                            ...project,
                            layers: project.layers.map((l) =>
                              l.id === layer.id
                                ? { ...l, visible: !l.visible }
                                : l,
                            ),
                          });
                      }}
                    >
                      {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
                    </button>
                    <button
                      className="layer-select"
                      aria-label={`Selecionar camada ${layer.name}`}
                    >
                      <span className="layer-thumbnail">
                        <Thumb layer={layer} tick={tick} />
                        {layer.kind === "text" && (
                          <span className="thumb-type">T</span>
                        )}
                      </span>
                      <span className="layer-name">
                        <span>{layer.name}</span>
                        <small>
                          {layer.kind === "text"
                            ? "Texto rasterizado"
                            : layer.kind === "image"
                              ? "Imagem"
                              : layer.kind === "shape"
                                ? "Forma"
                                : "Camada de pixels"}
                        </small>
                      </span>
                    </button>
                    <button
                      className={`layer-lock ${layer.locked ? "locked" : ""}`}
                      aria-label={`${layer.locked ? "Desbloquear" : "Bloquear"} ${layer.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (project)
                          apply({
                            ...project,
                            layers: project.layers.map((l) =>
                              l.id === layer.id
                                ? { ...l, locked: !l.locked }
                                : l,
                            ),
                          });
                      }}
                    >
                      {layer.locked ? (
                        <LockKeyhole size={13} />
                      ) : (
                        <UnlockKeyhole size={13} />
                      )}
                    </button>
                  </div>
                ))}
              </div>
              <div className="layer-actions">
                <IconButton label="Adicionar camada" onClick={() => addLayer()}>
                  <Plus size={16} />
                </IconButton>
                <IconButton label="Duplicar camada" onClick={duplicateLayer}>
                  <Copy size={15} />
                </IconButton>
                <IconButton label="Subir camada" onClick={() => reorder(1)}>
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton label="Descer camada" onClick={() => reorder(-1)}>
                  <ArrowDown size={15} />
                </IconButton>
                <IconButton
                  label="Excluir camada"
                  onClick={deleteLayer}
                  disabled={(project?.layers.length ?? 0) <= 1}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
              <div className="property-section">
                <div className="section-title">
                  <span>Transformação</span>
                  <Maximize size={13} />
                </div>
                <div className="transform-grid">
                  {(["x", "y", "width", "height"] as const).map((field, i) => (
                    <label key={field}>
                      <span>{["X", "Y", "L", "A"][i]}</span>
                      <input
                        type="number"
                        aria-label={
                          [
                            "Posição X",
                            "Posição Y",
                            "Largura da camada",
                            "Altura da camada",
                          ][i]
                        }
                        disabled={!selected || selected.locked}
                        value={Math.round(selected?.[field] ?? 0)}
                        onChange={(e) => {
                          const n = +e.target.value;
                          patchLayer(
                            {
                              [field]:
                                field === "width" || field === "height"
                                  ? clamp(n, 1, 16384)
                                  : clamp(n, -16384, 16384),
                            },
                            false,
                          );
                        }}
                        onBlur={() => {
                          if (current.current) apply(current.current);
                        }}
                      />
                      <small>px</small>
                    </label>
                  ))}
                </div>
                <p className="property-hint">
                  Shift + arrastar mantém a proporção.
                </p>
              </div>
            </>
          ) : (
            <div className="adjustments">
              <div className="section-title">
                <span>Ajustes da camada</span>
                <button
                  aria-label="Restaurar ajustes"
                  title="Restaurar ajustes"
                  onClick={() =>
                    patchLayer({
                      brightness: 100,
                      contrast: 100,
                      saturation: 100,
                    })
                  }
                >
                  <RotateCcw size={14} />
                </button>
              </div>
              <p className="adjustment-intro">
                Encontre o tom da sua ideia.
                <br />O original é preservado.
              </p>
              {(["brightness", "contrast", "saturation"] as const).map(
                (field, i) => (
                  <label className="adjustment" key={field}>
                    <span>
                      {["Brilho", "Contraste", "Saturação"][i]}
                      <output>
                        {(selected?.[field] ?? 100) - 100 > 0 ? "+" : ""}
                        {(selected?.[field] ?? 100) - 100}
                      </output>
                    </span>
                    <input
                      aria-label={["Brilho", "Contraste", "Saturação"][i]}
                      type="range"
                      min="0"
                      max="200"
                      value={selected?.[field] ?? 100}
                      disabled={selected?.locked}
                      onChange={(e) =>
                        patchLayer({ [field]: +e.target.value }, false)
                      }
                      onPointerUp={() => apply(current.current!)}
                      onKeyUp={(e) => {
                        if (/^(Arrow|Home|End|Page)/.test(e.key))
                          apply(current.current!);
                      }}
                    />
                  </label>
                ),
              )}
              <div className="presets-label">UM PONTO DE PARTIDA</div>
              <div className="filter-grid">
                {[
                  {
                    name: "Original",
                    b: 100,
                    c: 100,
                    s: 100,
                    className: "original",
                  },
                  { name: "Cinema", b: 92, c: 125, s: 65, className: "cinema" },
                  { name: "P&B", b: 105, c: 115, s: 0, className: "mono" },
                  {
                    name: "Vibrante",
                    b: 108,
                    c: 112,
                    s: 145,
                    className: "vibrant",
                  },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    disabled={selected?.locked}
                    onClick={() =>
                      patchLayer({
                        brightness: preset.b,
                        contrast: preset.c,
                        saturation: preset.s,
                      })
                    }
                  >
                    <span className={`filter-preview ${preset.className}`}>
                      <Aperture size={24} />
                    </span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
              <p className="property-hint">
                Os ajustes afetam apenas a camada selecionada.
              </p>
            </div>
          )}
          <div className="color-section">
            <div className="section-title">
              <span>Paleta do estúdio</span>
              <Pipette size={13} />
            </div>
            <div className="palette">
              {palette.map((hex) => (
                <button
                  key={hex}
                  aria-label={`Usar cor ${hex}`}
                  className={color === hex ? "active" : ""}
                  style={{ background: hex }}
                  onClick={() => setColor(hex)}
                >
                  {color === hex && (
                    <Check
                      size={13}
                      style={{ color: hex === "#191e23" ? "#fff" : "#182126" }}
                    />
                  )}
                </button>
              ))}
            </div>
            <label className="hex-field">
              <input
                aria-label="Seletor de cor"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
              <HexColor value={color} onChange={setColor} />
              <span>HEX</span>
            </label>
          </div>
          <div className="panel-bottom">
            <span className="local-icon">
              <LockKeyhole size={13} />
            </span>
            <span>
              Seu trabalho, só seu.
              <small>Imagens processadas neste dispositivo.</small>
            </span>
          </div>
        </aside>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="Fechar aviso" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy-label" role="status">
          <span className="spinner" />
          Processando…
        </div>
      )}
      {modal === "new" && (
        <Dialog
          title="Uma nova possibilidade."
          subtitle="Escolha o tamanho da sua próxima ideia."
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newWidth * newHeight > 16_000_000) {
                notify("Use até 16 megapixels por documento.");
                return;
              }
              replace(
                blankProject(
                  newName.trim() || "Sem título",
                  newWidth,
                  newHeight,
                  transparent,
                ),
              );
              setModal(null);
              notify(
                "Novo documento criado. O anterior pode ser restaurado se você salvou o arquivo .lume.",
              );
            }}
          >
            <label className="form-field">
              Nome do projeto
              <input
                required
                maxLength={100}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </label>
            <div className="document-presets">
              {[
                { name: "Paisagem", w: 1440, h: 1000, icon: "landscape" },
                { name: "Quadrado", w: 1080, h: 1080, icon: "square" },
                { name: "Story", w: 1080, h: 1920, icon: "portrait" },
              ].map((p) => (
                <button
                  key={p.name}
                  type="button"
                  className={
                    newWidth === p.w && newHeight === p.h ? "active" : ""
                  }
                  onClick={() => {
                    setNewWidth(p.w);
                    setNewHeight(p.h);
                  }}
                >
                  <span className={`preset-shape ${p.icon}`} />
                  {p.name}
                  <small>
                    {p.w} × {p.h}
                  </small>
                </button>
              ))}
            </div>
            <div className="form-row">
              <label className="form-field">
                Largura (px)
                <input
                  type="number"
                  min="16"
                  max="4096"
                  required
                  value={newWidth}
                  onChange={(e) => setNewWidth(+e.target.value)}
                />
              </label>
              <span className="dimension-cross">×</span>
              <label className="form-field">
                Altura (px)
                <input
                  type="number"
                  min="16"
                  max="4096"
                  required
                  value={newHeight}
                  onChange={(e) => setNewHeight(+e.target.value)}
                />
              </label>
            </div>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
              />
              Fundo transparente
            </label>
            <p className="form-note">
              Salve o projeto atual em Arquivo → Salvar projeto antes de criar
              outro.
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button className="button primary" type="submit">
                <Plus size={16} />
                Criar documento
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === "text" && (
        <Dialog
          title="Dê voz à sua imagem."
          subtitle="O texto será adicionado como uma nova camada de pixels."
          close={() => setModal(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!text.trim()) return;
              const layer = textLayer(text, color, fontSize, font, bold);
              layer.x = textPosition.current.x;
              layer.y = textPosition.current.y;
              addLayer(layer);
              setModal(null);
              setTool("move");
            }}
          >
            <label className="form-field">
              Seu texto
              <textarea
                aria-label="Seu texto"
                required
                value={text}
                maxLength={1200}
                onChange={(e) => setText(e.target.value)}
                rows={4}
              />
            </label>
            <div className="form-row">
              <label className="form-field">
                Fonte
                <select value={font} onChange={(e) => setFont(e.target.value)}>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="monospace">Monoespaçada</option>
                </select>
              </label>
              <label className="form-field">
                Tamanho (px)
                <input
                  required
                  type="number"
                  min="8"
                  max="400"
                  value={fontSize}
                  onChange={(e) => setFontSize(+e.target.value)}
                />
              </label>
            </div>
            <div className="text-options">
              <label>
                <input
                  type="color"
                  aria-label="Cor do texto"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                />
                {color.toUpperCase()}
              </label>
              <button
                type="button"
                className={`button secondary ${bold ? "toggled" : ""}`}
                onClick={() => setBold(!bold)}
              >
                <Bold size={15} />
                Negrito
              </button>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setModal(null)}
              >
                Cancelar
              </button>
              <button type="submit" className="button primary">
                <Type size={16} />
                Adicionar texto
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === "export" && (
        <Dialog
          title="Sua ideia, pronta para sair."
          subtitle="Exporte a composição com todas as camadas visíveis."
          close={() => setModal(null)}
        >
          <div className="export-preview">
            {project && <ExportPreview project={project} />}
            <span>
              {project?.width} × {project?.height} px
            </span>
          </div>
          <div className="format-options">
            <button
              className={format === "png" ? "active" : ""}
              onClick={() => setFormat("png")}
            >
              <FileImage size={19} />
              <span>
                PNG<small>Qualidade máxima · transparência</small>
              </span>
              {format === "png" && <Check size={16} />}
            </button>
            <button
              className={format === "jpeg" ? "active" : ""}
              onClick={() => setFormat("jpeg")}
            >
              <FileImage size={19} />
              <span>
                JPEG<small>Arquivo menor · fundo branco</small>
              </span>
              {format === "jpeg" && <Check size={16} />}
            </button>
          </div>
          {format === "jpeg" && (
            <label className="adjustment export-quality">
              <span>
                Qualidade<output>{quality}%</output>
              </span>
              <input
                aria-label="Qualidade JPEG"
                type="range"
                min="20"
                max="100"
                value={quality}
                onChange={(e) => setQuality(+e.target.value)}
              />
            </label>
          )}
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void exportImage()}
            >
              <Download size={16} />
              {busy ? "Exportando…" : `Baixar ${format.toUpperCase()}`}
            </button>
          </div>
        </Dialog>
      )}
      {modal === "help" && (
        <Dialog
          title="Menos limites. Mais criação."
          subtitle="Um estúdio de imagens feito para suas ideias ganharem forma."
          close={() => setModal(null)}
          wide
        >
          <div className="help-intro">
            <div>
              <ImagePlus size={22} />
              <h3>Traga sua imagem</h3>
              <p>
                Importe pelo botão, arraste um arquivo para a tela ou cole uma
                imagem com Ctrl V.
              </p>
            </div>
            <div>
              <Layers size={22} />
              <h3>Crie em camadas</h3>
              <p>
                Pinte, adicione texto e formas. Mova, redimensione e experimente
                ajustes sem perder o original.
              </p>
            </div>
            <div>
              <Download size={22} />
              <h3>Leve sua criação</h3>
              <p>
                Exporte em PNG ou JPEG. Salve um arquivo .lume para manter suas
                camadas e continuar depois.
              </p>
            </div>
          </div>
          <div className="shortcuts">
            <h3>Seu fluxo, mais rápido</h3>
            {[
              ["Mover", "V"],
              ["Pincel / Borracha", "B / E"],
              ["Texto / Recortar", "T / C"],
              ["Mão temporária", "Espaço"],
              ["Desfazer / Refazer", "Ctrl Z / Ctrl Shift Z"],
              ["Salvar projeto", "Ctrl S"],
              ["Ajustar à tela", "Ctrl 0"],
              ["Tamanho do pincel", "[ / ]"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
          <p className="form-note">
            No Mac, use ⌘ no lugar de Ctrl. Salvamento automático neste
            navegador via IndexedDB. Histórico de até 20 etapas, limitado a
            aproximadamente 48 MB. Esta versão usa texto rasterizado e mesclagem
            normal; não abre arquivos PSD.
          </p>
          <div className="dialog-actions">
            <button className="button primary" onClick={() => setModal(null)}>
              Vamos criar
              <ChevronRight size={15} />
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function ExportPreview({ project }: { project: Project }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext("2d")!;
    const render = composite(project);
    ctx.clearRect(0, 0, 640, 300);
    const scale = Math.min(600 / project.width, 280 / project.height);
    ctx.drawImage(
      render,
      (640 - project.width * scale) / 2,
      (300 - project.height * scale) / 2,
      project.width * scale,
      project.height * scale,
    );
  }, [project]);
  return <canvas ref={ref} width="640" height="300" />;
}
