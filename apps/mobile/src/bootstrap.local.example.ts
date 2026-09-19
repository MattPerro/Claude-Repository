/**
 * MODELLO da copiare in `bootstrap.local.ts` (stesso percorso).
 *
 * `bootstrap.local.ts` e' ESCLUSO da Git (vedi `.gitignore`): e' il posto dove
 * puoi tenere i tuoi dati reali senza che finiscano nel repository.
 *
 * E' una comodita', non un requisito: se il file non esiste, l'onboarding
 * parte con i campi vuoti e funziona ugualmente. In entrambi i casi i valori
 * restano modificabili in qualsiasi momento dalle impostazioni.
 *
 * Per usarlo:
 *
 *     cd apps/mobile/src
 *     cp bootstrap.local.example.ts bootstrap.local.ts
 *     # poi apri bootstrap.local.ts e metti i tuoi dati
 *
 * Verifica che sia ignorato prima di fare commit:
 *
 *     git check-ignore -v apps/mobile/src/bootstrap.local.ts
 */

import type { OnboardingDefaults } from '@trackstrong/core';

export const LOCAL_ONBOARDING: Partial<OnboardingDefaults> = {
  // Il nome mostrato nella home.
  displayName: 'Nome',

  // Altezza in cm. `null` per lasciare il campo vuoto.
  heightCm: null,

  // Peso DICHIARATO in kg. Non e' una pesata: non entra nei grafici ne' nella
  // media mobile a 7 giorni. Per quello si usa la schermata Progressi.
  declaredWeightKg: null,

  // Obiettivo corporeo. `targetKg` e' un riferimento, non una promessa:
  // l'app non indica una data per raggiungerlo.
  bodyGoal: null,

  // Obiettivo sportivo, testo libero.
  sportGoal: null,

  // Giorni PROPOSTI per le sedute: 1 = lunedi' ... 7 = domenica.
  // Sono una proposta, non un vincolo: puoi allenarti quando vuoi.
  preferredWeekdays: [1, 4],

  // Minuti disponibili per seduta, doccia esclusa.
  availableMinutesPerSession: 70,

  // Sedute a settimana.
  sessionsPerWeek: 2,

  // Contesto libero, mostrato al coach per inquadrare la fase.
  context: null,
};
