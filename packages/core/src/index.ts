/**
 * `@trackstrong/core` - dominio puro di TrackStrong.
 *
 * Questo pacchetto non importa nulla da React Native, da Expo o dalla rete:
 * e' TypeScript puro, eseguibile su Node, quindi interamente testabile in
 * automatico. E' una scelta deliberata: le regole di allenamento, il motore
 * adattivo e le convenzioni sui carichi sono la parte in cui un errore
 * silenzioso fa il danno peggiore, e devono poter essere verificate senza un
 * simulatore.
 */

export * from './units.js';
export * from './time.js';
export * from './ids.js';

export * from './domain/prescription.js';
export * from './domain/exercise.js';
export * from './domain/program.js';
export * from './domain/session.js';
export * from './domain/profile.js';
export * from './domain/body.js';
export * from './domain/proposal.js';

export * from './program/twelveWeeks.js';
export * from './program/exercises.js';
export * from './program/threeYear.js';
export * from './program/duration.js';

export * from './engine/config.js';
export * from './engine/exposure.js';
export * from './engine/progression.js';
export * from './engine/shortenSession.js';
export * from './engine/engine.js';
