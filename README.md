<div align="center">

<!-- LOGO_PLACEHOLDER: replace src below once the logo is uploaded -->
<img width="383" height="193" alt="Eddict Logo" src="https://github.com/user-attachments/assets/0bb07819-e387-4232-9f5b-9973ac3ed75e" />


# Eddict — Edit Addict

*A browser-based, local-first photo editor and native-resolution video frame capture tool. Everything stays on your device.*

<img src="https://img.shields.io/badge/React-TypeScript-FFE4EC?style=for-the-badge&logo=react&logoColor=FF8FAB" />
<img src="https://img.shields.io/badge/Vite-Fabric.js-FFF0F5?style=for-the-badge&logo=vite&logoColor=FF8FAB" />
<img src="https://img.shields.io/badge/Storage-Local--First-FFE4EC?style=for-the-badge&logo=googlechrome&logoColor=FF8FAB" />
<img src="https://img.shields.io/badge/Live%20Demo-eddict.vercel.app-FFB6C1?style=for-the-badge&logo=vercel&logoColor=white" />

</div>

---

## Features

- **Import anywhere** — upload, drop or paste JPEG, PNG and WebP photos
- **Fabric.js layers** — drag, proportional resize, rotate, opacity, duplicate, flip, visibility, lock, rename and reorder
- **Crop & canvas tools** — free and ratio crop, canvas resizing, undo/redo, reset, and IndexedDB recovery of the last project
- **Preset filters** — *Eddict Crystal*, *Eddict Porcelain* and *Black Aesthetic*, each applied as a real sequential pass; the Applied Filters list supports removal, reordering and clearing
- **Manual adjustments** — twelve controls on the same engine as the preset stages, run after the filter stack
- **Full-resolution export** — PNG, JPEG and WebP downloads; PNG/WebP keep transparency, JPEG uses a white background
- **Video frame capture** — local MP4/WebM/MOV preview, timestamp seeking, approximate frame stepping, native-resolution capture, lossless PNG or high-quality JPEG download, and direct editor handoff
- **Falling Sakura** — up to 200 petals, paused when the tab is hidden, disabled with reduced-motion preferences — *never included in exports*
- **Dual layout** — desktop inspector and mobile bottom toolbar/panel

---

## Stickers and comparison

The supplied Paint and Hanaelliesh watermark PNGs are included byte-for-byte with their transparency. *Only the visible bounds are used when placing them*, so their large transparent margins don't make the artwork appear tiny.

The base photo is locked against dragging, rotating and scaling with handles — added photo and sticker layers remain movable, and crop/resize tools still work. Layers has a **Replace photo** button that keeps the filter stack and layer order, fits a replacement base photo to cover the current canvas, and is fully undoable.

**Before / After** opens an adjustable split view comparing the current edited composition with the unfiltered base photo at the same crop and framing. *It is a preview only and never affects exports.*

---

## Performance and video gallery

Filter pixels are processed in a Web Worker using the same adjustment engine as the Adjust panel. The worker caches the last preset stack, reuses unchanged prefixes, and transfers raw pixels without reducing resolution. A specialised five-tap sharpness kernel preserves the previous convolution result. *Browsers without worker support fall back to the same main-thread engine.*

Exports avoid resizing the interactive canvas, encode in a background worker where supported, and cache the last unchanged export. Capturing video immediately adds a small gallery thumbnail while a lossless native-resolution PNG encodes in the background, and PNG downloads reuse that blob. All finished captures can be downloaded as a ZIP.

> **Session-only captures.** Captures stay available when switching to the editor and back, but *do not persist across a reload* — download them first. Two pending encodes and a 256 MB completed-gallery limit keep memory bounded.

---

## Stack and commands

| Layer | Choice |
|---|---|
| Framework | React, TypeScript (strict), Vite |
| Canvas | Fabric.js |
| Icons | Lucide React |
| Styling | Plain CSS |
| Backend | None required |
| Runtime | Node.js 22 or newer |

```sh
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm test
```

`lint` performs TypeScript checking. Browser tests use Playwright and installed Microsoft Edge — change the test config channel for another supported browser. The test runner starts a development server when needed.

### Optional video test fixture

*Requires FFmpeg:*

```powershell
New-Item -ItemType Directory -Force .test-assets
ffmpeg -f lavfi -i "testsrc2=size=640x360:rate=30:duration=2" -c:v libx264 -pix_fmt yuv420p -y .test-assets/sample.mp4
npm test
```

---

## Structure

```text
src/App.tsx        Shell and shortcuts
src/editor.ts       Canvas, adjustment pipeline, history and persistence
src/Panels.tsx       Editing panels and export
src/VideoStudio.tsx  Frame capture
src/Sakura.tsx       Background lifecycle
src/stickers.ts      Supplied-asset manifest
tests/               Browser regression tests
public/              Static assets
dist/                Production build output
```

---

## Privacy and limitations

| Area | Detail |
|---|---|
| Transmission | Photos, videos, edits and exports stay in the browser — *nothing is sent to a service* |
| Project recovery | IndexedDB saves the current project on this device and origin; local preview and hosted site storage are separate |
| Durability | Browser storage can be cleared or exhausted — export important edits |
| Photo limits | Optimised above 6000 px per side or 24 megapixels |
| Video limits | Native decoded dimensions, no resizing or enhancement; direct editor handoff keeps those dimensions up to a 64-megapixel safety limit |
| Seeking accuracy | Frame buttons seek by 1/30 second and don't claim a measured frame rate; codec support depends on the browser |

---

## Licensing

Filters are original Eddict adjustment implementations using supplied preset numbers. *Crystal and Porcelain are approximations, not official CapCut settings; Black Aesthetic approximates whites/blacks using existing controls.* No proprietary CapCut assets or Picsart sticker library are included. User-supplied sticker rights remain with their owners. Third-party code retains its package licenses.

---

## Screenshots

*Add approved screenshots here.* Browser test screenshots are temporary verification artifacts in `test-results/`.

---

## Deployment

Deploy the repository `Paim41/Eddict` to Vercel as a Vite project. `vercel.json` declares the production build and `dist` output — no environment variables or server are required. Imported photos and videos remain in the visitor's browser even when the app is hosted.

---

## Mobile composition controls

Toggle **Grid** for a rule-of-thirds guide — *it never appears in exports.* Select a sticker or added photo to use the Size and Rotate sliders below the canvas: Size keeps proportions, and rotation keeps the center in place. **Lock size** prevents corner or slider resizing while still allowing dragging and rotation, and the lock is saved with the project. Larger touch handles and corner-only scaling help avoid stretching. Quick canvas sizes respect Maintain aspect ratio; uncheck it to use the exact preset dimensions.

---

<div align="center">

*Edit locally, export instantly — nothing ever leaves your browser.*

</div>
