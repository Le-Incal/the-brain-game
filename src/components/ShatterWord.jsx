import { useEffect, useRef } from 'react';

const FONT_FAMILY = "'Playfair Display', Georgia, serif";
const TOTAL_MS = 1800;
const CRACK_MS = 90;
const GRAVITY = 520;
const MAX_SHARDS = 96;

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function measureFontSize() {
  return Math.max(12, Math.min(14, window.innerWidth * 0.012));
}

/** Binary-space partition into irregular glass panes. */
function buildInitialShards(width, height, count = 8) {
  let rects = [{ x: 0, y: 0, w: width, h: height }];

  let attempts = 0;
  while (rects.length < count && attempts < 32) {
    attempts += 1;
    const i = rects.reduce(
      (best, r, idx, arr) => (r.w * r.h > arr[best].w * arr[best].h ? idx : best),
      0
    );
    const r = rects.splice(i, 1)[0];
    if (r.w < 14 || r.h < 10) {
      rects.push(r);
      continue;
    }
    const horizontal = r.w > r.h ? Math.random() > 0.35 : Math.random() > 0.65;
    if (horizontal) {
      const cut = r.h * rand(0.28, 0.72);
      rects.push(
        { x: r.x, y: r.y, w: r.w, h: cut },
        { x: r.x, y: r.y + cut, w: r.w, h: r.h - cut }
      );
    } else {
      const cut = r.w * rand(0.28, 0.72);
      rects.push(
        { x: r.x, y: r.y, w: cut, h: r.h },
        { x: r.x + cut, y: r.y, w: r.w - cut, h: r.h }
      );
    }
  }

  const cx = width / 2;
  const cy = height / 2;

  return rects.map((r) => {
    const px = r.x + r.w / 2;
    const py = r.y + r.h / 2;
    const angle = Math.atan2(py - cy, px - cx);
    return {
      sx: r.x,
      sy: r.y,
      sw: r.w,
      sh: r.h,
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      vx: Math.cos(angle) * rand(40, 140) + rand(-30, 30),
      vy: Math.sin(angle) * rand(20, 80) - rand(10, 40),
      rot: rand(-0.4, 0.4),
      vr: rand(-2.5, 2.5),
      gen: 0,
      nextSplit: performance.now() + CRACK_MS + rand(80, 220),
      opacity: 1,
    };
  });
}

function makeChild(parent, x, y, w, h, now) {
  const gen = parent.gen + 1;
  const scaleX = parent.sw / parent.w;
  const scaleY = parent.sh / parent.h;
  const dustFactor = Math.pow(0.55, gen);
  return {
    sx: parent.sx + (x - parent.x) * scaleX,
    sy: parent.sy + (y - parent.y) * scaleY,
    sw: w * scaleX,
    sh: h * scaleY,
    x,
    y,
    w,
    h,
    vx: parent.vx * 0.55 + rand(-70, 70) * dustFactor,
    vy: parent.vy * 0.45 + rand(-50, 50) * dustFactor + rand(20, 80),
    rot: parent.rot + rand(-0.5, 0.5),
    vr: parent.vr * 1.35 + rand(-4, 4),
    gen,
    nextSplit: now + rand(50, 130) / (gen + 0.8),
    opacity: 1,
  };
}

function splitShard(shard, now) {
  const pieces = [];
  const cuts = 2;
  const horizontal = shard.w >= shard.h;

  if (horizontal) {
    let y = shard.y;
    const end = shard.y + shard.h;
    for (let i = 0; i < cuts && y < end - 1; i++) {
      const remain = end - y;
      const h = i === cuts - 1 ? remain : remain * rand(0.22, 0.55);
      if (h > 0.8) pieces.push(makeChild(shard, shard.x, y, shard.w, h, now));
      y += h;
    }
  } else {
    let x = shard.x;
    const end = shard.x + shard.w;
    for (let i = 0; i < cuts && x < end - 1; i++) {
      const remain = end - x;
      const w = i === cuts - 1 ? remain : remain * rand(0.22, 0.55);
      if (w > 0.8) pieces.push(makeChild(shard, x, shard.y, w, shard.h, now));
      x += w;
    }
  }

  return pieces;
}

