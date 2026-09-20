/**
 * Punto d'ingresso per gli ambienti Node (test, script, strumenti).
 *
 * Separato da `index.ts` perche' `node:sqlite` non e' risolvibile da Metro:
 * tenerlo nel punto d'ingresso principale rendeva impossibile costruire il
 * bundle dell'app. Chi gira su Node importa da qui; l'app importa da
 * `@trackstrong/db` e non vede mai un modulo Node.
 */

export * from './drivers/nodeSqlite.js';
