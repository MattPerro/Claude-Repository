/**
 * Soglie e finestre di osservazione del motore adattivo.
 *
 * La specifica (§5) chiede di definire soglie e finestre e di distinguere le
 * REGOLE PROGETTUALI dai criteri sostenuti da fonti scientifiche. Qui ogni
 * valore porta accanto la sua natura:
 *
 * NOTA su un campo rimosso: esisteva `allowIncreaseWithMissingData: false`,
 * presentato come "interruttore che rende il vincolo ispezionabile". Non era
 * letto da nessuna riga del motore: era una dichiarazione di intenti travestita
 * da configurazione, e un test che ne verificava il valore dava l'impressione
 * di verificare un comportamento. Il vincolo vero e' nei test di
 * `engine.test.ts` che provano i singoli dati mancanti.
 *
 *   [PROGETTO]  scelta di progetto prudenziale, discutibile e configurabile.
 *               Non e' sostenuta da una fonte primaria: e' il modo in cui
 *               questa app decide, non un'affermazione sulla fisiologia.
 *   [SPEC]      vincolo imposto direttamente dalla specifica dell'utente.
 *
 * Nessun valore qui presente e' presentato come verita' scientifica. Dove
 * servisse un criterio sostenuto da letteratura primaria, il campo lo dichiara
 * e rimanda a `COACH_RULES.md`, dove le fonti sono citate con data di verifica.
 */

export interface EngineConfig {
  /**
   * [SPEC] Esposizioni consecutive confrontabili necessarie per confermare un
   * risultato prima di proporre un incremento di carico.
   * La specifica lo fissa a due: "il risultato e' confermato in due
   * esposizioni consecutive comparabili".
   */
  readonly confirmExposures: number;

  /**
   * [PROGETTO] Quanto il margine dichiarato puo' stare SOTTO il minimo della
   * fase e ancora contare come "coerente con la fase".
   *
   * Vale 0 per scelta: se la fase prescrive un margine di 2 ripetizioni e la
   * serie e' stata chiusa con margine 1, il margine prescritto non c'era e
   * aggiungere carico lo ridurrebbe ancora. Alzare questo valore rende il
   * motore piu' permissivo, quindi e' una manopola da muovere con
   * consapevolezza.
   */
  readonly rirToleranceBelowPhaseMin: number;

  /**
   * [PROGETTO] Esposizioni consecutive senza progresso confrontabile prima di
   * parlare di stallo.
   *
   * Vale 3: la specifica vieta di trattare un singolo allenamento negativo
   * come un plateau, e due esposizioni sono la soglia con cui si CONFERMA un
   * progresso, non con cui si nega.
   */
  readonly stalledExposures: number;

  /**
   * [PROGETTO] Sedute consecutive con fastidio sullo stesso esercizio prima di
   * proporre una riduzione o una sostituzione.
   */
  readonly repeatedDiscomfortSessions: number;

  /**
   * [PROGETTO] Giorni dall'ultima seduta oltre i quali si propone di ripetere
   * la settimana invece di avanzare.
   *
   * 21 giorni corrispondono a tre settimane senza sedute: coerente con la
   * politica di interruzione dei blocchi (`threeYear.ts`).
   */
  readonly interruptionDaysToRepeatWeek: number;

  /**
   * [PROGETTO] Giorni dall'ultima seduta oltre i quali si propone di rientrare
   * dal blocco di rientro.
   */
  readonly interruptionDaysToReentry: number;

  /**
   * [PROGETTO] Quante esposizioni passate il motore guarda al massimo.
   * Limita il costo delle query e rende le proposte spiegabili: oltre questo
   * orizzonte il contesto di allenamento e' cambiato troppo.
   */
  readonly maxExposuresConsidered: number;

  /**
   * [PROGETTO] Giorni di validita' di una proposta non decisa, dopo i quali
   * viene rivalutata.
   */
  readonly proposalValidityDays: number;

}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  confirmExposures: 2,
  rirToleranceBelowPhaseMin: 0,
  stalledExposures: 3,
  repeatedDiscomfortSessions: 2,
  interruptionDaysToRepeatWeek: 21,
  interruptionDaysToReentry: 42,
  maxExposuresConsidered: 12,
  proposalValidityDays: 14,
};
