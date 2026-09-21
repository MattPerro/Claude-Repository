#!/usr/bin/env node
/**
 * Costruisce la PWA: sito statico installabile sulla schermata Home.
 *
 *     node tools/pwa-build.mjs            # icone, manifest, export, service worker
 *     node tools/pwa-build.mjs --serve    # e poi la serve su http://localhost:8080
 *
 * Output in `dist/pwa/` (ignorato da Git: e' rigenerabile).
 *
 * ---------------------------------------------------------------------------
 * CHE COSA RENDE "APP" UN SITO, E PERCHE' OGNI PASSO SERVE
 *
 *  1. **icone e manifest** (`tools/icons.mjs` e `writeManifest` qui sotto):
 *     senza di essi "Aggiungi alla schermata Home" produce una scorciatoia
 *     con la barra degli indirizzi di Safari, non un'app.
 *  2. **esportazione del bundle** (`expo export --platform web`): le stesse
 *     schermate del progetto native, rese da `react-native-web`. Non e' una
 *     seconda app: e' lo stesso codice.
 *  3. **`sql-wasm.wasm`** copiato nella radice: e' il motore SQLite della PWA.
 *     Se manca, l'app non apre il database e non parte.
 *  4. **service worker generato DOPO l'export**: i nomi dei file prodotti da
 *     Metro contengono un'impronta che cambia a ogni build, quindi un elenco
 *     di precache scritto a mano sarebbe sbagliato dal primo giorno. Viene
 *     letto dall'output reale.
 *
 * Il service worker e' il passo che rende l'app usabile **in palestra senza
 * campo**: senza di lui il secondo avvio offline mostra la pagina di errore
 * del browser, e tutto il resto del progetto diventa inutile nel solo momento
 * in cui serve.
 * ---------------------------------------------------------------------------
 *
 * ---------------------------------------------------------------------------
 * UNA CONSEGUENZA UTILE DEL DRIVER `sql.js`
 *
 * `expo-sqlite` sul web usa wa-sqlite sopra OPFS e richiede
 * `SharedArrayBuffer`, quindi un contesto "cross-origin isolated", quindi le
 * intestazioni `Cross-Origin-Opener-Policy` e `Cross-Origin-Embedder-Policy`
 * sul server. Molti servizi di hosting statico non permettono di impostarle.
 *
 * La PWA usa `sql.js`, che non ha bisogno di `SharedArrayBuffer`: il sito
 * funziona su **qualunque** hosting statico capace di servire file con il tipo
 * MIME corretto. E' la ragione tecnica per cui la scelta dell'hosting resta
 * libera (vedi `INSTALL_PWA.md`).
 * ---------------------------------------------------------------------------
 *
 * LIMITE DICHIARATO: questo script costruisce e serve. **Non** dimostra che
 * l'app funzioni su un iPhone: qui non ci sono ne' iOS ne' Safari. Quello che
 * verifica e' che il bundle si costruisca, che i file attesi ci siano e che il
 * service worker elenchi esattamente quelli prodotti.
 */

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP_DIR = path.join(ROOT, 'apps', 'mobile');
const PUBLIC_DIR = path.join(APP_DIR, 'public');
const OUT_DIR = path.join(ROOT, 'dist', 'pwa');
const PALETTE = path.join(ROOT, 'packages', 'core', 'src', 'theme', 'palette.ts');
/**
 * I due moduli WebAssembly di `sql.js`, e perche' sono due.
 *
 * `sql.js` dichiara nel suo `exports` una condizione `browser` che punta a
 * `sql-wasm-browser.js`, e quel file carica `sql-wasm-browser.wasm`; l'entrata
 * `default` carica `sql-wasm.wasm`. Quale delle due finisce nel bundle dipende
 * da come Metro risolve le condizioni, che non e' una cosa da indovinare:
 * vengono copiate entrambe, e dopo l'esportazione si tiene **solo quella
 * effettivamente citata dal bundle** (vedi `pruneUnusedWasm`).
 *
 * Il primo tentativo copiava solo `sql-wasm.wasm`, e il bundle chiedeva
 * `sql-wasm-browser.wasm`: il server rispondeva con `index.html`, il browser
 * riportava "expected magic word 00 61 73 6d, found 3c 21 44 4f" e l'app si
 * fermava alla schermata di avvio non riuscito. Trovato provando, non
 * leggendo.
 */
