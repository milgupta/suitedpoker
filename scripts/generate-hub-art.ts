/**
 * Geometric placeholder art for hub cards until AI images replace them.
 * Run: npx tsx scripts/generate-hub-art.ts  (or node via the shell one-liner)
 */
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "public/brand/hub");
mkdirSync(OUT, { recursive: true });

const CANVAS = "#0a0c12";
const ACCENT = "#3b82f6";
const ACCENT_DIM = "#1e3a8a";
const SURFACE = "#141820";
const WHITE = "#e8eef8";

async function png(name: string, width: number, height: number, body: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${CANVAS}"/>
    ${body}
  </svg>`;
  await sharp(Buffer.from(svg))
    .png()
    .toFile(join(OUT, `${name}.png`));
  console.log("wrote", name);
}

function cardsArc(): string {
  return [0, 1, 2, 3, 4]
    .map((i) => {
      const x = 180 + i * 120;
      const y = 220 + Math.abs(i - 2) * 18;
      const rot = (i - 2) * 8;
      return `<g transform="translate(${x},${y}) rotate(${rot})">
        <rect x="-40" y="-56" width="80" height="112" rx="10" fill="${SURFACE}" stroke="${ACCENT}" stroke-opacity="0.55" stroke-width="2"/>
        <rect x="-28" y="-40" width="56" height="80" rx="6" fill="${ACCENT_DIM}" opacity="0.5"/>
      </g>`;
    })
    .join("");
}

function seats(): string {
  return [0, 1, 2, 3, 4, 5]
    .map((i) => {
      const a = (Math.PI * 2 * i) / 6 - Math.PI / 2;
      const x = 480 + Math.cos(a) * 300;
      const y = 300 + Math.sin(a) * 168;
      return `<circle cx="${x}" cy="${y}" r="14" fill="${SURFACE}" stroke="${ACCENT}" stroke-opacity="0.6" stroke-width="2"/>`;
    })
    .join("");
}

function rangeGrid(): string {
  const size = 28;
  const gap = 4;
  const ox = (960 - (13 * size + 12 * gap)) / 2;
  const oy = (600 - (13 * size + 12 * gap)) / 2;
  const cells: string[] = [];
  for (let r = 0; r < 13; r++) {
    for (let c = 0; c < 13; c++) {
      const x = ox + c * (size + gap);
      const y = oy + r * (size + gap);
      const accent = (r + c) % 5 === 0 || r === c;
      cells.push(
        `<rect x="${x}" y="${y}" width="${size}" height="${size}" rx="4" fill="${accent ? ACCENT : SURFACE}" opacity="${accent ? 0.55 : 0.85}"/>`,
      );
    }
  }
  return cells.join("");
}

async function main() {
  await png(
    "hub-daily",
    960,
    600,
    `
  <defs>
    <radialGradient id="glow" cx="50%" cy="30%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${CANVAS}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#glow)"/>
  ${cardsArc()}
  <path d="M480 120 C470 150 490 160 480 190 C500 165 510 140 480 120Z" fill="${ACCENT}" opacity="0.7"/>
`,
  );

  await png(
    "hub-arena",
    960,
    600,
    `
  <defs>
    <linearGradient id="bar" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}"/>
      <stop offset="55%" stop-color="${ACCENT}"/>
      <stop offset="55%" stop-color="${ACCENT_DIM}"/>
      <stop offset="100%" stop-color="${ACCENT_DIM}"/>
    </linearGradient>
  </defs>
  <rect x="300" y="160" width="140" height="200" rx="14" fill="${SURFACE}" stroke="${ACCENT}" stroke-width="2"/>
  <rect x="460" y="160" width="140" height="200" rx="14" fill="${SURFACE}" stroke="${ACCENT}" stroke-opacity="0.5" stroke-width="2"/>
  <text x="370" y="275" text-anchor="middle" fill="${WHITE}" font-family="system-ui" font-size="48" font-weight="700">A</text>
  <text x="530" y="275" text-anchor="middle" fill="${WHITE}" font-family="system-ui" font-size="48" font-weight="700">K</text>
  <rect x="240" y="420" width="480" height="28" rx="14" fill="${SURFACE}"/>
  <rect x="240" y="420" width="480" height="28" rx="14" fill="url(#bar)" opacity="0.9"/>
`,
  );

  await png(
    "hub-table",
    960,
    600,
    `
  <defs>
    <radialGradient id="well" cx="50%" cy="50%" r="45%">
      <stop offset="0%" stop-color="#12162a"/>
      <stop offset="100%" stop-color="${CANVAS}"/>
    </radialGradient>
  </defs>
  <ellipse cx="480" cy="300" rx="320" ry="180" fill="url(#well)"/>
  <ellipse cx="480" cy="300" rx="320" ry="180" fill="none" stroke="${ACCENT}" stroke-width="6" opacity="0.85"/>
  <ellipse cx="480" cy="300" rx="300" ry="162" fill="none" stroke="${ACCENT}" stroke-width="2" opacity="0.35"/>
  ${seats()}
`,
  );

  await png(
    "hub-learn",
    960,
    600,
    `
  <rect x="260" y="280" width="440" height="160" rx="18" fill="${SURFACE}" stroke="${ACCENT}" stroke-opacity="0.25" stroke-width="2"/>
  <rect x="290" y="220" width="380" height="160" rx="18" fill="${SURFACE}" stroke="${ACCENT}" stroke-opacity="0.4" stroke-width="2"/>
  <rect x="320" y="160" width="320" height="160" rx="18" fill="${SURFACE}" stroke="${ACCENT}" stroke-width="2"/>
  <path d="M480 210 C460 240 445 265 480 300 C515 265 500 240 480 210 Z M465 300 L495 300 L480 330 Z" fill="${ACCENT}" opacity="0.75"/>
`,
  );

  await png("hub-ranges", 960, 600, rangeGrid());

  await png(
    "hub-progress",
    960,
    600,
    `
  <circle cx="280" cy="300" r="90" fill="none" stroke="${SURFACE}" stroke-width="16"/>
  <circle cx="280" cy="300" r="90" fill="none" stroke="${ACCENT}" stroke-width="16" stroke-dasharray="420 565" stroke-linecap="round" transform="rotate(-90 280 300)"/>
  <polyline points="420,380 500,300 560,330 640,200 720,240 800,160" fill="none" stroke="${ACCENT}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="800" cy="160" r="8" fill="${WHITE}"/>
`,
  );

  console.log("hub art ready in", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
