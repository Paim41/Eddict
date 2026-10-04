import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Film,
  ShieldCheck,
  Sparkles,
  Upload,
  Crop,
  Smile,
  SlidersHorizontal,
  Layers,
  Undo2,
  Redo2,
  Download,
  RotateCcw,
  X,
} from "lucide-react";
import { Editor, fileURL, loadProject } from "./editor";
import type { StoredProject } from "./editor";
import { Inspector, ExportDialog } from "./Panels";
import type { Tool } from "./Panels";
import VideoStudio from "./VideoStudio";
import Compare from "./Compare";
const tools = [
  ["Crop & resize", Crop],
  ["Add photo", ImagePlus],
  ["Stickers", Smile],
  ["Filters", Sparkles],
  ["Adjust", SlidersHorizontal],
  ["Layers", Layers],
] as const;
export default function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    host = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null),
    engine = useRef<Editor | null>(null),
    mode = useRef<"new" | "image" | "sticker" | "replace">("new");
  const [editor, setEditor] = useState<Editor | null>(null),
    [, refresh] = useState(0),
    [view, setView] = useState<"home" | "editor" | "video">("home"),
    [tool, setTool] = useState<Tool>("Filters"),
    [sheet, setSheet] = useState(true),
    [exporting, setExporting] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<StoredProject>(),
    [videoFile, setVideoFile] = useState<File>();
  const [dragging, setDragging] = useState(false);
  const [comparing, setComparing] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  function toast(text: string) {
    setMessage(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMessage(""), 7000);
  }
  useEffect(() => {
    const e = new Editor(canvas.current!, host.current!);
    engine.current = e;
    e.notify = () => refresh((n) => n + 1);
    e.onError = toast;
    setEditor(e);
    void loadProject()
      .then(setSaved)
      .catch(() => {});
    return () => {
      e.dispose();
      clearTimeout(toastTimer.current);
    };
  }, []);
  useEffect(() => {
    if (view === "editor") requestAnimationFrame(() => engine.current?.fit());
  }, [view, sheet]);
  async function run(fn: () => void | Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (error) {
      toast(
        error instanceof Error
          ? error.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(m: "new" | "image" | "sticker" | "replace") {
    mode.current = m;
    if (input.current) {
      input.current.accept =
        m === "sticker"
          ? "image/png,image/webp,image/svg+xml"
          : "image/jpeg,image/png,image/webp";
      input.current.click();
    }
  }
  async function importFile(
    file: File,
    m: "new" | "image" | "sticker" | "replace",
  ) {
    const e = engine.current;
    if (!e) return;
    if (
      m === "new" &&
      e.ready &&
      !window.confirm(
        "Start a new photo? Export your current edit first if you want to keep it.",
      )
    )
      return;
    if (m === "replace") await e.replacePhoto(await fileURL(file), file.name);
    else
      await e.importImage(await fileURL(file, m === "sticker"), file.name, m);
    setComparing(false);
    setView("editor");
    setTool(m === "new" ? "Filters" : "Layers");
    setSheet(true);
    setSaved(undefined);
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (
        (event.target as HTMLElement)?.closest(
          "input,textarea,[contenteditable]",
        )
      )
        return;
      const image = [...(event.clipboardData?.files || [])].find((f) =>
        f.type.startsWith("image/"),
      );
      if (image) {
        event.preventDefault();
        void run(() =>
          importFile(image, engine.current?.ready ? "image" : "new"),
        );
      }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [busy]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (
        view !== "editor" ||
        busy ||
        (event.target as HTMLElement).closest(
          "input,select,textarea,[contenteditable],dialog",
        )
      )
        return;
      const e = engine.current;
      if (!e) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && ["z", "y", "d"].includes(event.key.toLowerCase())) {
        event.preventDefault();
        const key = event.key.toLowerCase();
        void run(() =>
          key === "d"
            ? e.duplicate()
            : e.travel(key === "y" || event.shiftKey ? 1 : -1),
        );
      } else if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        e.remove();
      } else if (event.key === "Escape") {
        e.cancelCrop();
        e.canvas.discardActiveObject();
        e.canvas.requestRenderAll();
        setSheet(false);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [view, busy]);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      context.registerTool(
        {
          name: "read_eddict_project",
          description:
            "Read the current local Eddict canvas dimensions and layer names, without image data.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute: () => {
            const e = engine.current;
            return {
              name: e?.name,
              width: e?.width,
              height: e?.height,
              layers: e?.layers.map((l) => ({
                id: l.id,
                name: l.name,
                visible: l.visible,
              })),
            };
          },
        },
        { signal: lifecycle.signal },
      );
    } catch {
      /* Optional browser API. */
    }
    return () => lifecycle.abort();
  }, []);
  const active = editor?.ready;
  return (
    <div className={"app " + (view === "home" ? "welcome" : "")}>
      <header className={"topbar " + (view === "editor" ? "editing" : "")}>
        <button
          className="brand brand-button"
          onClick={() => setView("home")}
          aria-label="Eddict home"
        >
          <span className="brand-e">e</span>ddict<small>EDIT ADDICT</small>
        </button>
        {view === "editor" && editor ? (
          <>
            <div className="history">
              <button
                className="icon-button"
                aria-label="Undo"
                title="Undo (Ctrl+Z)"
                disabled={editor.cursor <= 0 || busy}
                onClick={() => void run(() => editor.travel(-1))}
              >
                <Undo2 size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Redo"
                title="Redo (Ctrl+Shift+Z)"
                disabled={editor.cursor >= editor.history.length - 1 || busy}
                onClick={() => void run(() => editor.travel(1))}
              >
                <Redo2 size={19} />
              </button>
            </div>
            <input
              className="project-name"
              aria-label="Project name"
              value={editor.name}
              onChange={(event) => {
                editor.name = event.target.value;
                refresh((n) => n + 1);
              }}
              onBlur={() => editor.commit()}
            />
            <div className="top-actions">
              <button
                className="reset-button"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      "Reset this project to the original photo? Added layers and edits will be removed.",
                    )
                  )
                    void run(() => editor.reset());
                }}
              >
                <RotateCcw size={16} />
                <span>Reset</span>
              </button>
              <button
                className="primary"
                disabled={busy || !!editor.crop}
                onClick={() => setExporting(true)}
              >
                <Download size={17} />
                <span>Export</span>
              </button>
            </div>
          </>
        ) : (
          <span className="privacy">
            <ShieldCheck size={16} /> Your edits stay in your browser
          </span>
        )}
      </header>
      <input
        ref={input}
        type="file"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void run(() => importFile(file, mode.current));
          event.target.value = "";
        }}
      />
      {view === "home" && (
        <>
          <section
            className={"welcome-content " + (dragging ? "dragging" : "")}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const f = event.dataTransfer.files[0];
              if (f) {
                if (f.type.startsWith("video/")) {
                  setVideoFile(f);
                  setView("video");
                } else void run(() => importFile(f, "new"));
              }
            }}
          >
            <span className="eyebrow">
              <Sparkles size={16} /> A LITTLE EDIT. A LOT OF YOU.
            </span>
            <h1>
              Edit something
              <br />
              you <em>love.</em>
            </h1>
            <p>
              Your moments, with your finishing touch.
              <br />A little crop, a little colour, a little more you.
            </p>
            <div className="start-cards">
              <button
                className="start-card"
                disabled={busy}
                onClick={() => choose("new")}
              >
                <ImagePlus size={30} />
                <strong>Edit a photo</strong>
                <span>Drop it in. Make it yours.</span>
                <b>Choose photo</b>
              </button>
              <button
                className="start-card video-card"
                onClick={() => {
                  setVideoFile(undefined);
                  setView("video");
                }}
              >
                <Film size={30} />
                <strong>Video to photo</strong>
                <span>Keep the moment between moments.</span>
                <b>Choose video</b>
              </button>
            </div>
            <p className="fine">
              JPEG, PNG & WebP · Paste or drop a photo · No account needed
            </p>
            {active ? (
              <button className="resume" onClick={() => setView("editor")}>
                Continue editing {editor.name}
              </button>
            ) : (
              saved && (
                <button
                  className="resume"
                  onClick={() =>
                    void run(async () => {
                      if (!editor) return;
                      editor.initial = saved.initial;
                      await editor.restore(saved.current);
                      editor.commit();
                      setView("editor");
                      setSaved(undefined);
                    })
                  }
                >
                  Resume your last edit
                </button>
              )
            )}
          </section>
          <footer>
            MADE FOR YOUR EVERYDAY CREATIVE SIDE
            <span>YOUR MOMENTS. YOUR WAY.</span>
          </footer>
        </>
      )}
      <div
        className={"editor-layout " + (!sheet ? "sheet-hidden" : "")}
        style={{ display: view === "editor" ? "" : "none" }}
        aria-busy={busy}
      >
        <nav className="toolbar" aria-label="Editing tools">
          <button onClick={() => choose("new")} title="Upload a new photo">
            <Upload size={22} />
            <span>Upload</span>
          </button>
          <div className="toolbar-divider" />
          {tools.map(([name, Icon]) => (
            <button
              key={name}
              className={tool === name && sheet ? "active" : ""}
              aria-pressed={tool === name && sheet}
              onClick={() => {
                if (editor?.crop && name !== "Crop & resize") {
                  toast("Apply or cancel your crop before switching tools.");
                  return;
                }
                setComparing(false);
                setTool(name);
                setSheet(true);
              }}
            >
              <Icon size={22} />
              <span>{name}</span>
            </button>
          ))}
          <div className="toolbar-divider" />
          <button
            onClick={() => {
              setVideoFile(undefined);
              setView("video");
            }}
          >
            <Film size={22} />
            <span>Video to photo</span>
          </button>
        </nav>
        <main
          className={"workspace " + (dragging ? "dragging" : "")}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const f = event.dataTransfer.files[0];
            if (f) void run(() => importFile(f, "image"));
          }}
        >
          <div className="workspace-heading">
            <span>
              {editor?.crop ? "CROP YOUR CANVAS" : "YOUR CREATIVE SPACE"}
            </span>
            <button
              className={"compare-toggle " + (comparing ? "active" : "")}
              aria-pressed={comparing}
              disabled={busy || !!editor?.crop}
              onClick={() => setComparing(!comparing)}
            >
              Before / After
            </button>
            <span>{busy ? "Working…" : "Stored on this device"}</span>
          </div>
          <div ref={host} className="canvas-host">
            <canvas ref={canvas} />
            {comparing && editor && <Compare editor={editor} />}
          </div>
          <div className="workspace-footer">
            <span>
              {editor?.width} × {editor?.height} px
            </span>
            <span>Base photo locked · Drag added layers to move</span>
            <button onClick={() => editor?.fit()} title="Fit canvas to screen">
              Fit {Math.round((editor?.canvas.getZoom() || 1) * 100)}%
            </button>
          </div>
        </main>
        {editor && (
          <Inspector
            busy={busy}
            editor={editor}
            tool={tool}
            upload={choose}
            run={(fn) => void run(fn)}
            close={() => setSheet(false)}
          />
        )}
      </div>
      {
        <div style={{ display: view === "video" ? "contents" : "none" }}>
          <VideoStudio
            active={view === "video"}
            initialFile={videoFile}
            onClose={() => setView(active ? "editor" : "home")}
            onEdit={async (url) => {
              if (
                editor?.ready &&
                !window.confirm(
                  "Open this frame as a new project? Export your current edit first if you want to keep it.",
                )
              )
                return;
              await editor?.importImage(url, "Video frame", "new", true);
              setTool("Filters");
              setView("editor");
            }}
          />
        </div>
      }
      {exporting && editor && (
        <ExportDialog
          editor={editor}
          onClose={() => setExporting(false)}
          run={(fn) => void run(fn)}
        />
      )}
      {message && (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setMessage("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
