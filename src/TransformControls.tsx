import { useRef } from "react";
import type { Editor } from "./editor";

export default function TransformControls({
  editor: e,
  busy,
}: {
  editor: Editor;
  busy: boolean;
}) {
  const dirty = useRef(false);
  function flush() {
    if (dirty.current) {
      dirty.current = false;
      e.commit();
    }
  }
  function update(value: number, kind: "size" | "angle") {
    dirty.current = true;
    e.transformLayer(value, kind);
  }
  const layer = e.selected;
  if (!layer || layer.layerType === "base-image") return null;
  const size = Math.round(((layer.width * layer.scaleX) / e.width) * 100);
  const angle = Math.round(((((layer.angle + 180) % 360) + 360) % 360) - 180);
  return (
    <fieldset className="transform-controls" disabled={busy || layer.locked}>
      <legend>{layer.name} · Drag to move</legend>
      <label>
        Size · {size}%
        <input
          aria-label="Sticker size"
          type="range"
          min="2"
          max={Math.max(150, size)}
          value={size}
          disabled={!!layer.sizeLocked}
          onChange={(event) => update(+event.target.value, "size")}
          onPointerUp={flush}
          onPointerCancel={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
      </label>
      <button
        aria-pressed={!!layer.sizeLocked}
        onClick={() => e.toggleSizeLock()}
      >
        {layer.sizeLocked ? "Unlock size" : "Lock size"}
      </button>
      <label>
        Rotate · {angle}°
        <input
          aria-label="Sticker rotation"
          type="range"
          min="-180"
          max="180"
          value={angle}
          onChange={(event) => update(+event.target.value, "angle")}
          onPointerUp={flush}
          onPointerCancel={flush}
          onKeyUp={flush}
          onBlur={flush}
        />
      </label>
      <button onClick={() => e.transformLayer(0, "angle", true)}>
        Reset rotation
      </button>
    </fieldset>
  );
}
