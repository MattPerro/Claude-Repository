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

module.exports = config;
