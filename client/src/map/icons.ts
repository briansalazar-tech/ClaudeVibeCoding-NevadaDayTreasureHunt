import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Point icons are drawn on a canvas when MapLibre first asks for them (the missing-image resolver),
 * so they work on every basemap, raster ones included, and survive basemap switches.
 * An icon id encodes its look: `hunt-icon:<shape>:<fill color>:<size in px>`.
 */
export type IconShape =
  'circle' | 'square' | 'diamond' | 'triangle' | 'star' | 'house' | 'pin' | 'ring';

const PREFIX = 'hunt-icon:';

export function iconId(shape: IconShape, fill: string, size: number): string {
  return `${PREFIX}${shape}:${fill}:${size}`;
}

const PIXEL_RATIO = 2;

function path(ctx: CanvasRenderingContext2D, shape: IconShape, s: number): void {
  const c = s / 2;
  const r = s / 2 - 2;
  ctx.beginPath();
  switch (shape) {
    case 'circle':
    case 'ring':
      ctx.arc(c, c, r, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(2, 2, s - 4, s - 4);
      break;
    case 'diamond':
      ctx.moveTo(c, 1);
      ctx.lineTo(s - 1, c);
      ctx.lineTo(c, s - 1);
      ctx.lineTo(1, c);
      ctx.closePath();
      break;
    case 'triangle':
      ctx.moveTo(c, 2);
      ctx.lineTo(s - 2, s - 3);
      ctx.lineTo(2, s - 3);
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const radius = i % 2 === 0 ? r : r * 0.45;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const x = c + radius * Math.cos(a);
        const y = c + radius * Math.sin(a);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      break;
    case 'house':
      ctx.moveTo(c, 2);
      ctx.lineTo(s - 2, c - 1);
      ctx.lineTo(s - 4, c - 1);
      ctx.lineTo(s - 4, s - 2);
      ctx.lineTo(4, s - 2);
      ctx.lineTo(4, c - 1);
      ctx.lineTo(2, c - 1);
      ctx.closePath();
      break;
    case 'pin':
      // A map pin: round head with a point at the bottom center (the icon anchors at the bottom).
      ctx.moveTo(c, s - 1);
      ctx.bezierCurveTo(c - s * 0.08, s * 0.72, 2, s * 0.55, 2, s * 0.36);
      ctx.arc(c, s * 0.36, c - 2, Math.PI, 0);
      ctx.bezierCurveTo(s - 2, s * 0.55, c + s * 0.08, s * 0.72, c, s - 1);
      ctx.closePath();
      break;
  }
}

/** Draws an icon from its id, or returns null when the id isn't one of ours. */
export function drawIcon(id: string): ImageData | null {
  if (!id.startsWith(PREFIX)) return null;
  const [shape, fill, sizeText] = id.slice(PREFIX.length).split(':') as [IconShape, string, string];
  const size = Number(sizeText) || 12;
  const s = size * PIXEL_RATIO;
  const canvas = document.createElement('canvas');
  canvas.width = s;
  canvas.height = s;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.lineJoin = 'round';
  path(ctx, shape, s);
  ctx.fillStyle = shape === 'ring' ? '#ffffff' : fill;
  ctx.fill();
  ctx.lineWidth = shape === 'ring' ? PIXEL_RATIO * 2.5 : PIXEL_RATIO * 1.25;
  ctx.strokeStyle = shape === 'ring' ? fill : '#ffffff';
  ctx.stroke();
  if (shape === 'pin') {
    ctx.beginPath();
    ctx.arc(s / 2, s * 0.36, s * 0.13, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
  return ctx.getImageData(0, 0, s, s);
}

/** Supplies our icons whenever a style asks for one it doesn't have. */
export function installIconProvider(map: MapLibreMap): void {
  map.setMissingStyleImageResolver((id) => {
    if (map.hasImage(id)) return;
    const image = drawIcon(id);
    if (image) map.addImage(id, image, { pixelRatio: PIXEL_RATIO });
  });
}
