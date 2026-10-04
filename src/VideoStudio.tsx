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
} from "lucide-react";
import { download } from "./editor";
export function timestamp(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(3).padStart(6, "0")}`;
}
function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}
export default function VideoStudio({
  onClose,
  onEdit,
  initialFile,
}: {
  onClose: () => void;
  onEdit: (url: string) => Promise<void>;
  initialFile?: File;
}) {
  const video = useRef<HTMLVideoElement>(null),
    input = useRef<HTMLInputElement>(null),
    capture = useRef<HTMLCanvasElement | null>(null);
  const [source, setSource] = useState(""),
    [name, setName] = useState("Video frame"),
    [error, setError] = useState(""),
    [ready, setReady] = useState(false),
    [seeking, setSeeking] = useState(false),
    [busy, setBusy] = useState(false);
  const [time, setTime] = useState(0),
    [duration, setDuration] = useState(0),
    [size, setSize] = useState([0, 0]),
    [preview, setPreview] = useState(""),
    [capturedAt, setCapturedAt] = useState(0),
    [quality, setQuality] = useState(100),
    [format, setFormat] = useState<"png" | "jpeg">("png");
  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  useEffect(
    () => () => {
      if (capture.current) {
        capture.current.width = 0;
        capture.current.height = 0;
      }
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
    setError("");
    setPreview("");
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
    if (!v || !ready || v.seeking) return;
    setBusy(true);
    setError("");
    v.pause();
    try {
      if (v.readyState < 2)
        throw new Error("Wait for the frame to finish loading.");
      const canvas = document.createElement("canvas");
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const context = canvas.getContext("2d");
      if (!context)
        throw new Error(
          "Not enough memory for this frame. Close other tabs and try again.",
        );
      context.drawImage(v, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b
              ? resolve(b)
              : reject(
                  new Error(
                    "This frame is too large for this browser. Try another device.",
                  ),
                ),
          "image/png",
        ),
      );
      if (capture.current) {
        capture.current.width = 0;
        capture.current.height = 0;
      }
      capture.current = canvas;
      setPreview(URL.createObjectURL(blob));
      setCapturedAt(v.currentTime);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not capture this frame.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    const canvas = capture.current;
    if (!canvas) return;
    setBusy(true);
    try {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error("Could not encode this frame.")),
          "image/" + format,
          quality / 100,
        ),
      );
      download(
        blob,
        `${name}-${capturedAt.toFixed(3)}.${format === "jpeg" ? "jpg" : format}`,
      );
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
          onClick={onClose}
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
                onLoadedData={() => setReady(true)}
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
                disabled={!ready || seeking || busy}
                onClick={() => void captureFrame()}
              >
                <Camera size={18} /> {busy ? "Capturing…" : "Capture frame"}
              </button>
            </div>
            <p className="fine">
              Frame buttons seek by 1/30 second. Actual frame rate is
              unavailable; use the timestamp for precise seeking.
            </p>
          </section>
          <aside className="video-details">
            <h3>{preview ? "Captured frame" : "Your video"}</h3>
            {preview && (
              <img
                className="capture-preview"
                src={preview}
                alt="Captured video frame"
              />
            )}
            <dl>
              <dt>Resolution</dt>
              <dd>
                {size[0]} × {size[1]}
              </dd>
              <dt>{preview ? "Captured at" : "Duration"}</dt>
              <dd>{timestamp(preview ? capturedAt : duration)}</dd>
              <dt>Aspect ratio</dt>
              <dd>
                {size[0] && size[1]
                  ? `${size[0] / gcd(size[0], size[1])}:${size[1] / gcd(size[0], size[1])}`
                  : "—"}
              </dd>
            </dl>
            {preview ? (
              <>
                <label>
                  Format
                  <select
                    aria-label="Format"
                    value={format}
                    onChange={(e) =>
                      setFormat(e.target.value as "png" | "jpeg")
                    }
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
                  PNG is lossless. JPG uses lossy compression. Both retain
                  native frame dimensions.
                </p>
                <button
                  className="primary wide"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  <Download size={17} /> Download{" "}
                  {format === "jpeg" ? "JPG" : "PNG"}
                </button>
                <button
                  className="wide"
                  disabled={busy}
                  onClick={async () => {
                    if (!capture.current) return;
                    setBusy(true);
                    try {
                      await onEdit(capture.current.toDataURL("image/png"));
                    } catch (e) {
                      setError(String(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <ImagePlus size={17} /> Edit in Eddict
                </button>
                <button className="wide subtle" onClick={() => setPreview("")}>
                  Retake
                </button>
              </>
            ) : (
              <p className="fine">
                Capture a frame to download it or give it your finishing touch
                in the editor.
              </p>
            )}
            <button className="wide" onClick={() => input.current?.click()}>
              Choose another video
            </button>
          </aside>
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="privacy video-privacy">
        <ShieldCheck size={16} /> Your video stays on your device.
      </p>
    </div>
  );
}