const WASM_SOURCES = ['sql-wasm.wasm', 'sql-wasm-browser.wasm'].map((file) => ({
  file,
  from: path.join(ROOT, 'node_modules', 'sql.js', 'dist', file),
}));
const PORT = 8080;

/**
 * File che il service worker NON deve mettere in cache.
 *
 * Le mappe dei sorgenti pesano quanto il bundle e non servono all'uso: un
 * precache che le include consuma la quota del browser - la stessa quota che
 * serve al database degli allenamenti.
 */
const PRECACHE_EXCLUDE = [/\.map$/, /^sw\.js$/, /^precache-manifest/];

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

/** Legge un colore dal tema scuro di `palette.ts`, senza duplicarlo qui. */
async function darkToken(role) {
  const source = await readFile(PALETTE, 'utf8');
  const match = new RegExp(`${role}: '(#[0-9A-Fa-f]{6})'`).exec(source);
  if (match === null) {
    throw new Error(`Il ruolo di colore "${role}" non esiste in palette.ts.`);
  }
  return match[1];
}

/** Legge un colore dal tema chiaro di `palette.ts`. */
async function lightToken(role) {
  const source = await readFile(PALETTE, 'utf8');
  const light = source.slice(source.indexOf('LIGHT_COLORS'));
  const match = new RegExp(`${role}: '(#[0-9A-Fa-f]{6})'`).exec(light);
  if (match === null) {
    throw new Error(`Il ruolo di colore "${role}" non esiste nel tema chiaro di palette.ts.`);
  }
  return match[1];
}

/**
 * Scrive il manifest.
 *
 * Generato e non committato perche' contiene due colori, e in questo progetto
 * gli esadecimali stanno solo in `palette.ts` (CLAUDE.md §6). Un manifest
 * scritto a mano sarebbe una copia destinata a divergere dal tema.
 */
