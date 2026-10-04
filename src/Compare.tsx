import { useEffect, useRef, useState } from "react";
import type { Editor } from "./editor";
export default function Compare({ editor }: { editor: Editor }) {
  const [split, setSplit] = useState(50),
    mount = useRef<HTMLDivElement>(null);
  const width = editor.canvas.width,
    height = editor.canvas.height;
  useEffect(() => {
    const canvas = editor.beforeCanvas();
    if (!canvas) return;
    canvas.setAttribute("aria-label", "Original photo before edits");
    mount.current?.replaceChildren(canvas);
    return () => {
      canvas.width = 0;
      canvas.height = 0;
      canvas.remove();
    };
  }, [editor, width, height, editor.cursor]);
  return (
    <div className="compare-overlay" style={{ width, height }}>
      <div
        className="compare-original"
        ref={mount}
        style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
      />
      <span className="compare-label before-label">Before</span>
      <span className="compare-label after-label">After</span>
      <div className="compare-divider" style={{ left: split + "%" }}>
        <span>↔</span>
      </div>
      <input
        aria-label="Before and after comparison"
        type="range"
        min="0"
        max="100"
        value={split}
        onChange={(e) => setSplit(+e.target.value)}
      />
    </div>
  );
}
