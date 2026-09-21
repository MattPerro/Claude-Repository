/**
 * Genera le icone dell'app dai colori dei token.
 *
 * Perche' uno script invece di file PNG nel repository: i colori vengono letti
 * da `packages/core/src/theme/palette.ts`, che e' l'unico posto in cui questo
 * progetto ammette un esadecimale (CLAUDE.md §6). Un PNG committato a mano
 * sarebbe una quarta copia di quei colori, invisibile al test del contrasto e
 * destinata a divergere.
 *
 * Il disegno viene reso da Chromium - lo stesso che serve al banco screenshot -
 * perche' in questo ambiente non c'e' nessuna libreria di grafica raster, e
 * scrivere un codificatore PNG a mano per tre rettangoli sarebbe lavoro
 * sprecato.
 *
 *     node tools/icons.mjs
 *
 * Le icone finiscono in `apps/mobile/public/` (PWA) e `apps/mobile/assets/`
 * (build nativa). Sono rigenerabili, quindi non sono tracciate: le genera
 * `tools/pwa-build.mjs` prima dell'esportazione.
 */

import { chromium } from 'playwright';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PALETTE = resolve(ROOT, 'packages/core/src/theme/palette.ts');
const PUBLIC_DIR = resolve(ROOT, 'apps/mobile/public');
const ASSETS_DIR = resolve(ROOT, 'apps/mobile/assets');

/** Legge un ruolo di colore dal tema scuro, senza duplicarne il valore qui. */
async function readDarkToken(role) {
  const source = await readFile(PALETTE, 'utf8');
  // Il tema scuro e' il primo blocco del file; si prende la prima occorrenza.
  const match = new RegExp(`${role}: '(#[0-9A-Fa-f]{6})'`).exec(source);
  if (match === null) {
    throw new Error(
      `Il ruolo di colore "${role}" non esiste in palette.ts. ` +
        'Le icone non vengono generate con un colore inventato.',
    );
  }
  return match[1];
}

/**
 * Il marchio: tre barre ascendenti.
 *
 * Non e' una scelta grafica ambiziosa, ed e' intenzionale: deve essere
 * riconoscibile a 48 pixel sulla schermata Home accanto ad altre venti icone,
 * e a quella dimensione una lettera stilizzata diventa una macchia.
 *
 * `inset` lascia la zona di sicurezza richiesta dalle icone `maskable`, che
 * Android puo' ritagliare in un cerchio.
 */
function markup({ size, background, accent, inset, radius, transparent }) {
  const pad = size * inset;
  const usable = size - pad * 2;
  const gap = usable * 0.12;
  const barWidth = (usable - gap * 2) / 3;
  const heights = [0.42, 0.68, 1];
  const bars = heights
    .map((h, i) => {
      const barHeight = usable * h;
      const x = pad + i * (barWidth + gap);
      const y = pad + (usable - barHeight);
      const r = Math.min(barWidth / 2, size * 0.04);
      return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="${r}" fill="${accent}"/>`;
    })
    .join('');
  const plate = transparent
    ? ''
    : `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${background}"/>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    svg{display:block}
  </style></head><body>
  <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${plate}${bars}
  </svg></body></html>`;
}

async function main() {
  const background = await readDarkToken('background');
  const accent = await readDarkToken('accent');
  const onAccent = await readDarkToken('onAccent');

  await mkdir(PUBLIC_DIR, { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });

  const jobs = [
    // PWA: le due dimensioni richieste dal manifest.
    { file: `${PUBLIC_DIR}/icon-192.png`, size: 192, inset: 0.2, radius: 0.22 },
    { file: `${PUBLIC_DIR}/icon-512.png`, size: 512, inset: 0.2, radius: 0.22 },
    // `maskable`: zona di sicurezza piu' ampia, perche' il sistema ritaglia.
    { file: `${PUBLIC_DIR}/icon-maskable-512.png`, size: 512, inset: 0.28, radius: 0 },
    // iOS usa questa per l'icona sulla schermata Home, e NON applica
    // arrotondamenti al contenuto: il piatto va disegnato quadrato pieno.
    { file: `${PUBLIC_DIR}/apple-touch-icon.png`, size: 180, inset: 0.22, radius: 0 },
    { file: `${PUBLIC_DIR}/favicon.png`, size: 48, inset: 0.16, radius: 0.22 },
    // Icona delle notifiche della build nativa: monocromatica su trasparente,
    // come richiede Android (iOS la ignora).
    {
      file: `${ASSETS_DIR}/notification-icon.png`,
      size: 96,
      inset: 0.18,
      radius: 0,
      transparent: true,
      accent: onAccent,
    },
  ];

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  try {
    for (const job of jobs) {
      const page = await browser.newPage({
        viewport: { width: job.size, height: job.size },
        deviceScaleFactor: 1,
      });
      await page.setContent(
        markup({
          size: job.size,
          background,
          accent: job.accent ?? accent,
          inset: job.inset,
          radius: job.radius,
          transparent: job.transparent === true,
        }),
      );
      const png = await page.screenshot({ omitBackground: true });
      await writeFile(job.file, png);
      await page.close();
      console.log(`${job.file}  ${job.size}x${job.size}`);
    }
  } finally {
    await browser.close();
  }
}

await main();