async function writeManifest() {
  const background = await darkToken('background');
  const manifest = {
    name: 'TrackStrong',
    short_name: 'TrackStrong',
    description:
      'Allenamento, calendario e progressi. I dati restano su questo dispositivo e, ' +
      'se lo colleghi, sul tuo Google Drive.',
    lang: 'it',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: background,
    theme_color: background,
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(
    path.join(PUBLIC_DIR, 'manifest.webmanifest'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
}

/**
 * Scrive `public/index.html`, il guscio della pagina.
 *
 * ---------------------------------------------------------------------------
 * PERCHE' QUI E NON IN `app/+html.tsx`
 *
 * `+html.tsx` e' il modo documentato di personalizzare l'HTML in Expo Router,
 * e con questa configurazione **non viene usato**: vale solo per il rendering
 * statico (`web.output: 'static'` o `'server'`). Con l'output SPA - quello che
 * usa questo progetto - il guscio viene da
 * `@expo/cli/build/src/start/server/webTemplate.js`, che in
 * `getTemplateIndexHtmlAsync` cerca `public/index.html` e solo in sua assenza
 * ricade sul modello predefinito.
 *
 * L'ho scoperto costruendo: il primo tentativo con `+html.tsx` ha prodotto un
 * `index.html` con `lang="en"`, senza manifest e senza service worker, cioe'
 * un sito che non si installa e non funziona offline. Un `tsc` pulito non
 * poteva dirlo.
 *
 * Due segnaposto sono sostituiti da Expo: `%LANG_ISO_CODE%` e `%WEB_TITLE%`.
 * Lo script del bundle viene aggiunto prima di `</body>`.
 * ---------------------------------------------------------------------------
 */
async function writeHtmlShell() {
  const darkBackground = await darkToken('background');
  const lightBackground = (await readFile(PALETTE, 'utf8')).includes('LIGHT_COLORS')
    ? await lightToken('background')
    : darkBackground;

  const html = `<!DOCTYPE html>
<html lang="%LANG_ISO_CODE%">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />

    <!--
      GENERATO da tools/pwa-build.mjs. Non modificare a mano: i colori vengono
      da packages/core/src/theme/palette.ts, l'unico posto del progetto in cui
      un esadecimale e' ammesso (CLAUDE.md §6).

      \`viewport-fit=cover\` estende la pagina sotto la tacca e sotto la barra di
      casa; SafeAreaProvider tiene i comandi dentro l'area sicura.
      \`user-scalable=no\` evita lo zoom accidentale con due dita durante una
      serie, e non riduce l'accessibilita': la dimensione del testo segue le
      impostazioni di sistema, che l'app legge.
    -->
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
    />

    <title>%WEB_TITLE%</title>
    <meta
      name="description"
      content="Allenamento, calendario e progressi. I dati restano su questo dispositivo."
    />

    <link rel="manifest" href="/manifest.webmanifest" />
    <link rel="icon" href="/favicon.png" type="image/png" />
    <!-- iOS non legge le icone del manifest per la schermata Home. -->
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

    <!-- Senza questi, "Aggiungi alla schermata Home" apre una scorciatoia in
         Safari con la barra degli indirizzi, non un'app a schermo pieno. -->
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-title" content="TrackStrong" />
    <!-- \`black-translucent\`: l'app disegna dietro la barra di stato. -->
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />

    <meta name="theme-color" media="(prefers-color-scheme: dark)" content="${darkBackground}" />
    <meta name="theme-color" media="(prefers-color-scheme: light)" content="${lightBackground}" />
    <meta name="color-scheme" content="dark light" />

    <!-- Nessuna telemetria e nessun servizio esterno (§8): la pagina non
         carica niente da un'altra origine. Le sole richieste verso l'esterno
         sono quelle che l'utente autorizza collegando Google Drive. -->
    <meta name="referrer" content="no-referrer" />

    <style id="expo-reset">
      /* Il fondo della pagina sotto l'app: senza questo, scorrendo oltre il
         bordo iOS mostra il bianco del browser dentro un'app scura. */
      html,
      body {
        background-color: ${darkBackground};
      }
      @media (prefers-color-scheme: light) {
        html,
        body {
          background-color: ${lightBackground};
        }
      }

      /* La pagina non scorre: scorrono le viste dell'app. Senza questo, su iOS
         il trascinamento verticale sposta l'intera pagina e i comandi in basso
         spariscono mentre si sta registrando una serie. */
      html,
      body {
        height: 100%;
        overflow: hidden;
        overscroll-behavior: none;
      }
      #root {
        display: flex;
        height: 100%;
        flex: 1;
      }

      /* Il doppio tocco su iOS ingrandisce la pagina: dentro un'app e' un
         gesto accidentale, non una funzione. */
      * {
        touch-action: manipulation;
      }

      /* La selezione del testo su un pulsante e' un effetto collaterale del
         web. Resta attiva sui campi di testo. */
      body {
        -webkit-user-select: none;
        user-select: none;
      }
      input,
      textarea {
        -webkit-user-select: text;
        user-select: text;
      }
    </style>

    <script>
      // Inline e non nel bundle, deliberatamente: e' il service worker a
      // permettere di caricare il bundle la volta dopo senza rete, quindi la
      // sua registrazione non puo' dipendere dal bundle. Un fallimento non
      // blocca l'avvio - con la rete l'app funziona comunque - ma viene
      // scritto in console invece di essere ignorato.
      if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
          navigator.serviceWorker.register('/sw.js').catch(function (error) {
            console.warn('TrackStrong: cache offline non registrata.', error);
          });
        });
      }
    </script>
  </head>

  <body>
    <noscript>
      TrackStrong ha bisogno di JavaScript: tutta l'app - database, timer e
      calcoli - gira su questo dispositivo, e senza JavaScript non c'e' nulla
      da mostrare.
    </noscript>
    <div id="root"></div>
  </body>
</html>
`;
  await mkdir(PUBLIC_DIR, { recursive: true });
  await writeFile(path.join(PUBLIC_DIR, 'index.html'), html);
}

/** Elenca ricorsivamente i file di una directory, con percorsi relativi. */
async function listFiles(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path.join(dir, entry.name), relative)));
    } else {
      files.push(relative);
    }
  }
  return files.sort();
}

