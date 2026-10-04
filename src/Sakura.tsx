import { useEffect, useRef } from "react";

export function createSakura(container: HTMLElement, initial = false) {
  if (container.childElementCount >= 200) return;
  const petal = document.createElement("div");
  petal.className = "sakura";
  const fallDuration = Math.random() * 10 + 14;
  const vars: Record<string, string> = {
    "--size": `${Math.random() * 22 + 16}px`,
    "--fall-duration": `${fallDuration}s`,
    "--sway-duration": `${Math.random() * 4 + 4}s`,
    "--spin-duration": `${Math.random() * 7 + 5}s`,
    "--opacity": String(Math.random() * 0.4 + 0.5),
    "--drift": `${Math.random() * 80 - 40}px`,
    "--delay": initial ? `${-Math.random() * fallDuration}s` : "0s",
  };
  petal.style.left = `${Math.random() * 100}vw`;
  for (const [key, value] of Object.entries(vars))
    petal.style.setProperty(key, value);
  petal.addEventListener("animationend", (event) => {
    if (event.animationName === "sakuraFall") petal.remove();
  });
  container.appendChild(petal);
}

export default function Sakura() {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = container.current!;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let interval: ReturnType<typeof setInterval> | undefined;
    function stop() {
      clearInterval(interval);
      element.replaceChildren();
    }
    function start() {
      stop();
      if (motion.matches || document.hidden) return;
      for (let i = 0; i < 100; i++) createSakura(element, true);
      interval = setInterval(() => {
        createSakura(element);
        createSakura(element);
      }, 250);
    }
    start();
    motion.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    return () => {
      stop();
      motion.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, []);
  return <div ref={container} id="sakura-container" aria-hidden="true" />;
}
