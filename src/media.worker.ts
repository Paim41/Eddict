import { zipSync } from "fflate";
self.onmessage = async (event: MessageEvent) => {
  const { id, bitmap, type, quality, files } = event.data;
  try {
    let blob: Blob;
    if (files) {
      const entries: Record<string, Uint8Array> = {};
      for (const file of files)
        entries[file.name] = new Uint8Array(await file.blob.arrayBuffer());
      const archive = zipSync(entries, { level: 0 });
      blob = new Blob([archive as Uint8Array<ArrayBuffer>], {
        type: "application/zip",
      });
    } else {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
      bitmap.close();
      blob = await canvas.convertToBlob({ type, quality });
      canvas.width = 0;
      canvas.height = 0;
    }
    self.postMessage({ id, blob });
  } catch (error) {
    bitmap?.close();
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Image encoding failed.",
    });
  }
};