/**
 * Genera il service worker sull'output reale dell'esportazione.
 *
 * Le scelte che contano sono commentate nel file generato, perche' e' quel
 * file che un revisore aprira'.
 */
/**
 * Tiene solo il modulo WebAssembly che il bundle cita davvero.
 *
 * Serve a due cose: non sprecare 650 KB della quota del browser - la stessa
 * quota che serve al database degli allenamenti - e accorgersi subito se il
 * bundle chiede un file che non e' stato copiato, invece di scoprirlo
 * all'avvio con un errore di WebAssembly.
 */
async function pruneUnusedWasm() {
  const bundles = (await listFiles(OUT_DIR)).filter((file) => file.endsWith('.js'));
  let referenced = null;
  for (const bundle of bundles) {
    const source = await readFile(path.join(OUT_DIR, bundle), 'utf8');
    for (const { file } of WASM_SOURCES) {
      if (source.includes(file)) referenced = file;
    }
  }
  if (referenced === null) {
    throw new Error(
      'Nessun bundle esportato cita un modulo WebAssembly di sql.js. ' +
        "Il driver del database non e' incluso: l'app non partirebbe. " +
        'Costruzione interrotta.',
    );
  }
  for (const { file } of WASM_SOURCES) {
    if (file !== referenced) {
      await rm(path.join(OUT_DIR, file), { force: true });
    }
  }
  return referenced;
}

async function writeServiceWorker(wasmFile) {
  const all = await listFiles(OUT_DIR);
  const precache = all.filter((file) => !PRECACHE_EXCLUDE.some((pattern) => pattern.test(file)));

  if (!precache.includes('index.html')) {
    throw new Error(
      "L'esportazione non contiene `index.html`: senza il guscio dell'app il " +
        "service worker non puo' servire nessuna rotta offline. " +
        'Costruzione interrotta.',
    );
  }
  for (const required of ['manifest.webmanifest', 'apple-touch-icon.png', 'icon-512.png']) {
    if (!precache.includes(required)) {
      throw new Error(
        `L'esportazione non contiene \`${required}\`: senza di esso ` +
          '"Aggiungi alla schermata Home" non produce un\'app installata. ' +
          'Costruzione interrotta.',
      );
    }
  }
  if (!precache.includes(wasmFile)) {
    throw new Error(
      `L'esportazione non contiene \`${wasmFile}\`: il motore SQLite non ` +
        "sarebbe disponibile offline e l'app non partirebbe senza rete. " +
        'Costruzione interrotta.',
    );
  }

  // Versione derivata dal contenuto: cambia se e solo se cambia qualcosa.
  // Un numero incrementato a mano si dimentica, e una cache non invalidata
  // serve il bundle vecchio insieme alle risorse nuove.
  const hash = createHash('sha256');
  for (const file of precache) {
    const info = await stat(path.join(OUT_DIR, file));
    hash.update(`${file}:${String(info.size)}\n`);
  }
  const version = hash.digest('hex').slice(0, 16);

  const source = `/**
 * Service worker di TrackStrong. GENERATO da \`tools/pwa-build.mjs\`.
 *
 * Non modificare a mano: l'elenco qui sotto contiene le impronte dei file
 * prodotti da Metro, che cambiano a ogni costruzione.
 *
 * Fa una cosa sola: rendere l'app avviabile senza rete. Non tocca i dati
 * degli allenamenti, che vivono in IndexedDB e non passano da qui.
 */

const VERSION = '${version}';
const CACHE = 'trackstrong-guscio-' + VERSION;

/** Guscio dell'app: tutto cio' che serve per partire senza rete. */
const PRECACHE = ${JSON.stringify(precache.map((file) => `/${file}`), null, 2)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // \`reload\` evita di riempire la cache dell'app con risposte prese dalla
      // cache HTTP del browser, che potrebbero essere di una versione
      // precedente.
      cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
  // Deliberatamente SENZA \`skipWaiting()\`: attivare una versione nuova
  // mentre l'app e' aperta servirebbe il bundle nuovo a una pagina che ha
  // caricato quello vecchio, e i frammenti non corrisponderebbero. La nuova
  // versione entra alla prossima apertura da zero.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith('trackstrong-guscio-') && name !== CACHE)
          .map((name) => caches.delete(name)),
      ),
    ),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Solo letture: un POST non si serve da una cache.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Altre origini - cioe' Google - NON passano da qui. Mettere in cache una
  // risposta dell'API Drive significherebbe conservare dati personali in un
  // secondo posto, di cui il resto dell'app non sa niente e che nessun
  // "cancella i dati" toccherebbe.
  if (url.origin !== self.location.origin) return;

  // Navigazione: si serve il guscio dell'app dalla cache. L'app e' locale, i
  // dati stanno nel dispositivo: chiedere prima alla rete significherebbe
  // aspettare un timeout in palestra per ottenere lo stesso file.
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html').then((cached) => cached || fetch(request)),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Si conserva solo cio' che e' andato a buon fine e viene dalla stessa
        // origine: mettere in cache un 404 lo renderebbe permanente.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
`;

  await writeFile(path.join(OUT_DIR, 'sw.js'), source);
  return { version, count: precache.length };
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.wasm': 'application/wasm',
};

