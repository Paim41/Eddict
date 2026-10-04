let worker: Worker | undefined;
let nextId = 0;
const tasks = new Map<
  number,
  { resolve: (blob: Blob) => void; reject: (error: Error) => void }
>();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL("./media.worker.ts", import.meta.url), {
    type: "module",
  });
  worker.onmessage = (e) => {
    const task = tasks.get(e.data.id);
    if (!task) return;
    tasks.delete(e.data.id);
    if (e.data.error) task.reject(new Error(e.data.error));
    else task.resolve(e.data.blob);
  };
  worker.onerror = () => {
    for (const task of tasks.values())
      task.reject(new Error("Image encoding failed. Try again."));
    tasks.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}
function request(data: object, transfer: Transferable[] = []) {
  const id = ++nextId;
  return new Promise<Blob>((resolve, reject) => {
    try {
      const w = getWorker();
      tasks.set(id, { resolve, reject });
      w.postMessage({ id, ...data }, { transfer });
    } catch (error) {
      tasks.delete(id);
      reject(error);
    }
  });
}
export async function encodeCanvas(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality = 1,
) {
  if (typeof OffscreenCanvas !== "undefined" && typeof Worker !== "undefined") {
    try {
      const bitmap = await createImageBitmap(canvas);
      return await request({ bitmap, type, quality }, [bitmap]);
    } catch {
      /* Native encoding remains available without workers. */
    }
  }
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not encode this image.")),
      type,
      quality,
    ),
  );
}
export async function encodeBlob(source: Blob, type: string, quality: number) {
  if (type === source.type) return source;
  const bitmap = await createImageBitmap(source);
  try {
    return await request({ bitmap, type, quality }, [bitmap]);
  } catch {
    const fallback = await createImageBitmap(source);
    const canvas = document.createElement("canvas");
    canvas.width = fallback.width;
    canvas.height = fallback.height;
    canvas.getContext("2d")!.drawImage(fallback, 0, 0);
    fallback.close();
    try {
      return await encodeCanvas(canvas, type, quality);
    } finally {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
export function zipCaptures(files: { name: string; blob: Blob }[]) {
  return request({ files });
}
