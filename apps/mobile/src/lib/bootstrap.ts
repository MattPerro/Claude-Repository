/**
 * Bootstrap locale opzionale dell'onboarding.
 *
 * `apps/mobile/src/bootstrap.local.ts` **normalmente non esiste**: e' escluso
 * da Git (vedi `.gitignore`) e il modello da copiare e'
 * `bootstrap.local.example.ts`. Se manca, l'onboarding parte dai valori neutri
 * di `NEUTRAL_ONBOARDING` e non si rompe niente (specifica §2).
 *
 * ## Perche' `require.context` e non un `try/catch` attorno a un import
 *
 * Metro risolve gli import **al momento della compilazione del bundle**: un
 * `import '../bootstrap.local'` o un `require('../bootstrap.local')` su un file
 * assente non lancia a runtime, fa **fallire la build** con
 * "Unable to resolve module", e nessun `try/catch` puo' intercettarlo. Anche
 * `import()` con un percorso costruito a runtime non va bene: con Metro non
 * troverebbe il modulo **nemmeno quando il file esiste**, cioe' sarebbe codice
 * che finge di funzionare.
 *
 * `require.context` e' l'unico meccanismo che si comporta correttamente nei due
 * casi: e' un elenco calcolato a build time, vuoto se nessun file corrisponde e
 * popolato se il file c'e'. E' abilitato per difetto nella configurazione Metro
 * di Expo (`unstable_allowRequireContext: true` in `@expo/metro-config`), la
 * stessa su cui si appoggia expo-router per scoprire le rotte.
 *
 * NON VERIFICATO SU DISPOSITIVO: qui non c'e' Metro. Il ramo "file assente" e'
 * comunque quello predefinito e restituisce i valori neutri.
 */

import {
  NEUTRAL_ONBOARDING,
  resolveOnboardingDefaults,
  type BodyGoal,
  type IsoWeekday,
  type OnboardingDefaults,
} from '@trackstrong/core';

interface RequireContextModule {
  (id: string): unknown;
  keys(): readonly string[];
}

type ContextFactory = (
  directory: string,
  useSubdirectories: boolean,
  matcher: RegExp,
) => RequireContextModule;

const LOCAL_FILE = /bootstrap\.local\.(ts|tsx|js|jsx)$/;

function readLocalModule(): unknown {
  // `require` e' tipizzato da @types/node, che non conosce `context`: il cast
  // e' verso la firma reale di Metro, ed e' verificato a runtime sotto.
  const factory = (require as unknown as { readonly context?: ContextFactory }).context;
  if (typeof factory !== 'function') return null;
  const context = factory('../', false, LOCAL_FILE);
  const keys = context.keys();
  const first = keys[0];
  if (first === undefined) return null;
  return context(first);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function pickWeekdays(value: unknown): readonly IsoWeekday[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const days: IsoWeekday[] = [];
  for (const entry of value as readonly unknown[]) {
    if (entry === 1 || entry === 2 || entry === 3 || entry === 4) days.push(entry);
    else if (entry === 5 || entry === 6 || entry === 7) days.push(entry);
  }
  return days.length === 0 ? undefined : days;
}

function pickBodyGoal(value: unknown): BodyGoal | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (!isFiniteNumber(raw['targetKg'])) return undefined;
  const stretch = raw['stretchTargetKg'];
  const note = raw['note'];
  return {
    targetKg: raw['targetKg'],
    stretchTargetKg: isFiniteNumber(stretch) ? stretch : null,
    note: typeof note === 'string' ? note : null,
  };
}

/**
 * Trasforma il contenuto del file locale in un `Partial<OnboardingDefaults>`
 * con i soli campi riconosciuti.
 *
 * Il file e' scritto a mano e non e' un'interfaccia di sistema: un campo con il
 * tipo sbagliato viene ignorato invece di propagarsi nel database.
 */
function sanitize(raw: unknown): Partial<OnboardingDefaults> {
  if (typeof raw !== 'object' || raw === null) return {};
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (typeof source['displayName'] === 'string') out['displayName'] = source['displayName'];
  if (isFiniteNumber(source['heightCm']) || source['heightCm'] === null) {
    out['heightCm'] = source['heightCm'];
  }
  if (isFiniteNumber(source['declaredWeightKg']) || source['declaredWeightKg'] === null) {
    out['declaredWeightKg'] = source['declaredWeightKg'];
  }
  const goal = pickBodyGoal(source['bodyGoal']);
  if (goal !== undefined) out['bodyGoal'] = goal;
  if (typeof source['sportGoal'] === 'string' || source['sportGoal'] === null) {
    out['sportGoal'] = source['sportGoal'];
  }
  const weekdays = pickWeekdays(source['preferredWeekdays']);
  if (weekdays !== undefined) out['preferredWeekdays'] = weekdays;
  if (isFiniteNumber(source['availableMinutesPerSession'])) {
    out['availableMinutesPerSession'] = source['availableMinutesPerSession'];
  }
  if (isFiniteNumber(source['sessionsPerWeek'])) {
    out['sessionsPerWeek'] = source['sessionsPerWeek'];
  }
  if (typeof source['context'] === 'string' || source['context'] === null) {
    out['context'] = source['context'];
  }
  return out as Partial<OnboardingDefaults>;
}

export interface LocalBootstrapResult {
  readonly defaults: OnboardingDefaults;
  /** `true` se un file di bootstrap locale e' stato trovato e letto. */
  readonly foundLocalFile: boolean;
}

/** Valori con cui precompilare l'onboarding. Mai lancia. */
export function loadOnboardingDefaults(): LocalBootstrapResult {
  try {
    const mod = readLocalModule();
    if (mod === null || typeof mod !== 'object') {
      return { defaults: NEUTRAL_ONBOARDING, foundLocalFile: false };
    }
    const exported = (mod as Record<string, unknown>)['LOCAL_ONBOARDING'];
    if (exported === undefined) {
      return { defaults: NEUTRAL_ONBOARDING, foundLocalFile: false };
    }
    return { defaults: resolveOnboardingDefaults(sanitize(exported)), foundLocalFile: true };
  } catch {
    // Qualunque problema qui e' irrilevante: e' una comodita', non un requisito.
    return { defaults: NEUTRAL_ONBOARDING, foundLocalFile: false };
  }
}
