"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const POSTERS = [
  { src: "/landing/poster-1.png", alt: "Diseño promocional de nuevos sabores" },
  {
    src: "/landing/poster-2.png",
    alt: "Diseño promocional de una campaña de verano",
  },
  {
    src: "/landing/poster-3.png",
    alt: "Diseño promocional de un arreglo floral",
  },
  { src: "/landing/poster-4.png", alt: "Diseño promocional de una cafetería" },
  {
    src: "/landing/poster-5.png",
    alt: "Diseño promocional de una oferta de café",
  },
];

const RAIL_ITEMS = [...POSTERS, ...POSTERS];

/** Keep the animation clock bounded so it cannot lose precision over time. */
export function wrapRailOffset(value: number, total: number) {
  if (!total) return 0;
  return ((((value + total / 2) % total) + total) % total) - total / 2;
}

export function LandingPosterRail() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const stageElement = stage;

    const cards = Array.from(
      stageElement.querySelectorAll<HTMLElement>("[data-poster-card]")
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let offset = 0;
    let lastTime = performance.now();
    let paused = reduceMotion.matches;
    let dragging = false;
    let dragX = 0;
    let pointerStart = 0;
    let frame = 0;

    let spacing = 0;
    let total = 0;
    let speed = 24;

    function updateMetrics() {
      // offsetWidth is not affected by CSS 2D/3D transforms (unlike getBoundingClientRect)
      const cardWidth = cards[0]?.offsetWidth || cards[0]?.getBoundingClientRect().width || 190;
      const newSpacing = cardWidth * 0.8;
      const newTotal = newSpacing * cards.length;
      const newSpeed = Math.max(18, cardWidth * 0.12);

      if (total > 0 && newTotal > 0) {
        offset = (offset / total) * newTotal;
      }
      spacing = newSpacing;
      total = newTotal;
      speed = newSpeed;
    }

    function render() {
      if (!total || !spacing) return;
      cards.forEach((card, index) => {
        const x = wrapRailOffset(index * spacing - offset + dragX, total);
        const fan = Math.max(-2.6, Math.min(2.6, spacing ? x / spacing : 0));
        const distance = Math.abs(fan);
        const rotate = fan * 4.45;
        const y = Math.pow(distance, 1.35) * 16;
        const scale = 1 - Math.min(distance * 0.023, 0.065);
        const opacity = Math.max(0.16, 1 - Math.max(0, distance - 3) * 0.42);

        card.style.transform = `translate3d(calc(-50% + ${x}px), ${y}px, 0) rotate(${rotate}deg) scale(${scale})`;
        card.style.zIndex = String(Math.round(100 - distance * 10));
        card.style.opacity = String(opacity);
      });
    }

    function tick(now: number) {
      const dt = Math.min(50, Math.max(0, now - lastTime)) / 1000;
      lastTime = now;
      if (!paused && !dragging && !reduceMotion.matches && total > 0) {
        offset = wrapRailOffset(offset + speed * dt, total);
      }
      render();
      frame = requestAnimationFrame(tick);
    }

    function onPointerDown(event: PointerEvent) {
      dragging = true;
      pointerStart = event.clientX;
      stageElement.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (!dragging) return;
      dragX = event.clientX - pointerStart;
      render();
    }

    function endDrag(event: PointerEvent) {
      if (!dragging) return;
      if (total > 0) {
        offset = (((offset - dragX) % total) + total) % total;
      } else {
        offset -= dragX;
      }
      dragX = 0;
      dragging = false;
      if (stageElement.hasPointerCapture(event.pointerId))
        stageElement.releasePointerCapture(event.pointerId);
    }

    const pause = () => {
      paused = true;
    };
    const resume = () => {
      paused = reduceMotion.matches;
      lastTime = performance.now();
    };
    const onMotionPreferenceChange = () => {
      paused = reduceMotion.matches;
      render();
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        paused = true;
      } else {
        lastTime = performance.now();
        paused = reduceMotion.matches;
      }
    };

    updateMetrics();

    stageElement.addEventListener("pointerenter", pause);
    stageElement.addEventListener("pointerleave", resume);
    stageElement.addEventListener("pointerdown", onPointerDown);
    stageElement.addEventListener("pointermove", onPointerMove);
    stageElement.addEventListener("pointerup", endDrag);
    stageElement.addEventListener("pointercancel", endDrag);

    const onResize = () => {
      updateMetrics();
      render();
    };
    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", onVisibilityChange);
    reduceMotion.addEventListener?.("change", onMotionPreferenceChange);

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        updateMetrics();
        render();
      });
      resizeObserver.observe(stageElement);
    }

    render();
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      stageElement.removeEventListener("pointerenter", pause);
      stageElement.removeEventListener("pointerleave", resume);
      stageElement.removeEventListener("pointerdown", onPointerDown);
      stageElement.removeEventListener("pointermove", onPointerMove);
      stageElement.removeEventListener("pointerup", endDrag);
      stageElement.removeEventListener("pointercancel", endDrag);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reduceMotion.removeEventListener?.("change", onMotionPreferenceChange);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, []);

  return (
    <div
      className="landing-poster-window"
      role="group"
      aria-label="Diseños creados con HiTrendy"
    >
      <div className="landing-poster-stage" ref={stageRef}>
        {RAIL_ITEMS.map((poster, index) => (
          <figure
            className="landing-poster-card"
            data-poster-card
            key={`${poster.src}-${index}`}
            aria-hidden={index >= POSTERS.length ? true : undefined}
          >
            <Image
              src={poster.src}
              alt={index >= POSTERS.length ? "" : poster.alt}
              width={260}
              height={390}
              priority={index < POSTERS.length}
              draggable={false}
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
