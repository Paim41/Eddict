import { useEffect, useRef, useState } from "react";
import { FabricImage } from "fabric";
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Copy,
  Trash2,
  ArrowUp,
  ArrowDown,
  FlipHorizontal,
  Upload,
  X,
  Download,
} from "lucide-react";
import {
  Editor,
  adjustmentKeys,
  defaults,
  applyLook,
  download,
  presets,
} from "./editor";
import type { Adjustment, Preset } from "./editor";
import { stickers } from "./stickers";
export type Tool =
  "Crop & resize" | "Add photo" | "Stickers" | "Filters" | "Adjust" | "Layers";
export function Inspector({
  editor: e,
  tool,
  upload,
  run,
  close,
}: {
  editor: Editor;
  tool: Tool;
  upload: (mode: "image" | "sticker") => void;
  run: (fn: () => void | Promise<void>) => void;
  close: () => void;
}) {
  return (
    <aside className="inspector">
      <div className="panel-heading">
        <h2>{tool}</h2>
        <button
          className="icon-button sheet-close"
          onClick={close}
          aria-label="Close tool panel"
        >
          <X size={18} />
        </button>
      </div>
      {tool === "Crop & resize" ? (
        <CropPanel editor={e} run={run} />
      ) : tool === "Add photo" ? (
        <>
          <p className="muted">Build a little more into your moment.</p>
          <button className="upload-card" onClick={() => upload("image")}>
            <Upload size={26} />
            <b>Add a photo</b>
            <span>JPEG, PNG or WebP</span>
          </button>
          <p className="fine">
            Every photo is its own layer. Drag the corners to resize, or the top
            handle to rotate.
          </p>
        </>
      ) : tool === "Stickers" ? (
        <StickerPanel editor={e} upload={() => upload("sticker")} run={run} />
      ) : tool === "Filters" ? (
        <FilterPanel editor={e} run={run} />
      ) : tool === "Adjust" ? (
        <AdjustPanel editor={e} />
      ) : (
        <LayersPanel editor={e} run={run} />
      )}
    </aside>
  );
}
function CropPanel({
  editor: e,
  run,
}: {
  editor: Editor;
  run: (fn: () => void | Promise<void>) => void;
}) {
  const [w, setW] = useState(e.width),
    [h, setH] = useState(e.height),
    [locked, setLocked] = useState(true),
    [ratio, setRatio] = useState("Free"),
    [zoom, setZoom] = useState(1);
  const base = e.layers.find((o) => o.layerType === "base-image"),
    initialScale = useRef(base?.scaleX || 1),
    cropBackup = useRef<ReturnType<Editor["snapshot"]> | null>(null);
  useEffect(() => {
    setW(e.width);
    setH(e.height);
  }, [e.width, e.height]);
  const ratios: Record<string, number | null> = {
    Free: null,
    Original: e.initial
      ? e.initial.width / e.initial.height
      : e.width / e.height,
    "1:1": 1,
    "4:5": 4 / 5,
    "3:4": 3 / 4,
    "9:16": 9 / 16,
    "16:9": 16 / 9,
  };
  function start(r: string) {
    if (!e.crop) {
      cropBackup.current = e.snapshot();
      initialScale.current = base?.scaleX || 1;
      setZoom(1);
    }
    setRatio(r);
    e.startCrop(ratios[r]);
  }
  return (
    <>
      <p className="muted">Find your perfect frame.</p>
      <h3>Aspect ratio</h3>
      <div className="ratios">
        {Object.keys(ratios).map((r) => (
          <button
            key={r}
            className={e.crop && r === ratio ? "active" : ""}
            onClick={() => start(r)}
          >
            {r}
          </button>
        ))}
      </div>
      {e.crop && (
        <>
          <p className="fine">
            Drag the pink crop frame or its handles. Select the photo to
            reposition it beneath the frame.
          </p>
          <label>
            Photo zoom · {Math.round(zoom * 100)}%
            <input
              type="range"
              min=".5"
              max="3"
              step=".01"
              value={zoom}
              onChange={(event) => {
                setZoom(+event.target.value);
                e.zoomBase(initialScale.current * +event.target.value);
              }}
            />
          </label>
          <div className="row">
            <button
              onClick={() =>
                run(async () => {
                  if (cropBackup.current) await e.restore(cropBackup.current);
                  else e.cancelCrop();
                })
              }
            >
              Cancel
            </button>
            <button
              className="primary"
              onClick={() => run(() => e.applyCrop())}
            >
              Apply crop
            </button>
          </div>
        </>
      )}
      <hr />
      <h3>Resize canvas</h3>
      <div className="dimensions">
        <label>
          Width (px)
          <input
            type="number"
            min="1"
            max="6000"
            value={w}
            onChange={(event) => {
              const v = +event.target.value;
              setW(v);
              if (locked) setH(Math.round((v * e.height) / e.width));
            }}
          />
        </label>
        <span>×</span>
        <label>
          Height (px)
          <input
            type="number"
            min="1"
            max="6000"
            value={h}
            onChange={(event) => {
              const v = +event.target.value;
              setH(v);
              if (locked) setW(Math.round((v * e.width) / e.height));
            }}
          />
        </label>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={locked}
          onChange={(event) => setLocked(event.target.checked)}
        />{" "}
        Maintain aspect ratio
      </label>
      <label>
        Quick sizes
        <select
          defaultValue=""
          onChange={(event) => {
            const [width, height] =
              event.target.value === "original"
                ? [e.initial?.width || e.width, e.initial?.height || e.height]
                : event.target.value.split("x").map(Number);
            setW(width);
            setH(height);
          }}
        >
          <option disabled value="">
            Choose a size
          </option>
          <option value="original">Original</option>
          {["1080x1080", "1080x1350", "1080x1920", "1920x1080"].map((s) => (
            <option key={s} value={s}>
              {s.replace("x", " × ")}
            </option>
          ))}
        </select>
      </label>
      <button
        className="wide primary"
        disabled={!!e.crop}
        onClick={() => run(() => e.resize(w, h))}
      >
        Apply size
      </button>
      <p className="fine">
        Photos keep their proportions. Maximum 6000 px per side and 24
        megapixels.
      </p>
    </>
  );
}
function StickerPanel({
  editor: e,
  upload,
  run,
}: {
  editor: Editor;
  upload: () => void;
  run: (fn: () => void | Promise<void>) => void;
}) {
  return (
    <>
      <p className="muted">Your sticker collection.</p>
      {stickers.length > 0 ? (
        <div className="sticker-grid custom-stickers">
          {stickers.map((s) => (
            <button
              key={s.id}
              title={s.name}
              aria-label={"Add " + s.name}
              onClick={() =>
                run(async () => {
                  const response = await fetch(s.url);
                  if (!response.ok)
                    throw new Error("This sticker is unavailable.");
                  const blob = await response.blob();
                  const data = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = () =>
                      reject(new Error("Could not read the sticker."));
                    reader.readAsDataURL(blob);
                  });
                  await e.importImage(data, s.name, "sticker");
                })
              }
            >
              <img src={s.url} alt={s.name} />
              <span>{s.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="fine">
          The two sticker images have not been attached successfully yet. The
          previous collection has been removed.
        </p>
      )}
      <button className="upload-card" onClick={upload}>
        <Upload />
        <b>Upload a sticker</b>
        <span>PNG, WebP or simple SVG</span>
      </button>
    </>
  );
}
function FilterPanel({
  editor: e,
  run,
}: {
  editor: Editor;
  run: (fn: () => void | Promise<void>) => void;
}) {
  const image = e.selected;
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const src = image instanceof FabricImage ? image.getSrc() : "";
  const ids = Object.keys(presets) as Preset[];
  useEffect(() => {
    let alive = true;
    setThumbs({});
    if (src)
      void (async () => {
        const original = await FabricImage.fromURL(src);
        const canvas = document.createElement("canvas");
        canvas.width = 144;
        canvas.height = 112;
        const ctx = canvas.getContext("2d")!;
        const scale = Math.max(144 / original.width, 112 / original.height);
        ctx.drawImage(
          original.getElement(),
          (144 - original.width * scale) / 2,
          (112 - original.height * scale) / 2,
          original.width * scale,
          original.height * scale,
        );
        const data = canvas.toDataURL();
        const next: Record<string, string> = {};
        for (const preset of Object.keys(presets) as Preset[]) {
          const small = await FabricImage.fromURL(data);
          applyLook(small, [{ id: "preview", preset }], defaults());
          next[preset] = small.toDataURL();
          small.dispose();
        }
        original.dispose();
        if (alive) setThumbs(next);
      })().catch(() => {});
    return () => {
      alive = false;
    };
  }, [src]);
  if (!image)
    return <p className="muted">Select a photo on the canvas or in Layers.</p>;
  const stack = image.filterStack || [];
  return (
    <>
      <p className="muted">Layer your looks. Make it yours.</p>
      <p className="fine">
        Click to add a filter. Add the same one again for another pass.
      </p>
      <div className="filter-list">
        {ids.map((p) => (
          <button
            key={p}
            className="filter-card"
            aria-label={"Add " + presets[p].name}
            onClick={() => run(() => e.addFilter(p))}
          >
            {thumbs[p] ? (
              <img src={thumbs[p]} alt={presets[p].name + " preview"} />
            ) : (
              <div className="thumbnail-loading" />
            )}
            <span>
              {presets[p].name} <b>+</b>
            </span>
          </button>
        ))}
      </div>
      <hr />
      <h3>
        Applied Filters <span className="filter-count">{stack.length}</span>
      </h3>
      <p className="fine">On {image.name} · processed from top to bottom</p>
      <ol className="applied-filters" aria-live="polite">
        {stack.map((f, i) => (
          <li key={f.id}>
            <span className="filter-order">{i + 1}</span>
            <span>{presets[f.preset].name}</span>
            <div>
              <button
                className="icon-button"
                aria-label={"Move filter " + (i + 1) + " up"}
                disabled={i === 0}
                onClick={() => run(() => e.moveFilter(f.id, -1))}
              >
                <ArrowUp size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={"Move filter " + (i + 1) + " down"}
                disabled={i === stack.length - 1}
                onClick={() => run(() => e.moveFilter(f.id, 1))}
              >
                <ArrowDown size={14} />
              </button>
              <button
                className="icon-button"
                aria-label={
                  "Remove filter " + (i + 1) + " " + presets[f.preset].name
                }
                onClick={() => run(() => e.removeFilter(f.id))}
              >
                <X size={14} />
              </button>
            </div>
          </li>
        ))}
      </ol>
      {stack.length === 0 ? (
        <p className="fine">Original photo · No filters added</p>
      ) : (
        <button
          className="wide"
          onClick={() => run(() => e.look([], image.adjustments))}
        >
          Clear all filters
        </button>
      )}
      <p className="fine">
        Manual adjustments apply after every filter. Removing a filter preserves
        the others.
      </p>
    </>
  );
}
function AdjustmentSlider({
  label,
  value,
  min,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (n: number) => void;
  onCommit: () => void;
}) {
  return (
    <label className="adjustment">
      <span>
        {label}
        <button
          title={`Reset ${label}`}
          onClick={() => {
            onChange(0);
            setTimeout(onCommit, 180);
          }}
        >
          {value > 0 ? "+" : ""}
          {value}
        </button>
      </span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max="100"
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
      />
    </label>
  );
}
function AdjustPanel({ editor: e }: { editor: Editor }) {
  const image = e.selected,
    [values, setValues] = useState(image?.adjustments || defaults()),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pending = useRef(false),
    next = useRef(values);
  useEffect(() => {
    setValues(image?.adjustments || defaults());
    next.current = image?.adjustments || defaults();
  }, [image?.id, e.cursor]);
  function flush(commit: boolean) {
    clearTimeout(timer.current);
    if (!pending.current) return;
    e.look(image?.filterStack || [], next.current, false);
    if (commit) {
      pending.current = false;
      e.commit();
    }
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );
  if (!image)
    return <p className="muted">Select a photo on the canvas or in Layers.</p>;
  function change(k: Adjustment, n: number) {
    const v = { ...next.current, [k]: n };
    next.current = v;
    setValues(v);
    pending.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => flush(false), 120);
  }
  return (
    <>
      <p className="muted">Make the light feel just right.</p>
      <p className="fine">Adjusting {image.name}</p>
      {adjustmentKeys.map((k) => (
        <AdjustmentSlider
          key={k}
          label={k[0].toUpperCase() + k.slice(1)}
          value={values[k]}
          min={["sharpness", "blur", "fade", "vignette"].includes(k) ? 0 : -100}
          onChange={(n) => change(k, n)}
          onCommit={() => flush(true)}
        />
      ))}
      <button
        className="wide"
        onClick={() => {
          clearTimeout(timer.current);
          pending.current = false;
          const v = defaults();
          setValues(v);
          next.current = v;
          e.look(image.filterStack || [], v);
        }}
      >
        Reset adjustments
      </button>
    </>
  );
}
function LayersPanel({
  editor: e,
  run,
}: {
  editor: Editor;
  run: (fn: () => void | Promise<void>) => void;
}) {
  const selected = e.selected;
  return (
    <>
      <p className="muted">Every detail, in its place.</p>
      <div className="layer-list">
        {[...e.layers].reverse().map((layer) => (
          <div
            key={layer.id}
            draggable
            onDragStart={(event) =>
              event.dataTransfer.setData("text/plain", layer.id)
            }
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              const moving = e.layers.find(
                (o) => o.id === event.dataTransfer.getData("text/plain"),
              );
              if (moving) e.reorder(moving, e.layers.indexOf(layer));
            }}
            className={"layer-row " + (selected === layer ? "selected" : "")}
          >
            <button className="layer-select" onClick={() => e.select(layer)}>
              {layer instanceof FabricImage && (
                <img src={layer.getSrc()} alt="" />
              )}
              <span>{layer.name}</span>
            </button>
            <button
              aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
              className="icon-button"
              onClick={() => {
                layer.set("visible", !layer.visible);
                e.canvas.requestRenderAll();
                e.commit();
              }}
            >
              {layer.visible ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button
              aria-label={`${layer.locked ? "Unlock" : "Lock"} ${layer.name}`}
              className="icon-button"
              onClick={() => e.toggleLock(layer)}
            >
              {layer.locked ? <Lock size={15} /> : <Unlock size={15} />}
            </button>
          </div>
        ))}
      </div>
      {selected && (
        <>
          <hr />
          <label>
            Layer name
            <input
              value={selected.name}
              onChange={(event) => e.change({ name: event.target.value })}
              onBlur={() => e.commit()}
            />
          </label>
          <label>
            Opacity · {Math.round(selected.opacity * 100)}%
            <input
              aria-label="Layer opacity"
              type="range"
              min="0"
              max="100"
              value={selected.opacity * 100}
              onChange={(event) =>
                e.change({ opacity: +event.target.value / 100 })
              }
              onPointerUp={() => e.commit()}
              onKeyUp={() => e.commit()}
            />
          </label>
          <div className="layer-actions">
            <button onClick={() => run(() => e.duplicate())}>
              <Copy size={16} />
              Duplicate
            </button>
            <button disabled={selected.locked} onClick={() => e.remove()}>
              <Trash2 size={16} />
              Delete
            </button>
            <button
              onClick={() =>
                e.reorder(selected, e.layers.indexOf(selected) + 1)
              }
            >
              <ArrowUp size={16} />
              Forward
            </button>
            <button
              onClick={() =>
                e.reorder(selected, e.layers.indexOf(selected) - 1)
              }
            >
              <ArrowDown size={16} />
              Backward
            </button>
            <button onClick={() => e.reorder(selected, e.layers.length - 1)}>
              To front
            </button>
            <button onClick={() => e.reorder(selected, 0)}>To back</button>
            <button
              disabled={selected.locked}
              onClick={() => {
                e.change({ flipX: !selected.flipX });
                e.commit();
              }}
            >
              <FlipHorizontal size={16} />
              Flip
            </button>
          </div>
        </>
      )}
      <p className="fine">Drag rows to reorder. Top layers appear in front.</p>
    </>
  );
}
export function ExportDialog({
  editor: e,
  onClose,
  run,
}: {
  editor: Editor;
  onClose: () => void;
  run: (fn: () => void | Promise<void>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(e.name || "eddict-edit"),
    [format, setFormat] = useState<"png" | "jpeg" | "webp">("png"),
    [quality, setQuality] = useState(92),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog ref={dialog} className="export-dialog" onCancel={onClose}>
      <div className="panel-heading">
        <h2>Your edit, ready to go.</h2>
        <button
          className="icon-button"
          aria-label="Close export"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      <p className="muted">One last detail, then it’s yours.</p>
      <label>
        File name
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label>
        Format
        <select
          aria-label="Format"
          value={format}
          onChange={(event) => setFormat(event.target.value as typeof format)}
        >
          <option value="png">PNG · Lossless, transparent</option>
          <option value="jpeg">JPEG · Smaller, white background</option>
          <option value="webp">WebP · Compact, transparent</option>
        </select>
      </label>
      {format !== "png" && (
        <label>
          Quality · {quality}%
          <input
            type="range"
            min="1"
            max="100"
            value={quality}
            onChange={(event) => setQuality(+event.target.value)}
          />
        </label>
      )}
      <div className="export-info">
        <span>Full resolution</span>
        <strong>
          {e.width} × {e.height} px
        </strong>
      </div>
      <div className="row">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              setBusy(true);
              try {
                const blob = await e.export(format, quality / 100);
                download(
                  blob,
                  (name.replace(/[\\/:*?"<>|]/g, "-") || "eddict-edit") +
                    "." +
                    (format === "jpeg" ? "jpg" : format),
                );
                onClose();
              } finally {
                setBusy(false);
              }
            })
          }
        >
          <Download size={17} />
          {busy ? "Exporting…" : "Export image"}
        </button>
      </div>
    </dialog>
  );
}
