// Metro in un monorepo npm workspaces.
//
// Servono due cose che Metro non indovina da solo:
//  1. `watchFolders` sulla radice, altrimenti le modifiche a packages/core
//     non provocano il ricaricamento;
//  2. `nodeModulesPaths` con entrambe le cartelle, perche' con i workspaces le
//     dipendenze finiscono in parte nella radice e in parte nell'app.
//
// `disableHierarchicalLookup` resta disattivato: i pacchetti locali sono
// symlink dentro node_modules della radice e la risoluzione gerarchica li trova.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// I pacchetti locali importano con l'estensione `.js` (`export * from
// './units.js'`), che e' la forma richiesta dalla risoluzione ESM. Metro non
// la mappa sul file `.ts` corrispondente, e il bundle fallisce con
// "Unable to resolve module ./units.js".
//
// Questo e' stato scoperto tentando di costruire il bundle: nessun test lo
// poteva cogliere, perche' vitest e `tsc` risolvono quelle estensioni da soli.
//
// La soluzione e' un resolver che, quando un percorso relativo `.js` non
// esiste sul disco, prova le estensioni TypeScript. Riguarda SOLO i percorsi
// relativi con estensione `.js`: tutto il resto passa al resolver
// predefinito, quindi un pacchetto di terze parti che spedisce `.js` reali
// continua a funzionare.
// `expo-sqlite` per il web importa un modulo WebAssembly. Metro non tratta
// `.wasm` come asset per impostazione predefinita. Serve solo al banco degli
// screenshot (vedi `tools/screenshots.mjs`): su iOS `expo-sqlite` usa il
// modulo nativo e questa riga non ha alcun effetto.
if (!config.resolver.assetExts.includes('wasm')) {
  config.resolver.assetExts.push('wasm');
}

const TS_CANDIDATES = ['.ts', '.tsx'];
const defaultResolveRequest = config.resolver.resolveRequest;

// Sostituti attivi SOLO per la piattaforma `web`, cioe' solo per il banco
// degli screenshot di revisione (`tools/screenshots.mjs`). Su iOS non hanno
// alcun effetto: l'app usa i moduli veri.
//
// Serve perche' `expo-secure-store` non esiste nel browser, e senza archivio
// sicuro l'app - correttamente - si rifiuta di partire invece di generare un
// identificativo di installazione nuovo che duplicherebbe l'archivio.
const WEB_REVIEW_STUBS = {
  'expo-secure-store': path.resolve(workspaceRoot, 'tools/web-stubs/expo-secure-store.js'),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = defaultResolveRequest ?? context.resolveRequest;

  if (platform === 'web') {
    const stub = WEB_REVIEW_STUBS[moduleName];
    if (stub !== undefined) {
      return { type: 'sourceFile', filePath: stub };
    }
  }

  if (moduleName.startsWith('.') && moduleName.endsWith('.js')) {
    const withoutExt = moduleName.slice(0, -'.js'.length);
    for (const ext of TS_CANDIDATES) {
      try {
        return resolve(context, withoutExt + ext, platform);
      } catch {
        // Estensione non trovata: si prova la successiva.
      }
    }
    // Nessun file TypeScript corrispondente: potrebbe essere un `.js` vero.
  }

  return resolve(context, moduleName, platform);
};

module.exports = config;