/**
 * Server di prova, non un server di produzione.
 *
 * Serve a guardare l'app in un browser su questa macchina. Nessuna
 * intestazione COOP/COEP: `sql.js` non ne ha bisogno, e servirle qui
 * nasconderebbe il fatto che l'hosting reale non deve fornirle.
 */
function serve(dir, port) {
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
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      // Il service worker deve poter essere sostituito subito durante lo
      // sviluppo: senza questo il browser puo' servirne una copia vecchia.
      'cache-control': 'no-cache',
    });
    createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(port, '0.0.0.0', () => {
      resolve(server);
    });
  });
}

async function main() {
  const shouldServe = process.argv.includes('--serve');

  console.log('1/7  icone');
  await run(process.execPath, [path.join(HERE, 'icons.mjs')], { cwd: ROOT });

  console.log('2/7  manifest');
  await writeManifest();

  console.log('3/7  guscio HTML');
  await writeHtmlShell();

  console.log('4/7  motore SQLite (WebAssembly)');
  for (const { file, from } of WASM_SOURCES) {
    if (!existsSync(from)) {
      throw new Error(
        `Manca ${from}. Esegui \`npm install\`: senza il modulo WebAssembly ` +
          "di sql.js la PWA non puo' aprire il database.",
      );
    }
    await copyFile(from, path.join(PUBLIC_DIR, file));
  }

  console.log('5/7  esportazione del bundle');
  await rm(OUT_DIR, { recursive: true, force: true });
  await run(
    'npx',
    ['expo', 'export', '--platform', 'web', '--output-dir', path.relative(APP_DIR, OUT_DIR)],
    { cwd: APP_DIR },
  );

  console.log('6/7  motore non usato rimosso');
  const wasmFile = await pruneUnusedWasm();
  console.log(`     il bundle usa ${wasmFile}`);

  console.log('7/7  service worker');
  const { version, count } = await writeServiceWorker(wasmFile);
  console.log(`     versione ${version}, ${String(count)} file in precache`);

  console.log(`\nPWA costruita in ${path.relative(ROOT, OUT_DIR)}`);

  if (shouldServe) {
    await serve(OUT_DIR, PORT);
    console.log(`In ascolto su http://localhost:${String(PORT)} (Ctrl-C per fermare)`);
    console.log(
      'Nota: "Aggiungi alla schermata Home" su iPhone richiede HTTPS, tranne ' +
        'che su localhost. Vedi INSTALL_PWA.md.',
    );
  }
}

await main();
