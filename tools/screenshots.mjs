#!/usr/bin/env node
/**
 * Banco per gli SCREENSHOT DI REVISIONE.
 *
 * ---------------------------------------------------------------------------
 * CHE COSA E' E CHE COSA NON E'
 *
 * La specifica (§17) richiede che i revisori visivi guardino "schermate
 * effettivamente prodotte dall'app", non descrizioni. In questo ambiente non
 * esistono simulatore iOS ne' dispositivo, quindi l'unico modo di produrre
 * schermate reali e' renderizzare l'app con react-native-web ed acquisirle in
 * Chromium.
 *
 * Il risultato e' quindi:
 *   - **schermate reali**, prodotte dal codice dell'app;
 *   - **rese da un browser**, non da iOS.
 *
 * Non sono una verifica su dispositivo, e nessun report deve presentarle come
 * tale. Servono a cogliere i difetti che si vedono a occhio - contrasto reale,
 * gerarchia, troncamenti, testi che sbordano con i caratteri grandi - che una
 * lettura del codice non coglie.
 *
 * Differenze note fra il rendering web e quello iOS, da tenere presenti
 * leggendo le immagini: i font di sistema (San Francisco non e' disponibile su
 * Linux), il comportamento della tastiera, le aree sicure, l'aptica, le
 * animazioni native e le ombre.
 *
 * `react-native-web` e `react-dom` stanno in `devDependencies`: sono strumenti
 * di revisione, e `app.json` **non** dichiara la piattaforma web. Non esiste
 * una versione web del prodotto.
 * ---------------------------------------------------------------------------
 *
 * Uso:
 *   node tools/screenshots.mjs            # esporta, serve, acquisisce
 *   node tools/screenshots.mjs --skip-export   # riusa un export esistente
 *
 * Output in `artifacts/screenshots/` (ignorato da Git).
 */

import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const WEB_DIR = path.join(ROOT, 'artifacts', 'web');
const OUT_DIR = path.join(ROOT, 'artifacts', 'screenshots');
const PORT = 8099;

/**
 * Viewport dell'iPhone 15 in punti logici (393 x 852) con rapporto pixel 3.
 * Sono le dimensioni dichiarate da Apple per il dispositivo prioritario del
 * progetto: le schermate vanno guardate a questa larghezza, perche' e' la
 * larghezza in cui i troncamenti compaiono.
 */
const IPHONE_15 = { width: 393, height: 852, deviceScaleFactor: 3 };

/** Rotte da acquisire. Percorso -> nome del file. */
const ROUTES = [
  ['/', 'oggi'],
  ['/calendario', 'calendario'],
  ['/programma', 'programma'],
  ['/progressi', 'progressi'],
  ['/coach', 'coach'],
  ['/impostazioni', 'impostazioni'],
  ['/onboarding', 'onboarding'],
];

/**
 * Condizioni in cui acquisire ogni rotta.
 *
 * `fontScale` simula i caratteri ingranditi di iOS agendo sulla dimensione
 * radice: e' un'approssimazione del comportamento di `allowFontScaling`, utile
 * per trovare i testi che sbordano. Non e' identico a iOS.
 */
const CONDITIONS = [
  { name: 'scuro', scheme: 'dark', fontScale: 1 },
  { name: 'chiaro', scheme: 'light', fontScale: 1 },
  { name: 'scuro-caratteri-grandi', scheme: 'dark', fontScale: 1.35 },
];

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} -> exit ${String(code)}`));
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Server statico minimale.
 *
 * L'export di Expo per il web produce un'applicazione a pagina singola: ogni
 * percorso sconosciuto ricade su `index.html`, altrimenti le rotte di
 * expo-router restituiscono 404.
 */
function serveStatic(dir, port) {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${String(port)}`);
    let filePath = path.join(dir, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(dir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || !path.extname(filePath)) {
      const candidate = `${filePath}.html`;
      filePath = existsSync(candidate) ? candidate : path.join(dir, 'index.html');
    }
    if (!existsSync(filePath)) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream' });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      resolve(server);
    });
  });
}