export function splitWordLines(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function renderTextSource(text, font, fontSize, letterSpacing) {
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = font;
  const lines = splitWordLines(text);
  const lineWidths = lines.map(
    (line) =>
      measure.measureText(line).width +
      letterSpacing * Math.max(0, line.length - 1)
  );
  const textW = Math.max(...lineWidths, 1);
  const lineHeight = fontSize * 1.24;
  const pad = 16;
  const srcW = Math.ceil(textW + pad * 2);
  const srcH = Math.ceil(lineHeight * Math.max(lines.length, 1) + pad * 2);

  const source = document.createElement('canvas');
  source.width = srcW;
  source.height = srcH;
  const sctx = source.getContext('2d');
  sctx.font = font;
  sctx.fillStyle = '#1a1814';
  sctx.textBaseline = 'middle';
  sctx.textAlign = 'left';
  lines.forEach((line, lineIndex) => {
    let tx = (srcW - lineWidths[lineIndex]) / 2;
    const ty = pad + lineHeight * (lineIndex + 0.5);
    for (const ch of line) {
      sctx.fillText(ch, tx, ty);
      tx += sctx.measureText(ch).width + letterSpacing;
    }
  });

  return { source, srcW, srcH };
}

/**
 * Canvas shatter: glass crack → large shards → exponential dust.
 */
export function ShatterWord({ text, x, y, onComplete }) {
  const canvasRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !text) return undefined;

    const fontSize = measureFontSize();
    const letterSpacing = fontSize * 0.18;
    const font = `700 ${fontSize}px ${FONT_FAMILY}`;
    const { source, srcW, srcH } = renderTextSource(text, font, fontSize, letterSpacing);

    canvas.width = srcW + 180;
    canvas.height = srcH + 320;
    const ctx = canvas.getContext('2d');

    const start = performance.now();
    let shards = buildInitialShards(srcW, srcH);
    let raf = 0;
    let last = start;

    const tick = (now) => {
      const elapsed = now - start;
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ox = (canvas.width - srcW) / 2;
      const oy = (canvas.height - srcH) / 2;

      if (elapsed < CRACK_MS) {
        ctx.drawImage(source, ox, oy);
      } else {
        const next = [];
        for (const shard of shards) {
          shard.vy += GRAVITY * dt * Math.pow(0.82, shard.gen);
          shard.x += shard.vx * dt;
          shard.y += shard.vy * dt;
          shard.rot += shard.vr * dt;

          const area = shard.w * shard.h;
          const isDust = area < 10 || shard.gen >= 3 || next.length >= MAX_SHARDS;

          if (isDust) {
            shard.w *= 0.92;
            shard.h *= 0.92;
            shard.opacity -= dt * (2.4 + shard.gen * 0.45);
          } else if (now >= shard.nextSplit && shard.gen < 3 && area > 16) {
            const remainingCapacity = MAX_SHARDS - next.length;
            next.push(...splitShard(shard, now).slice(0, remainingCapacity));
            continue;
          }

          if (shard.opacity > 0.03 && shard.w > 0.4 && shard.h > 0.4) {
            next.push(shard);
          }
        }
        shards = next;

        for (const shard of shards) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, shard.opacity));
          ctx.translate(ox + shard.x + shard.w / 2, oy + shard.y + shard.h / 2);
          ctx.rotate(shard.rot);
          ctx.drawImage(
            source,
            shard.sx,
            shard.sy,
            Math.max(1, shard.sw),
            Math.max(1, shard.sh),
            -shard.w / 2,
            -shard.h / 2,
            Math.max(0.5, shard.w),
            Math.max(0.5, shard.h)
          );
          ctx.restore();
        }
      }

      if (elapsed < TOTAL_MS && (elapsed < CRACK_MS || shards.length > 0)) {
        raf = requestAnimationFrame(tick);
      } else {
        onCompleteRef.current?.();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, x, y]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      style={{
        position: 'absolute',
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    />
  );
}
