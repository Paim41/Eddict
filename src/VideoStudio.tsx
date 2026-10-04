import { useEffect, useRef, useState } from "react";
import {
  Upload,
  Camera,
  ChevronLeft,
  ChevronRight,
  Download,
  ImagePlus,
  X,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { download } from "./editor";
import { encodeCanvas, encodeBlob, zipCaptures } from "./media";
export function timestamp(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}
interface Capture {
  id: string;
  name: string;
  time: number;
  width: number;
  height: number;
  thumbnail: string;
  url?: string;
  blob?: Blob;
  error?: string;
}
export default function VideoStudio({
  onClose,
  onEdit,
  initialFile,
  active = true,
}: {
  onClose: () => void;
  onEdit: (url: string) => Promise<void>;
  initialFile?: File;
  active?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null),
    input = useRef<HTMLInputElement>(null),
    captures = useRef<Capture[]>([]),
    alive = useRef(true),
    pendingCount = useRef(0);
  const [source, setSource] = useState(""),
    [name, setName] = useState("Video frame"),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [seeking, setSeeking] = useState(false),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState(0);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [size, setSize] = useState([0, 0]),
    [frames, setFrames] = useState<Capture[]>([]),
    [selectedId, setSelectedId] = useState(""),
    [quality, setQuality] = useState(100),
    [format, setFormat] = useState<"png" | "jpeg">("png");
  const selected = frames.find((f) => f.id === selectedId),
    finished = frames.filter((f) => f.blob);
  function update(next: Capture[]) {
    captures.current = next;
    if (alive.current) setFrames(next);
  }
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(() => {
    if (!active) video.current?.pause();
  }, [active]);
  useEffect(
    () => () => {
      alive.current = false;
      for (const f of captures.current) if (f.url) URL.revokeObjectURL(f.url);
    },
    [],
  );
  function load(file: File) {
    if (
      !/\.(mp4|webm|mov)$/i.test(file.name) &&
      !["video/mp4", "video/webm", "video/quicktime"].includes(file.type)
    ) {
      setError("Choose an MP4, WebM, or browser-compatible MOV video.");
      return;
    }
    setReady(false);
    setSeeking(false);
    setTime(0);
    setDuration(0);
    setSize([0, 0]);
    setError("");
    setSource(URL.createObjectURL(file));
    setName(file.name.replace(/\.[^.]+$/, ""));
  }
  useEffect(() => {
    if (initialFile) load(initialFile);
  }, [initialFile]);
  function seek(next: number) {
    const v = video.current;
    if (!v || !ready) return;
    v.pause();
    v.currentTime = Math.max(0, Math.min(duration, next));
    setTime(v.currentTime);
  }
  async function captureFrame() {
    const v = video.current;
    if (!v || !ready || v.seeking || pendingCount.current >= 2) return;
    if (
      captures.current.reduce((sum, f) => sum + (f.blob?.size || 0), 0) >
      256 * 1024 * 1024
    ) {
      setError(
        "Download and remove some captures before adding more. This keeps memory use manageable.",
      );
      return;
    }
    v.pause();
    setError("");
    const id = crypto.randomUUID(),
      at = v.currentTime;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    try {
      if (v.readyState < 2)
        throw new Error("Wait for the frame to finish loading.");
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Not enough memory to capture this frame.");
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const thumb = document.createElement("canvas");
      const scale = Math.min(1, 320 / canvas.width);
      thumb.width = Math.round(canvas.width * scale);
      thumb.height = Math.round(canvas.height * scale);
      thumb
        .getContext("2d")!
        .drawImage(canvas, 0, 0, thumb.width, thumb.height);
      const frame: Capture = {
        id,
        name,
        time: at,
        width: canvas.width,
        height: canvas.height,
        thumbnail: thumb.toDataURL("image/jpeg", 0.8),
      };
      thumb.width = 0;
      thumb.height = 0;
      update([...captures.current, frame]);
      setSelectedId(id);
      pendingCount.current++;
      setPending(pendingCount.current);
      try {
        const blob = await encodeCanvas(canvas);
        if (!alive.current) return;
        const exists = captures.current.some((f) => f.id === id);
        if (exists) {
          const url = URL.createObjectURL(blob);
          update(
            captures.current.map((f) =>
              f.id === id ? { ...f, blob, url } : f,
            ),
          );
        }
      } catch (e) {
        update(
          captures.current.map((f) =>
            f.id === id
              ? { ...f, error: "Encoding failed. Retake this frame." }
              : f,
          ),
        );
        throw e;
      } finally {
        pendingCount.current--;
        if (alive.current) setPending(pendingCount.current);
      }
    } catch (e) {
      if (alive.current)
        setError(
          e instanceof Error ? e.message : "Could not capture this frame.",
        );
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
  function filename(frame: Capture, index?: number) {
    return `${frame.name.replace(/[\\/:*?"<>|]/g, "-")}-${frame.time.toFixed(3)}${index === undefined ? "" : "-" + (index + 1)}.${format === "jpeg" ? "jpg" : "png"}`;
  }
  async function save(frame = selected) {
    if (!frame?.blob) return;
    setBusy(true);
    try {
      download(
        await encodeBlob(frame.blob, "image/" + format, quality / 100),
        filename(frame),
      );
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveAll() {
    if (!finished.length) return;
    setBusy(true);
    try {
      const files = [];
      for (let i = 0; i < finished.length; i++)
        files.push({
          name: filename(finished[i], i),
          blob: await encodeBlob(
            finished[i].blob!,
            "image/" + format,
            quality / 100,
          ),
        });
      download(await zipCaptures(files), "eddict-captures.zip");
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function remove(frame: Capture) {
    if (frame.url) URL.revokeObjectURL(frame.url);
    const rest = captures.current.filter((f) => f.id !== frame.id);
    update(rest);
    if (selectedId === frame.id) setSelectedId(rest.at(-1)?.id || "");
  }
  async function edit(frame = selected) {
    if (!frame?.blob) return;
    setBusy(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Could not open the capture."));
        reader.readAsDataURL(frame.blob!);
      });
      await onEdit(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="video-studio">
      <div className="studio-heading">
        <div>
          <span className="eyebrow">THE MOMENT IS YOURS</span>
          <h1>
            Video to photo<span>.</span>
          </h1>
        </div>
        <button
          className="icon-button"
          aria-label="Close video to photo"
          onClick={() => {
            video.current?.pause();
            onClose();
          }}
        >
          <X />
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov"
        onChange={(e) => {
          if (e.target.files?.[0]) load(e.target.files[0]);
          e.target.value = "";
        }}
      />
      {!source ? (
        <button
          className="video-drop"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            if (e.dataTransfer.files[0]) load(e.dataTransfer.files[0]);
          }}
        >
          <Upload size={36} />
          <strong>Drop a video here</strong>
          <span>or choose a video · MP4, WebM, MOV*</span>
          <small>*Playback depends on your browser’s codec support.</small>
        </button>
      ) : (
        <div className="video-grid">
          <section className="video-main">
            <div className="video-display">
              <video
                ref={video}
                src={source}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const v = e.currentTarget;
                  if (!Number.isFinite(v.duration) || v.duration <= 0) {
                    setError(
                      "This video has no seekable duration. Try another file.",
                    );
                    return;
                  }
                  setDuration(v.duration);
                  setSize([v.videoWidth, v.videoHeight]);
                }}
                onLoadedData={(e) =>
                  setReady(
                    Number.isFinite(e.currentTarget.duration) &&
                      e.currentTarget.duration > 0,
                  )
                }
                onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
                onSeeking={() => setSeeking(true)}
                onSeeked={() => setSeeking(false)}
                onError={() => {
                  setReady(false);
                  setError(
                    "Your browser cannot decode this video. Try an H.264 MP4 or a WebM file.",
                  );
                }}
              />
              {seeking && <span className="seek-label">Loading frame…</span>}
            </div>
            <div className="timeline">
              <input
                aria-label="Video timeline"
                type="range"
                min="0"
                max={duration || 1}
                step="0.001"
                value={time}
                disabled={!ready}
                onChange={(e) => seek(+e.target.value)}
              />
              <div className="row">
                <span>{timestamp(time)}</span>
                <span>{timestamp(duration)}</span>
              </div>
            </div>
            <div className="video-controls">
              <button
                aria-label="Previous frame, approximate 1/30 second"
                disabled={!ready || seeking}
                onClick={() => seek(time - 1 / 30)}
              >
                <ChevronLeft size={18} />
              </button>
              <label>
                Time (seconds)
                <input
                  aria-label="Precise timestamp in seconds"
                  type="number"
                  min="0"
                  max={duration}
                  step="0.001"
                  value={time.toFixed(3)}
                  onChange={(e) => seek(+e.target.value)}
                />
              </label>
              <button
                aria-label="Next frame, approximate 1/30 second"
                disabled={!ready || seeking}
                onClick={() => seek(time + 1 / 30)}
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="primary"
                disabled={!ready || seeking || pending >= 2}
                onClick={() => void captureFrame()}
              >
                <Camera size={18} />
                {pending >= 2 ? "Saving frames…" : "Capture frame"}
              </button>
            </div>
            <p className="fine">
              Capture as many moments as you need, then download them from the
              gallery below. Frame buttons seek by 1/30 second; actual frame
              rate is unavailable.
            </p>
          </section>
          <aside className="video-details">
            <h3>{selected ? "Captured frame" : "Your video"}</h3>
            {selected && (
              <img
                className="capture-preview"
                src={selected.url || selected.thumbnail}
                alt="Captured video frame"
              />
            )}
            <dl>
              <dt>Resolution</dt>
              <dd>
                {selected?.width || size[0]} × {selected?.height || size[1]}
              </dd>
              <dt>{selected ? "Captured at" : "Duration"}</dt>
              <dd>{timestamp(selected ? selected.time : duration)}</dd>
              <dt>Aspect ratio</dt>
              <dd>
                {size[0] && size[1]
                  ? `${size[0] / gcd(size[0], size[1])}:${size[1] / gcd(size[0], size[1])}`
                  : "—"}
              </dd>
            </dl>
            <label>
              Format
              <select
                aria-label="Format"
                value={format}
                onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}
              >
                <option value="png">PNG — Best quality</option>
                <option value="jpeg">JPG — Smaller file</option>
              </select>
            </label>
            {format === "jpeg" && (
              <label>
                JPG quality · {quality}%
                <input
                  type="range"
                  min="90"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(+e.target.value)}
                />
              </label>
            )}
            <p className="fine">
              PNG is lossless. JPG uses lossy compression. Both retain native
              frame dimensions.
            </p>
            {selected && (
              <>
                <button
                  className="primary wide"
                  disabled={busy || !selected.blob}
                  onClick={() => void save()}
                >
                  <Download size={17} />
                  Download {format === "jpeg" ? "JPG" : "PNG"}
                </button>
                <button
                  className="wide"
                  disabled={busy || !selected.blob}
                  onClick={() => void edit()}
                >
                  <ImagePlus size={17} />
                  Edit in Eddict
                </button>
              </>
            )}
            <button className="wide" onClick={() => input.current?.click()}>
              Choose another video
            </button>
          </aside>
        </div>
      )}
      {frames.length > 0 && (
        <section className="capture-gallery" aria-label="Captured photos">
          <div className="gallery-heading">
            <div>
              <h2>
                Your captures <span>{frames.length}</span>
              </h2>
              <p className="fine">
                Kept in this session, including while you edit. Download before
                closing or reloading.
              </p>
            </div>
            <button
              className="primary"
              disabled={busy || !finished.length || pending > 0}
              onClick={() => void saveAll()}
            >
              <Download size={17} />
              {busy ? "Preparing…" : "Download all (ZIP)"}
            </button>
          </div>
          <div className="capture-grid">
            {frames.map((frame, i) => (
              <article
                className={
                  "capture-card " + (frame.id === selectedId ? "selected" : "")
                }
                key={frame.id}
              >
                <button
                  className="capture-select"
                  onClick={() => setSelectedId(frame.id)}
                  aria-label={"Select capture " + (i + 1)}
                >
                  <img
                    src={frame.thumbnail}
                    alt={"Capture " + (i + 1)}
                    loading="lazy"
                  />
                  <strong>{timestamp(frame.time)}</strong>
                  <span>
                    {frame.width} × {frame.height}
                  </span>
                </button>
                <div className="capture-actions">
                  {frame.blob ? (
                    <>
                      <button
                        aria-label={"Download capture " + (i + 1)}
                        disabled={busy}
                        onClick={() => void save(frame)}
                      >
                        <Download size={16} />
                      </button>
                      <button
                        aria-label={"Edit capture " + (i + 1)}
                        disabled={busy}
                        onClick={() => void edit(frame)}
                      >
                        <ImagePlus size={16} />
                      </button>
                    </>
                  ) : (
                    <small role="status">
                      {frame.error || "Saving original…"}
                    </small>
                  )}
                  <button
                    aria-label={"Remove capture " + (i + 1)}
                    disabled={busy}
                    onClick={() => remove(frame)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="privacy video-privacy">
        <ShieldCheck size={16} />
        Your video stays on your device.
      </p>
    </div>
  );
}