async function main() {
  const skipExport = process.argv.includes('--skip-export');

  if (!skipExport) {
    console.log('== Export dell app per il web (solo per la revisione) ==');
    await run('npx', ['expo', 'export', '--platform', 'web', '--output-dir', WEB_DIR, '--no-minify'], {
      cwd: path.join(ROOT, 'apps', 'mobile'),
      env: { ...process.env, EXPO_NO_TELEMETRY: '1' },
    });
  }

  if (!existsSync(path.join(WEB_DIR, 'index.html'))) {
    throw new Error(
      `Export non trovato in ${WEB_DIR}. Esegui senza --skip-export, oppure controlla l'output di expo export.`,
    );
  }

  await mkdir(OUT_DIR, { recursive: true });

  // Import differito: se Playwright non e' installato, il messaggio deve
  // essere comprensibile invece di un errore di modulo.
  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'Playwright non e installato. Installalo con `npm i -D playwright` ' +
        '(il browser Chromium e gia presente in PLAYWRIGHT_BROWSERS_PATH).',
    );
  }

  const server = await serveStatic(WEB_DIR, PORT);
  console.log(`== Server statico su http://127.0.0.1:${String(PORT)} ==`);

  const browser = await chromium.launch();
  const taken = [];
  const problems = [];

  try {
    for (const condition of CONDITIONS) {
      const context = await browser.newContext({
        viewport: { width: IPHONE_15.width, height: IPHONE_15.height },
        deviceScaleFactor: IPHONE_15.deviceScaleFactor,
        colorScheme: condition.scheme,
        locale: 'it-IT',
        timezoneId: 'Europe/Rome',
        isMobile: true,
        hasTouch: true,
      });

      const page = await context.newPage();
      // Raccoglie gli errori della console: un'eccezione durante il rendering
      // e' un difetto, e va nel report insieme alle immagini.
      page.on('pageerror', (error) => {
        problems.push(`[${condition.name}] pageerror: ${error.message}`);
      });
      page.on('console', (message) => {
        if (message.type() === 'error') {
          problems.push(`[${condition.name}] console.error: ${message.text()}`);
        }
      });

      if (condition.fontScale !== 1) {
        await page.addInitScript((scale) => {
          document.addEventListener('DOMContentLoaded', () => {
            document.documentElement.style.fontSize = `${String(16 * scale)}px`;
          });
        }, condition.fontScale);
      }

      for (const [route, name] of ROUTES) {
        const url = `http://127.0.0.1:${String(PORT)}${route}`;
        try {
          await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
          // Attesa breve per il primo rendering di react-native-web.
          await page.waitForTimeout(1200);
          const file = path.join(OUT_DIR, `${name}--${condition.name}.png`);
          await page.screenshot({ path: file, fullPage: false });
          taken.push(path.relative(ROOT, file));
          console.log(`  acquisita ${path.relative(ROOT, file)}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          problems.push(`[${condition.name}] ${route}: ${message}`);
          console.log(`  FALLITA ${route} (${condition.name}): ${message}`);
        }
      }

      await context.close();
    }
  } finally {
    await browser.close();
    server.close();
  }

  const report = [
    '# Screenshot di revisione',
    '',
    `Acquisiti il ${new Date().toISOString().slice(0, 10)}.`,
    '',
    '> **Queste schermate sono rese da un browser (react-native-web in Chromium),',
    '> NON da iOS.** Sono schermate reali prodotte dal codice dell\'app, e servono',
    '> alla revisione visiva richiesta dalla specifica §17. Non costituiscono una',
    '> verifica su dispositivo.',
    '',
    `Viewport: ${String(IPHONE_15.width)} x ${String(IPHONE_15.height)} punti, rapporto pixel ${String(IPHONE_15.deviceScaleFactor)} (iPhone 15).`,
    '',
    '## Immagini',
    '',
    ...taken.map((f) => `- \`${f}\``),
    '',
    '## Problemi rilevati durante l acquisizione',
    '',
    problems.length === 0
      ? 'Nessuno.'
      : problems.map((p) => `- ${p}`).join('\n'),
    '',
    '## Differenze note rispetto a iOS',
    '',
    '- I font di sistema sono diversi: San Francisco non e disponibile su Linux.',
    '- Tastiera, aree sicure, aptica, animazioni native e ombre si comportano in modo diverso.',
    '- I caratteri ingranditi sono simulati agendo sulla dimensione radice: e un approssimazione di `allowFontScaling`.',
    '',
  ].join('\n');

  await writeFile(path.join(OUT_DIR, 'README.md'), report, 'utf8');

  console.log('');
  console.log(`== ${String(taken.length)} schermate in ${path.relative(ROOT, OUT_DIR)} ==`);
  if (problems.length > 0) {
    console.log(`== ${String(problems.length)} problemi rilevati (vedi README.md) ==`);
    for (const p of problems.slice(0, 20)) console.log(`   ${p}`);
  }
  const files = await readdir(OUT_DIR);
  console.log(`   file presenti: ${String(files.length)}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
