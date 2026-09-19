/**
 * Libreria degli esercizi del programma iniziale (specifica §3) con la guida
 * offline completa richiesta dalla specifica §12.
 *
 * Regole rispettate in questo file:
 * - Nessun collegamento, nessun filmato, nessuna illustrazione: il testo deve
 *   bastare da solo, senza connessione.
 * - Nessuna affermazione clinica, nessuna riabilitazione, nessuna trattenuta
 *   prolungata del respiro, nessun esercizio del collo con sovraccarico,
 *   nessun test massimale.
 * - Nessun dato inventato su Mattia: eta', patologie, percentuale di grasso,
 *   frequenza cardiaca e carichi iniziali NON compaiono.
 * - L'utilita' per la moto e' scritta come finalita' della preparazione
 *   generale, mai come garanzia di miglioramento sul tempo sul giro.
 *
 * Onesta' obbligatoria: questo e' contenuto progettuale rivisto da agenti AI.
 * Non e' clinicamente validato e non deve essere presentato come tale.
 */

import type { Exercise, ExerciseGuide, ExerciseVariant } from '../domain/exercise.js';
import { ExerciseLibrary } from '../domain/exercise.js';
import type { LoadStep } from '../units.js';

// ---------------------------------------------------------------------------
// Identificativi stabili
// ---------------------------------------------------------------------------

/**
 * ID stabili degli esercizi. Il resto del codice usa queste costanti e non
 * stringhe magiche: un ID scritto a mano e' un errore che nessun tipo prende.
 */
export const EXERCISE_IDS = {
  legPress: 'legPress',
  chestPressMachine: 'chestPressMachine',
  seatedCableRow: 'seatedCableRow',
  legCurl: 'legCurl',
  pallofPress: 'pallofPress',
  farmerCarry: 'farmerCarry',
  dumbbellRomanianDeadlift: 'dumbbellRomanianDeadlift',
  latPulldownFront: 'latPulldownFront',
  stepUp: 'stepUp',
  inclineDumbbellPress: 'inclineDumbbellPress',
  adductorMachine: 'adductorMachine',
  sideplankKneesDown: 'sideplankKneesDown',
  hipThrustMachine: 'hipThrustMachine',
  stationaryBike: 'stationaryBike',
} as const;

/** Unione degli ID presenti in libreria. */
export type ExerciseId = (typeof EXERCISE_IDS)[keyof typeof EXERCISE_IDS];

// ---------------------------------------------------------------------------
// Gradini di carico tipici
//
// Sono valori SUGGERITI dell'attrezzo tipico: l'attrezzatura reale si
// configura per istanza (EquipmentInstance) e vince su questi. Nessuna
// percentuale: la specifica §5 vieta gli incrementi percentuali al posto del
// gradino realmente disponibile.
// ---------------------------------------------------------------------------

const MACHINE_STACK_STEP: LoadStep = {
  stepKg: 5,
  minKg: null,
  maxKg: null,
  note: "Gradino tipico di un pacco pesi: 5 kg. Va confermato sull'attrezzo reale e registrato nell'istanza della macchina, perche' esistono pacchi da 2,5 o 4,5 kg.",
};

const DUMBBELL_STEP: LoadStep = {
  stepKg: 2,
  minKg: null,
  maxKg: null,
  note: "Gradino tipico della rastrelliera dei manubri: 2 kg per manubrio. Va confermato sull'attrezzatura reale, perche' alcune rastrelliere salgono di 1 kg e altre di 2,5 kg.",
};

const BODYWEIGHT_PLUS_STEP: LoadStep = {
  stepKg: 2,
  minKg: 0,
  maxKg: null,
  note: "Il numero registrato e' il solo sovraccarico aggiunto (per manubrio), non il peso del corpo. Gradino tipico 2 kg, da confermare sulla rastrelliera reale.",
};

const TIME_ONLY_STEP: LoadStep = {
  stepKg: 0,
  minKg: null,
  maxKg: null,
  note: "Esercizio a tempo: non si aggiunge carico. Il progresso si misura sulla durata mantenuta con la posizione corretta, da confermare seduta per seduta.",
};

// ---------------------------------------------------------------------------
// Guide
// ---------------------------------------------------------------------------

const legPressGuide: ExerciseGuide = {
  primaryMuscles: ['quadricipiti', 'grande gluteo'],
  secondaryMuscles: ['adduttori', 'muscoli posteriori della coscia', 'polpacci'],
  setup: [
    "Regola il sedile in modo che, coi piedi appoggiati sulla pedana, le ginocchia partano intorno ai 90 gradi senza che il bacino si stacchi.",
    "Appoggia completamente bacino e schiena bassa allo schienale: non deve restare spazio vuoto dietro la zona lombare.",
    'Piedi a larghezza delle anche, appoggio pieno su tutta la pianta, punte leggermente in fuori.',
    "Imposta il carico sul pacco pesi e annota il numero letto sulla scala di QUESTA pressa: due presse diverse non si confrontano.",
    'Controlla i fermi di sicurezza e prova la corsa a vuoto una volta prima della prima ripetizione.',
    'Impugna le maniglie laterali senza tirare con le braccia: servono solo a tenerti fermo sul sedile.',
  ],
  execution: [
    'Sblocca i fermi e parti con le gambe quasi distese, senza bloccare le ginocchia a scatto.',
    "Scendi in modo controllato, contando circa due secondi, fino al punto in cui il bacino resta appoggiato.",
    'Fermati un istante in basso senza rimbalzare sul fondo della corsa.',
    'Spingi con tutta la pianta del piede, tenendo le ginocchia allineate ai piedi.',
    "Torna alla posizione di partenza senza estendere di scatto e senza far sbattere il carrello.",
    'Al termine della serie riporta i fermi in posizione di sicurezza prima di alzarti.',
  ],
  breathing:
    "Inspira mentre scendi ed espira mentre spingi, con respirazione continua: non trattenere il respiro in nessun punto della ripetizione.",
  quickCues: [
    'Bacino appoggiato allo schienale.',
    'Scendi contando due secondi.',
    'Spingi con tutta la pianta.',
    'Ginocchia in linea coi piedi.',
    'Niente rimbalzo in basso.',
  ],
  commonMistakes: [
    "Bacino che si stacca in basso: il segnale e' la schiena bassa che si arrotonda e perde contatto con lo schienale.",
    "Corsa piu' ampia della mobilita' del momento: il segnale e' il bacino che si solleva prima della fine della discesa.",
    "Ginocchia che cadono verso l'interno: il segnale e' la rotula che non resta in linea col secondo dito del piede.",
    "Talloni che si alzano: il segnale e' la spinta che passa solo sulle punte.",
    "Estensione a scatto in alto: il segnale e' il rumore secco del carrello a fine corsa.",
  ],
  returningNotes: [
    "Nelle prime sedute usa una corsa di discesa piu' corta e allungala solo quando il bacino resta appoggiato senza sforzo.",
    "Con massa corporea elevata la pressa e' comoda perche' non devi sostenere il peso del corpo: sfruttala per costruire la tecnica con calma.",
    'Le due serie leggere previste dal riscaldamento sul primo esercizio per le gambe si fanno qui e non contano come serie allenanti.',
    "Se dopo la prima seduta l'indolenzimento e' marcato, ripeti lo stesso carico invece di aumentarlo.",
    "Aumenta il carico solo quando completi tutte le serie in cima all'intervallo di ripetizioni con il margine previsto.",
  ],
  variantNotes: [
    "Piedi piu' larghi e punte piu' aperte: piu' lavoro per adduttori e glutei.",
    "Piedi piu' alti sulla pedana: piu' coinvolgimento di glutei e posteriori, corsa piu' gestibile con poca mobilita' di caviglia.",
    "Pressa orizzontale invece che inclinata a 45 gradi: e' un'altra macchina, quindi un altro storico.",
  ],
  personalSettingsToRecord: [
    'Numero o tacca del sedile.',
    'Foro e inclinazione dello schienale, se regolabile.',
    'Posizione dei piedi sulla pedana: altezza e larghezza.',
    "Numero letto sulla scala di questa pressa e gradino reale del pacco pesi.",
    "Etichetta con cui hai registrato la macchina, perche' due presse non sono confrontabili.",
  ],
  motorcyclePurpose:
    "Costruisce forza generale di gambe e anche, la base con cui si regge la posizione in sella e si lavora con le gambe sul mezzo. E' una finalita' della preparazione generale, non una previsione sul tempo sul giro.",
};

const chestPressGuide: ExerciseGuide = {
  primaryMuscles: ['grande pettorale', 'tricipiti'],
  secondaryMuscles: ['deltoide anteriore', 'muscoli che stabilizzano le scapole'],
  setup: [
    'Regola il sedile in modo che le impugnature arrivino circa alla parte media del petto.',
    'Siediti con schiena e testa appoggiate allo schienale e i piedi pieni a terra.',
    'Porta le spalle basse e leggermente indietro prima di afferrare le maniglie.',
    "Imposta il carico e annota il numero letto sulla scala di QUESTA macchina.",
    'Prova la corsa a vuoto una volta per capire dove finisce il movimento utile.',
  ],
  execution: [
    'Afferra le maniglie tenendo i polsi in linea con gli avambracci.',
    "Spingi in avanti in modo uniforme, senza far partire un braccio prima dell'altro.",
    'Fermati poco prima di bloccare completamente i gomiti.',
    'Rientra contando circa due secondi, fino a portare i gomiti poco oltre la linea del tronco.',
    'Mantieni le spalle appoggiate allo schienale: non staccarle per guadagnare corsa.',
    'Esegui tutte le ripetizioni con la stessa ampiezza, poi accompagna il carico a fermarsi.',
  ],
  breathing:
    'Espira durante la spinta e inspira nel ritorno, mantenendo la respirazione continua.',
  quickCues: [
    "Maniglie a meta' del petto.",
    'Spalle basse e appoggiate.',
    'Spingi coi due lati insieme.',
    'Rientro in due secondi.',
    'Gomiti mai bloccati di scatto.',
  ],
  commonMistakes: [
    "Sedile troppo alto o troppo basso: il segnale sono i gomiti molto sopra la linea delle spalle.",
    "Spalle che si staccano dallo schienale per allungare la spinta: il segnale e' la schiena che si inarca.",
    "Corsa di ritorno eccessiva: il segnale e' la ripartenza che diventa uno strappo invece di una spinta.",
    "Un braccio che spinge piu' dell'altro: il segnale e' una maniglia che arriva prima.",
    "Ritorno lasciato cadere: il segnale e' il pacco pesi che sbatte a fine corsa.",
  ],
  returningNotes: [
    "Parti dall'estremita' alta dell'intervallo di ripetizioni con un carico che lascia un margine evidente.",
    "La macchina guida la traiettoria: dopo una lunga pausa e' un punto di partenza comodo perche' devi gestire meno equilibrio.",
    'La serie leggera prevista dal riscaldamento sul primo esercizio superiore si fa qui e non conta come serie allenante.',
    'Se la spalla non resta appoggiata, riduci la corsa di ritorno invece di aumentare il carico.',
    'Nelle prime due settimane il programma chiede circa quattro ripetizioni di riserva: rispettale.',
  ],
  variantNotes: [
    "Impugnatura neutra con palmi affrontati, se la macchina la offre: spesso piu' comoda per la spalla.",
    "Sedile un foro piu' alto: la spinta diventa piu' obliqua verso l'alto e i numeri cambiano.",
    "Spinte con manubri su panca leggermente inclinata: stesso schema di spinta, molto piu' lavoro di equilibrio.",
  ],
  personalSettingsToRecord: [
    'Numero del sedile.',
    'Foro dello schienale, se regolabile.',
    'Tipo di impugnatura usata: neutra o prona.',
    'Numero letto sulla scala di questa macchina.',
    "Etichetta dell'attrezzo, perche' due chest press non si confrontano fra loro.",
  ],
  motorcyclePurpose:
    "Sviluppa forza di spinta del tronco superiore, base generale per gestire il carico che arriva sulle braccia in frenata e per mantenere una posizione stabile. E' preparazione generale, non una garanzia sui tempi.",
};

const seatedCableRowGuide: ExerciseGuide = {
  primaryMuscles: ['grande dorsale', 'muscoli fra le scapole', 'bicipiti'],
  secondaryMuscles: ['muscoli posteriori della spalla', 'muscoli che tengono eretto il tronco'],
  setup: [
    'Scegli la maniglia, triangolo o barra stretta, e agganciala alla carrucola bassa.',
    'Siediti con i piedi appoggiati sulla pedana e le ginocchia leggermente flesse.',
    "Regola la distanza dal cavo: a braccia distese il carico deve essere gia' in tensione.",
    'Imposta il carico e annota il numero letto sulla scala di QUESTA colonna.',
    'Prendi la maniglia con tronco eretto e petto aperto prima della prima ripetizione.',
  ],
  execution: [
    'Parti con le braccia distese e il tronco verticale, senza spalle arrotolate in avanti.',
    'Tira i gomiti indietro vicino ai fianchi, avvicinando le scapole fra loro.',
    'Ferma la maniglia vicino alla parte bassa dello sterno.',
    'Torna contando circa due secondi, lasciando allungare le braccia e controllando il carico.',
    "Tieni il tronco fermo: l'oscillazione avanti e indietro non fa parte dell'esercizio.",
    'Al termine accompagna il carico a fermarsi invece di lasciarlo tornare da solo.',
  ],
  breathing: 'Espira mentre tiri e inspira nel ritorno, con respirazione continua e mai bloccata.',
  quickCues: [
    'Tronco fermo, gomiti indietro.',
    'Scapole verso il centro.',
    'Maniglia allo sterno basso.',
    'Ritorno controllato, due secondi.',
    'Non dondolare col busto.',
  ],
  commonMistakes: [
    "Dondolio del tronco per vincere il carico: il segnale e' che finisci molto inclinato indietro a ogni ripetizione.",
    "Tirata fatta solo con le braccia: il segnale e' che le scapole non si muovono.",
    "Spalle che salgono verso le orecchie: il segnale e' la tensione che si sposta sul collo invece della schiena.",
    "Ritorno lasciato andare: il segnale e' il rumore del pacco pesi.",
    "Presa troppo stretta con polsi piegati: il segnale sono i polsi che cedono prima della schiena.",
  ],
  returningNotes: [
    'Nelle prime settimane usa 8-10 ripetizioni con margine ampio, come previsto dal programma.',
    "Se la presa cede prima della schiena riduci il carico: qui non si allena la presa, quello e' il compito del farmer carry.",
    "Il rematore seduto e' adatto al rientro perche' il tronco e' sostenuto da piedi e sedile.",
    'Annota quale maniglia hai usato: cambiarla cambia i numeri e rende i confronti falsi.',
    'Aggiungi carico solo quando riesci a tenere il tronco immobile per tutte le serie.',
  ],
  variantNotes: [
    "Maniglia a triangolo con presa neutra: la variante piu' comune, tienila come riferimento.",
    "Barra larga con presa prona: piu' lavoro sulla parte alta della schiena.",
    'Una maniglia sola, un braccio per volta: utile per pareggiare due lati diversi.',
  ],
  personalSettingsToRecord: [
    'Tipo di maniglia agganciata.',
    'Posizione del sedile o distanza dalla carrucola.',
    "Altezza della carrucola, se regolabile.",
    'Numero letto sulla scala di questa colonna.',
    "Etichetta dell'attrezzo usato.",
  ],
  motorcyclePurpose:
    "Allena le tirate e i muscoli che tengono chiuse le spalle e stabile il tronco, base generale della postura mantenuta a lungo in sella. E' una finalita' della preparazione generale, non una promessa di prestazione.",
};

const legCurlGuide: ExerciseGuide = {
  primaryMuscles: ['muscoli posteriori della coscia'],
  secondaryMuscles: ['polpacci', 'grande gluteo'],
  setup: [
    "Scegli la macchina disponibile, seduta o a pancia in giu', e annota quale usi.",
    'Regola il cuscinetto inferiore poco sopra il tallone, non sul piede.',
    "Allinea le ginocchia con l'asse di rotazione della macchina.",
    'Nella versione seduta chiudi il cuscinetto sulle cosce in modo saldo ma non schiacciato.',
    'Imposta il carico e annota il numero letto sulla scala di QUESTA macchina.',
  ],
  execution: [
    'Parti con le gambe quasi distese, senza estensione a scatto.',
    'Fletti le ginocchia portando i talloni verso i glutei in circa un secondo e mezzo.',
    'Ferma un istante il punto di massima flessione senza staccare il bacino dal sedile.',
    'Torna contando circa due secondi, accompagnando il carico.',
    'Tieni le punte dei piedi nella stessa posizione per tutta la serie.',
  ],
  breathing: 'Espira mentre fletti le ginocchia e inspira nel ritorno, senza bloccare il respiro.',
  quickCues: [
    'Cuscinetto sopra il tallone.',
    'Bacino fermo sul sedile.',
    'Talloni verso i glutei.',
    'Ritorno lento e controllato.',
    'Punte dei piedi sempre uguali.',
  ],
  commonMistakes: [
    "Bacino che si stacca per aiutare: il segnale e' il sedere che si alza dal sedile.",
    "Cuscinetto troppo in basso sul piede: il segnale e' che senti pressione sul tallone invece di lavoro sulla coscia.",
    "Corsa parziale: il segnale e' un movimento che si ferma molto prima della flessione disponibile.",
    "Ritorno lasciato cadere: il segnale e' il rumore del pacco pesi.",
    "Carico eccessivo con aiuto del tronco: il segnale e' il busto che si muove a ogni ripetizione.",
  ],
  returningNotes: [
    "Il programma prevede 10-12 ripetizioni: e' un intervallo comodo per ritrovare il controllo.",
    "Dopo anni di pausa la parte posteriore della coscia e' spesso quella piu' indietro: procedi con incrementi piccoli.",
    "Se l'indolenzimento nei giorni successivi e' molto marcato, ripeti lo stesso carico la volta dopo.",
    'Non cercare mai l\'estensione completa a scatto nella fase di ritorno.',
    'Annota se hai usato la versione seduta o prona: gli storici restano separati.',
  ],
  variantNotes: [
    "Leg curl seduto: spesso piu' semplice da tenere fermo, buon riferimento di partenza.",
    "Leg curl a pancia in giu': il bacino tende a staccarsi e richiede piu' attenzione, e' uno storico distinto.",
    'Una gamba per volta: utile se un lato lavora visibilmente meno dell\'altro.',
  ],
  personalSettingsToRecord: [
    'Macchina usata: seduta o prona.',
    'Posizione del cuscinetto per le caviglie.',
    'Posizione dello schienale o del cuscinetto sulle cosce.',
    'Numero letto sulla scala di questa macchina.',
    "Etichetta dell'attrezzo usato.",
  ],
  motorcyclePurpose:
    "Rinforza la parte posteriore della coscia per equilibrare il lavoro dei quadricipiti nella preparazione generale e sostenere le posizioni a ginocchia flesse. E' preparazione generale, non una garanzia di risultato in pista.",
};

const pallofPressGuide: ExerciseGuide = {
  primaryMuscles: ['muscoli obliqui', 'muscoli profondi del tronco'],
  secondaryMuscles: ['deltoidi anteriori', 'grande gluteo'],
  setup: [
    "Imposta la carrucola all'altezza del petto e aggancia una maniglia singola.",
    'Mettiti di fianco alla colonna, a circa un passo e mezzo, piedi a larghezza delle anche.',
    'Afferra la maniglia con entrambe le mani e portala al centro dello sterno.',
    'Allontanati dalla colonna fino a sentire il cavo in tensione costante.',
    "Imposta un carico basso: qui il carico giusto e' quello che riesci a non farti ruotare addosso.",
    'Annota il numero letto sulla scala e da quale lato stai iniziando.',
  ],
  execution: [
    'Ginocchia morbide, bacino in posizione neutra, costole basse.',
    'Spingi le mani in avanti fino a braccia distese mantenendo lo sterno rivolto davanti a te.',
    'Resisti alla rotazione: il cavo tira verso la colonna, il tronco non la segue.',
    'Mantieni la posizione a braccia distese per un paio di secondi.',
    'Rientra al petto in modo controllato e ripeti.',
    "Completa le ripetizioni di un lato, poi girati e ripeti dall'altro lato.",
  ],
  breathing:
    "Respira normalmente, con un'espirazione lenta mentre spingi in avanti: non trattenere il respiro per irrigidirti.",
  quickCues: [
    'Sterno sempre rivolto avanti.',
    'Non lasciarti ruotare dal cavo.',
    'Costole basse, bacino neutro.',
    'Spingi lento, torna lento.',
    'Carico basso, controllo alto.',
  ],
  commonMistakes: [
    "Carico troppo alto: il segnale e' il tronco che ruota o un piede che si sposta.",
    "Bacino spinto in avanti: il segnale e' la schiena bassa che si inarca.",
    "Distanza dalla colonna insufficiente: il segnale e' la tensione che scompare a braccia distese.",
    "Trattenere il respiro per resistere: si riconosce perche' finisci la serie senza aver respirato.",
    "Ripetizioni troppo rapide: il segnale e' che non riesci a fermarti a braccia distese.",
  ],
  returningNotes: [
    'Nelle prime due settimane il programma prevede una sola serie: non aggiungerne altre.',
    'Parti da un carico che ti permette dieci ripetizioni pulite per lato con margine.',
    "E' un esercizio di controllo: se devi spingere di slancio, il carico e' troppo alto.",
    "Annota il numero per lato, perche' i due lati possono comportarsi in modo diverso.",
    "Il progresso qui e' prima di tutto immobilita' del tronco, poi carico.",
  ],
  variantNotes: [
    "In ginocchio su un solo ginocchio: riduce l'aiuto delle gambe e aumenta il lavoro del tronco.",
    "In piedi con passo affiancato: la versione base del programma, la piu' stabile.",
    "Tenuta prolungata a braccia distese invece di piu' ripetizioni: utile quando il carico minimo e' gia' facile.",
  ],
  personalSettingsToRecord: [
    'Altezza della carrucola.',
    'Tipo di maniglia agganciata.',
    'Distanza dei piedi dalla colonna, contata in passi o in piastrelle.',
    'Numero letto sulla scala, annotato per lato.',
    'Etichetta della colonna dei cavi usata.',
  ],
  motorcyclePurpose:
    "Allena la capacita' del tronco di resistere alla rotazione, qualita' generale che sostiene la stabilita' del busto quando le braccia lavorano in modo asimmetrico. E' preparazione generale, non una previsione sul giro.",
};

const farmerCarryGuide: ExerciseGuide = {
  primaryMuscles: ['muscoli della presa e degli avambracci', 'muscoli che tengono eretto il tronco'],
  secondaryMuscles: ['spalle', 'grande gluteo', 'quadricipiti'],
  setup: [
    'Scegli due manubri uguali e appoggiali a terra ai lati dei piedi.',
    'Individua un percorso libero di almeno una decina di metri, da fare avanti e indietro.',
    'Prepara il cronometro: questa serie si misura in secondi, non in ripetizioni.',
    'Solleva i manubri piegando anche e ginocchia, prendendone uno per lato.',
    'Prima di partire porta le spalle basse e lo sguardo avanti.',
  ],
  execution: [
    'Cammina a passi normali, con i manubri vicini alle cosce senza farli sbattere.',
    'Tieni il tronco eretto e le costole basse: nessuna inclinazione laterale.',
    'Respira in modo regolare, passo dopo passo.',
    'Continua per il tempo previsto dalla serie: nel programma iniziale 20-30 secondi.',
    "Interrompi appena la postura si deforma o la presa non e' piu' sicura.",
    'Appoggia i manubri a terra piegando anche e ginocchia, senza lasciarli cadere.',
  ],
  breathing:
    'Respirazione regolare durante tutto il cammino: non trattenere il respiro nemmeno negli ultimi secondi.',
  quickCues: [
    'Spalle basse, sguardo avanti.',
    'Tronco eretto, niente inclinazioni.',
    'Passi normali e regolari.',
    'Fermati se la postura cede.',
    'Nessuna prova massimale di presa.',
  ],
  commonMistakes: [
    "Inclinarsi da un lato: il segnale e' un manubrio che sbatte contro la coscia.",
    "Passi corti e rigidi: il segnale e' un cammino a scatti invece che fluido.",
    "Spalle tirate su verso le orecchie: il segnale e' il collo che si irrigidisce.",
    "Cercare il tempo massimo a ogni costo: il programma non prevede prove massimali di presa.",
    "Lasciar cadere i manubri alla fine: il segnale e' il rumore e la schiena che si arrotonda.",
  ],
  returningNotes: [
    "Nelle prime due settimane e' prevista una sola serie: bastano 20-30 secondi.",
    "Parti con manubri chiaramente gestibili: qui il progresso e' postura e durata, non peso massimo.",
    "Con massa corporea elevata il cammino sotto carico e' gia' impegnativo: tieni percorsi brevi e ritmo tranquillo.",
    "Se il limite e' la presa, mantieni lo stesso peso e allunga di pochi secondi alla volta.",
    'Nessuna prova di presa portata a cedimento, in nessuna settimana del programma.',
  ],
  variantNotes: [
    "Trasporto con un solo manubrio, tipo valigia: aumenta il lavoro contro l'inclinazione laterale.",
    "Tenuta da fermo invece del cammino: utile quando non c'e' spazio libero in sala.",
    "Percorso piu' lungo a peso costante: il modo piu' semplice e prudente di progredire.",
  ],
  personalSettingsToRecord: [
    'Peso di ciascun manubrio, nella convenzione per manubrio.',
    "Tipo di manubrio e spessore dell'impugnatura.",
    'Lunghezza del percorso usato.',
    'Eventuale uso della magnesite, se la palestra la consente.',
    'Durata effettivamente mantenuta nelle serie precedenti.',
  ],
  motorcyclePurpose:
    "Sviluppa presa, avambracci e tenuta posturale sotto carico, qualita' generali che sostengono il comfort su manubrio e pedane durante turni ripetuti. E' preparazione generale, senza promesse sui tempi.",
};

const romanianDeadliftGuide: ExerciseGuide = {
  primaryMuscles: ['muscoli posteriori della coscia', 'grande gluteo'],
  secondaryMuscles: ['muscoli che tengono eretta la schiena', 'grande dorsale', 'muscoli della presa'],
  setup: [
    'Prendi due manubri uguali e portali davanti alle cosce con le braccia distese.',
    'Piedi a larghezza delle anche, appoggio pieno, ginocchia morbide.',
    'Porta le spalle basse e il petto aperto, con i manubri a contatto con le gambe.',
    "Scegli un carico che lasci un margine evidente: non serve arrivare a terra con i manubri.",
    'Libera lo spazio davanti a te e controlla che il pavimento non sia scivoloso.',
  ],
  execution: [
    'Inizia portando il bacino indietro, non piegando la schiena.',
    'Scendi facendo scorrere i manubri lungo le cosce, tenendoli vicini alle gambe.',
    "Fermati quando senti allungarsi la parte posteriore delle cosce e la schiena e' ancora piatta: non serve arrivare a terra.",
    'Risali spingendo il bacino in avanti e contraendo i glutei.',
    'Arriva in piedi senza inarcare la schiena indietro oltre la verticale.',
    'Mantieni le ginocchia leggermente flesse e costanti per tutta la serie.',
    'Al termine appoggia i manubri piegando anche e ginocchia, senza lasciarli cadere.',
  ],
  breathing:
    'Inspira prima di scendere ed espira risalendo: nessuna trattenuta prolungata del respiro.',
  quickCues: [
    'Bacino indietro, non schiena curva.',
    'Manubri vicini alle gambe.',
    'Non serve arrivare a terra.',
    'Risali spingendo il bacino avanti.',
    'Ginocchia morbide e costanti.',
  ],
  commonMistakes: [
    "Schiena che si arrotonda: il segnale e' che i manubri si allontanano dalle gambe.",
    "Inseguire il pavimento a tutti i costi: il segnale e' il bacino che ruota e la schiena che cede in basso.",
    "Piegare le ginocchia come in un'accosciata: il segnale e' il bacino che scende invece di andare indietro.",
    "Inarcamento a fine risalita: il segnale e' il bacino spinto oltre la linea del tronco.",
    "Presa che cede prima delle gambe: il segnale sono le dita che si aprono negli ultimi centimetri.",
  ],
  returningNotes: [
    "La specifica prevede l'hip thrust alla macchina come alternativa quando la tecnica dello stacco non e' ancora adeguata, da valutare con un istruttore.",
    'Nelle prime due settimane il programma prevede 8-10 ripetizioni con circa quattro di riserva.',
    'Riduci l\'ampiezza: nelle prime sedute bastano pochi centimetri di discesa.',
    'Fai le serie leggere di riscaldamento previste dal programma prima di caricare.',
    "Gli storici di stacco rumeno e hip thrust restano distinti: non confrontare i due numeri.",
  ],
  variantNotes: [
    "Stacco rumeno con due manubri: la versione del programma, la piu' semplice da dosare.",
    "Un solo manubrio tenuto a due mani: corsa piu' corta, utile per imparare il movimento del bacino.",
    "Su una gamba con appoggio leggero: molto piu' impegnativo per l'equilibrio, non e' il punto di partenza.",
  ],
  personalSettingsToRecord: [
    'Peso di ciascun manubrio, nella convenzione per manubrio.',
    "Ampiezza di discesa raggiunta senza perdere la posizione, per esempio meta' tibia.",
    'Distanza fra i piedi.',
    'Tipo di manubri usati.',
    "Eventuale passaggio all'alternativa hip thrust, con la data della scelta.",
  ],
  motorcyclePurpose:
    "Allena la catena posteriore e il controllo del bacino, base generale per reggere la posizione in sella e i trasferimenti di carico. E' preparazione generale, non una garanzia di miglioramento cronometrico.",
};

const latPulldownGuide: ExerciseGuide = {
  primaryMuscles: ['grande dorsale', 'bicipiti'],
  secondaryMuscles: ['muscoli fra le scapole', 'muscoli posteriori della spalla', 'addome'],
  setup: [
    'Scegli la barra, larga prona o a presa neutra, e annota quale usi.',
    'Regola il cuscinetto sulle cosce in modo che il bacino resti fermo sul sedile.',
    'Siediti e afferra la barra con le braccia distese in alto.',
    'Imposta il carico e annota il numero letto sulla scala di QUESTA lat machine.',
    'Prima di tirare porta le spalle in basso e il petto leggermente in alto.',
  ],
  execution: [
    'Parti da braccia distese, lasciando salire un poco le scapole.',
    'Tira la barra davanti al petto, verso la parte alta dello sterno.',
    'Porta i gomiti verso il basso e verso i fianchi, non indietro.',
    'Ferma la barra poco prima che tocchi il petto, senza forzare oltre.',
    'Risali contando circa due secondi, controllando il carico fino alle braccia distese.',
    "Tieni il tronco quasi verticale: una leggera inclinazione e' accettabile, il dondolio no.",
    'Non portare mai la barra dietro il collo: non fa parte di questo esercizio.',
  ],
  breathing: 'Espira mentre tiri la barra in basso e inspira mentre la accompagni in alto.',
  quickCues: [
    'Barra davanti al petto, mai dietro.',
    'Gomiti verso i fianchi.',
    'Spalle basse prima di tirare.',
    'Risalita controllata, braccia distese.',
    'Tronco quasi verticale.',
  ],
  commonMistakes: [
    "Tirare dietro il collo: va evitato sempre e non e' previsto dal programma.",
    "Dondolio del tronco: il segnale e' il busto che va molto indietro a ogni ripetizione.",
    "Corsa parziale in alto: il segnale e' che le braccia non tornano mai distese.",
    "Presa troppo larga: il segnale sono i gomiti che si aprono e la corsa che si accorcia.",
    "Risalita lasciata andare: il segnale e' il pacco pesi che sbatte.",
  ],
  returningNotes: [
    'Il programma prevede 8-10 ripetizioni: cerca il controllo, non il carico massimo.',
    'Se non arrivi al petto con la schiena ferma, scendi di un gradino di carico.',
    'Annota la presa usata: una presa diversa significa uno storico diverso.',
    'Se il bacino si stacca dal sedile, stringi meglio il cuscinetto sulle cosce prima di ridurre il carico.',
    "Dopo una lunga pausa e' normale che la parte alta della schiena sia il limite: aumenta per gradini piccoli.",
  ],
  variantNotes: [
    'Presa prona larga davanti al petto: la versione prevista dal programma.',
    "Presa neutra con barra a V: spesso piu' comoda per spalla e gomito, storico distinto.",
    "Presa supina stretta: piu' lavoro delle braccia e corsa piu' breve, storico distinto.",
  ],
  personalSettingsToRecord: [
    'Tipo di barra o maniglia.',
    "Larghezza della presa, cioe' la posizione delle mani sulla barra.",
    'Altezza del cuscinetto sulle cosce.',
    'Numero letto sulla scala di questa macchina.',
    "Etichetta dell'attrezzo usato.",
  ],
  motorcyclePurpose:
    "Costruisce forza di tirata verticale e resistenza dei muscoli della schiena, base generale per sostenere il tronco quando le braccia lavorano sul manubrio. E' preparazione generale, non una promessa sui tempi.",
};

const stepUpGuide: ExerciseGuide = {
  primaryMuscles: ['quadricipiti', 'grande gluteo'],
  secondaryMuscles: [
    'muscoli posteriori della coscia',
    "muscoli che stabilizzano l'anca",
    'polpacci',
  ],
  setup: [
    "Scegli un gradino stabile e inizialmente basso: l'altezza si aumenta solo dopo, per gradi.",
    'Controlla che il gradino non scivoli e che appoggi su una superficie piana.',
    'Posizionati vicino a un appoggio per la mano, da usare quando serve.',
    'Nelle prime settimane lavora a corpo libero, senza manubri.',
    'Quando aggiungi carico usa due manubri uguali tenuti lungo i fianchi.',
    'Decidi con quale gamba inizi e annotalo, per alternare in modo ordinato.',
  ],
  execution: [
    'Appoggia tutto il piede sul gradino, con il ginocchio in linea con il piede.',
    'Sali spingendo con la gamba appoggiata sul gradino, senza spinta della gamba a terra.',
    'Arriva in piedi sul gradino con il bacino in posizione neutra.',
    'Scendi in modo controllato usando la stessa gamba che ha lavorato.',
    'Appoggia prima la punta e poi il tallone a terra, senza tonfo.',
    "Completa le ripetizioni previste per una gamba, poi passa all'altra.",
    'Il recupero principale va dopo entrambe le gambe, non fra i due lati.',
  ],
  breathing: 'Espira mentre sali e inspira mentre scendi, con respiro continuo.',
  quickCues: [
    'Gradino basso e stabile.',
    'Piede intero sul gradino.',
    'Non spingere con la gamba a terra.',
    'Discesa controllata, niente tonfo.',
    'Appoggio con la mano se serve.',
  ],
  commonMistakes: [
    "Gradino troppo alto subito: il segnale e' il tronco che si butta avanti per riuscire a salire.",
    "Spinta della gamba rimasta a terra: il segnale e' il tallone di quel piede che stacca prima del resto.",
    "Discesa lasciata cadere: il segnale e' il rumore dell'appoggio a terra.",
    "Ginocchio che cade verso l'interno: il segnale e' il bacino che si abbassa dal lato libero.",
    "Rifiutare l'appoggio della mano quando serve: il segnale e' l'equilibrio che si perde a meta' serie.",
  ],
  returningNotes: [
    'Il programma prevede 6-8 ripetizioni per gamba nelle prime due settimane, senza manubri.',
    "Dalla terza settimana si passa a 8 per gamba, mantenendo un'altezza di gradino gestibile.",
    "Usa l'appoggio della mano quando serve: non e' un fallimento, e' parte della progressione.",
    "Migliora prima la stabilita' e la qualita' della discesa, poi l'altezza, poi il carico.",
    "Con massa corporea elevata il corpo libero e' gia' un carico significativo: non aggiungere peso presto.",
  ],
  variantNotes: [
    "Gradino piu' basso: versione di ingresso; cambia la corsa, quindi e' uno storico distinto.",
    "Gradino piu' alto: aumenta il lavoro e va introdotto solo con discesa controllata; storico distinto.",
    'Con due manubri lungo i fianchi: il sovraccarico si registra come kg aggiunti, non come storico separato.',
  ],
  personalSettingsToRecord: [
    'Altezza del gradino in centimetri o numero di elementi impilati.',
    'Gamba con cui inizi.',
    "Uso o meno dell'appoggio per la mano.",
    "Peso di ciascun manubrio quando presente, cioe' il solo sovraccarico.",
    'Dove si trova in sala il gradino che usi, per ritrovare la stessa altezza.',
  ],
  motorcyclePurpose:
    "Allena l'appoggio su una gamba e il controllo dell'anca, base generale per la stabilita' del bacino e per gli spostamenti del corpo sul mezzo. E' preparazione generale, non una garanzia di risultato.",
};

const inclineDumbbellPressGuide: ExerciseGuide = {
  primaryMuscles: ['grande pettorale, parte alta', 'deltoide anteriore', 'tricipiti'],
  secondaryMuscles: ['muscoli che stabilizzano le scapole', 'addome'],
  setup: [
    "Regola la panca su un'inclinazione leggera, intorno ai 15-30 gradi.",
    'Prendi due manubri uguali e siediti tenendoli appoggiati sulle cosce.',
    'Sdraiati accompagnando i manubri verso il petto con la spinta delle gambe.',
    'Appoggia testa, spalle e bacino sulla panca, coi piedi pieni a terra.',
    'Porta i manubri sopra le spalle, coi gomiti a circa 45 gradi dal tronco.',
    "Annota l'inclinazione usata: cambiarla cambia i numeri della serie.",
  ],
  execution: [
    'Parti con le braccia distese e i gomiti non bloccati.',
    'Scendi contando circa due secondi, fino a portare i gomiti poco sotto la linea del tronco.',
    'Mantieni i polsi in linea con gli avambracci.',
    "Spingi verso l'alto e leggermente verso il centro, senza far sbattere i manubri fra loro.",
    'Tieni le spalle appoggiate alla panca per tutta la serie.',
    'Al termine riappoggia i manubri sulle cosce e rialzati, senza lasciarli cadere di lato.',
  ],
  breathing: 'Espira mentre spingi e inspira mentre scendi, con respirazione continua.',
  quickCues: [
    'Inclinazione leggera, sempre la stessa.',
    'Spalle appoggiate alla panca.',
    'Gomiti a 45 gradi dal tronco.',
    'Discesa in due secondi.',
    'Non far sbattere i manubri.',
  ],
  commonMistakes: [
    "Gomiti aperti a 90 gradi dal tronco: il segnale e' la spalla che si stacca dalla panca.",
    "Discesa piu' profonda di quanto controlli: il segnale e' la ripartenza che diventa uno strappo.",
    "Bacino che si stacca per aiutare la spinta: il segnale e' la schiena che si inarca.",
    "Manubri che si toccano in alto: il segnale e' il rumore e la perdita di tensione.",
    "Inclinazione diversa a ogni seduta: il segnale e' uno storico che non torna e numeri non confrontabili.",
  ],
  returningNotes: [
    'Il programma prevede 8-10 ripetizioni: parti da un carico con margine evidente.',
    "Con i manubri devi gestire anche equilibrio e traiettoria: aumenta di un gradino solo quando il movimento e' pulito.",
    'Se hai dubbi sul controllo dei manubri nel salire e scendere dalla panca, chiedi assistenza in sala.',
    "Annota sempre l'inclinazione: due inclinazioni diverse non sono confrontabili.",
    'Se un braccio arriva sempre dopo, tieni il carico fermo e lavora sulla simmetria.',
  ],
  variantNotes: [
    "Inclinazione minima, intorno ai 15 gradi: la versione piu' vicina alla panca piana.",
    "Inclinazione media, intorno ai 30 gradi: piu' lavoro sulla parte alta del petto e sulle spalle.",
    "Presa neutra con palmi affrontati: spesso piu' comoda per la spalla, cambia i numeri.",
  ],
  personalSettingsToRecord: [
    "Foro o numero dell'inclinazione della panca.",
    'Peso di ciascun manubrio, nella convenzione per manubrio.',
    'Tipo di presa: prona o neutra.',
    'Posizione dei piedi a terra.',
    'Ampiezza di discesa che riesci a controllare.',
  ],
  motorcyclePurpose:
    "Aggiunge forza di spinta con controllo dell'equilibrio fra i due lati, base generale per gestire carichi asimmetrici sulle braccia. E' preparazione generale, non una previsione sul giro.",
};

const adductorMachineGuide: ExerciseGuide = {
  primaryMuscles: ["adduttori, cioe' i muscoli interni della coscia"],
  secondaryMuscles: ['muscoli del bacino', 'grande gluteo'],
  setup: [
    "Regola l'apertura di partenza dei cuscinetti su un'ampiezza comoda, non massima.",
    'Siediti con la schiena appoggiata e il bacino in fondo al sedile.',
    'Appoggia la parte interna delle cosce ai cuscinetti, con le ginocchia flesse.',
    'Imposta il carico e annota il numero letto sulla scala di QUESTA macchina.',
    'Impugna le maniglie laterali senza tirare con le braccia.',
  ],
  execution: [
    'Chiudi le gambe in modo controllato, senza scatti.',
    'Ferma un istante il punto di massima chiusura.',
    "Riapri contando circa due secondi, fino all'ampiezza impostata.",
    'Mantieni la schiena appoggiata allo schienale per tutta la serie.',
    'Usa la stessa ampiezza in tutte le ripetizioni della serie.',
  ],
  breathing: 'Espira mentre chiudi le gambe e inspira mentre riapri.',
  quickCues: [
    'Ampiezza comoda, non massima.',
    'Schiena appoggiata al sedile.',
    'Chiudi e apri senza scatti.',
    'Stessa ampiezza ogni ripetizione.',
    'Ritorno controllato, due secondi.',
  ],
  commonMistakes: [
    "Apertura di partenza troppo ampia: il segnale e' il bacino che si sposta all'inizio del movimento.",
    "Ritorno lasciato andare: il segnale sono i cuscinetti che si aprono di colpo.",
    "Spinta con le mani sulle maniglie: il segnale sono le braccia che si irrigidiscono a ogni ripetizione.",
    "Ampiezza diversa a ogni ripetizione: il segnale e' che non sai piu' cosa hai davvero eseguito.",
    "Carico troppo alto per l'ampiezza scelta: il segnale e' il movimento che diventa un colpo secco.",
  ],
  returningNotes: [
    'Il programma prevede 12-15 ripetizioni: intervallo alto e carico moderato.',
    "Nelle prime sedute usa un'apertura ridotta e allargala per gradi.",
    "E' un esercizio complementare: non serve inseguire il carico.",
    "Se l'interno coscia resta molto indolenzito, mantieni lo stesso carico la seduta successiva.",
    "Annota l'ampiezza: due ampiezze diverse non sono la stessa serie.",
  ],
  variantNotes: [
    'Apertura ridotta: punto di partenza adatto al rientro.',
    "Apertura ampia: da usare solo quando il controllo e' stabile, cambia i numeri.",
    "Tenute brevi in chiusura: variante utile quando il carico minimo e' gia' facile.",
  ],
  personalSettingsToRecord: [
    "Tacca dell'apertura di partenza.",
    'Numero del sedile o dello schienale.',
    'Numero letto sulla scala di questa macchina.',
    "Etichetta dell'attrezzo usato.",
    'Ampiezza adottata, per confrontare serie davvero uguali.',
  ],
  motorcyclePurpose:
    "Rinforza l'interno coscia, base generale per la chiusura delle gambe sul serbatoio e per la stabilita' del bacino. E' preparazione generale, non una garanzia di miglioramento in pista.",
};

const sideplankGuide: ExerciseGuide = {
  primaryMuscles: ['muscoli obliqui', 'muscoli laterali del tronco'],
  secondaryMuscles: ['deltoide della spalla di appoggio', 'muscoli del bacino'],
  setup: [
    'Stendi un tappetino e mettiti su un fianco.',
    "Appoggia l'avambraccio a terra, col gomito esattamente sotto la spalla.",
    "Piega le ginocchia e appoggiale a terra, una sopra l'altra.",
    'Allinea testa, tronco e bacino su una linea sola, senza ruotare il petto.',
    'Prepara il cronometro: questa serie si misura in secondi per lato.',
    'Scegli da quale lato inizi e annotalo.',
  ],
  execution: [
    'Solleva il bacino portando il fianco in linea con spalla e ginocchia.',
    'Tieni attiva la spalla di appoggio, senza lasciarla affondare.',
    'Mantieni la posizione per i secondi previsti: nel programma iniziale 15-25 per lato.',
    'Respira in modo regolare durante tutta la tenuta.',
    "Interrompi quando non riesci piu' a mantenere la posizione: la serie finisce in quel momento.",
    'Appoggia il bacino a terra, cambia lato e ripeti.',
  ],
  breathing:
    'Respirazione regolare e continua per tutta la tenuta: nessuna trattenuta del respiro.',
  quickCues: [
    'Gomito sotto la spalla.',
    'Ginocchia appoggiate a terra.',
    'Fianco, spalla e ginocchia in linea.',
    'Respira durante la tenuta.',
    'Interrompi se la posizione cede.',
  ],
  commonMistakes: [
    "Bacino che scende: il segnale e' il fianco che si avvicina al pavimento.",
    "Tronco ruotato: il segnale e' il petto che inizia a guardare verso terra.",
    "Gomito troppo avanti: il segnale e' la spalla che si trova dietro al gomito invece che sopra.",
    "Trattenere il respiro per resistere: il segnale e' l'espirazione che arriva solo alla fine.",
    "Continuare oltre la tenuta della posizione: il programma chiede di interrompere quando non si mantiene la posizione.",
  ],
  returningNotes: [
    "Nelle prime due settimane e' prevista una sola serie per lato.",
    "Con le ginocchia appoggiate la leva e' piu' corta: e' la versione giusta per il rientro.",
    'Meglio quindici secondi puliti che trenta col bacino che scende.',
    'Il progresso qui si misura in secondi di tenuta, non in carico.',
    "Se un lato tiene meno dell'altro, usa il tempo del lato piu' debole come riferimento per entrambi.",
  ],
  variantNotes: [
    "Ginocchia appoggiate: la versione del programma, la piu' accessibile.",
    "Gambe distese con appoggio sui piedi: leva piu' lunga e tenute piu' brevi, storico distinto.",
    "Mano libera sul fianco oppure tesa verso l'alto: la seconda e' piu' impegnativa per l'equilibrio.",
  ],
  personalSettingsToRecord: [
    'Lato con cui inizi.',
    'Versione usata: ginocchia appoggiate o gambe distese.',
    "Secondi mantenuti per lato nell'ultima seduta.",
    'Posizione della mano libera.',
    "Superficie usata, se cambia la stabilita' dell'appoggio.",
  ],
  motorcyclePurpose:
    "Allena la tenuta laterale del tronco, qualita' generale che sostiene il busto nei cambi di direzione e nelle posizioni mantenute a lungo. E' preparazione generale, non una garanzia sul tempo sul giro.",
};

const hipThrustGuide: ExerciseGuide = {
  primaryMuscles: ['grande gluteo'],
  secondaryMuscles: ['muscoli posteriori della coscia', 'addome'],
  setup: [
    'Regola lo schienale o il supporto lombare in modo che il bordo cada sotto le scapole.',
    'Siediti e sistema il cuscinetto sul bacino, non sulla pancia.',
    'Piedi a larghezza delle anche, appoggio pieno, ginocchia intorno ai 90 gradi in posizione alta.',
    'Imposta il carico e annota il numero letto sulla scala di QUESTA macchina.',
    'Controlla il fermo di sicurezza e prova la corsa a vuoto prima di caricare.',
  ],
  execution: [
    'Parti col bacino in basso e le costole basse.',
    'Spingi il bacino verso l\'alto contraendo i glutei, non inarcando la schiena.',
    'Fermati quando tronco e cosce sono allineati: non proseguire oltre.',
    'Scendi contando circa due secondi, accompagnando il carico.',
    'Mantieni lo sguardo avanti e il mento raccolto, senza spingere la testa indietro.',
    'Usa la stessa ampiezza in tutte le ripetizioni della serie.',
  ],
  breathing: "Espira spingendo il bacino in alto e inspira mentre scendi.",
  quickCues: [
    'Cuscinetto sul bacino, non sulla pancia.',
    'Spingi coi glutei, non con la schiena.',
    'Fermati in linea, non oltre.',
    'Costole basse, mento raccolto.',
    'Discesa controllata in due secondi.',
  ],
  commonMistakes: [
    "Estendere oltre la linea in alto: il segnale e' la schiena che si inarca e le costole che si aprono.",
    "Cuscinetto troppo in alto sull'addome: il segnale e' la pressione sulla pancia invece del lavoro sui glutei.",
    "Spinta sulle punte dei piedi: il segnale sono i talloni che si alzano dalla pedana.",
    "Corsa parziale: il segnale e' il bacino che non arriva mai in linea col tronco.",
    "Discesa lasciata cadere: il segnale e' il rumore del carico a fine corsa.",
  ],
  returningNotes: [
    "E' l'alternativa prevista dalla specifica allo stacco rumeno quando la tecnica dello stacco non e' ancora adeguata, da valutare con un istruttore.",
    'A regime il programma prevede 3 serie da 8-10; nelle prime quattro settimane 2 serie da 8-10.',
    "Lo storico dell'hip thrust resta separato da quello dello stacco rumeno: sono due esercizi distinti.",
    "Se scegli questa alternativa annota la data della scelta, cosi' lo storico resta leggibile.",
    "La macchina guida il movimento: dopo una lunga pausa e' un ingresso comodo allo schema di estensione dell'anca.",
  ],
  variantNotes: [
    "Piedi piu' avanti sulla pedana: piu' lavoro per i posteriori della coscia.",
    "Piedi piu' vicini al bacino: piu' lavoro per i glutei.",
    "Piedi piu' larghi con punte in fuori: variante comoda quando l'anca si sente stretta.",
  ],
  personalSettingsToRecord: [
    'Posizione del cuscinetto sul bacino.',
    'Numero dello schienale o del supporto lombare.',
    'Distanza e larghezza dei piedi sulla pedana.',
    'Numero letto sulla scala di questa macchina.',
    "Etichetta dell'attrezzo usato.",
  ],
  motorcyclePurpose:
    "Rafforza i glutei e l'estensione dell'anca in modo guidato, base generale per la spinta di bacino e per la tenuta della posizione. E' preparazione generale, non una promessa di prestazione.",
};

const stationaryBikeGuide: ExerciseGuide = {
  primaryMuscles: ['quadricipiti', 'grande gluteo'],
  secondaryMuscles: [
    'muscoli posteriori della coscia',
    'polpacci',
    'muscoli che tengono eretto il tronco',
  ],
  setup: [
    "Regola l'altezza del sellino: col pedale in basso il ginocchio deve restare leggermente flesso.",
    "Regola la distanza del sellino dal manubrio e l'altezza del manubrio per stare comodo.",
    'Appoggia la parte anteriore del piede sul pedale e chiudi i cinturini, se ci sono.',
    'Imposta una resistenza facile per il riscaldamento.',
    'Avvia il computer della cyclette o il cronometro: qui si misurano i minuti.',
  ],
  execution: [
    'Riscaldamento: 5 minuti facili all\'inizio della seduta, come previsto dal programma.',
    'Lavoro finale: pedalata continua facile, 8-10 minuti nelle prime due settimane.',
    'Dalla terza settimana porta gradualmente il lavoro finale a 12-15 minuti.',
    'Nelle settimane dalla quinta alla dodicesima il riferimento resta 12-15 minuti.',
    "Se scegli espressamente l'alternativa prevista dalla settimana 7 (solo seduta B): 3 minuti facili, 6 cicli di 30 secondi sostenuti e 60 facili, poi 3 minuti facili, per 15 minuti totali.",
    'I tratti sostenuti non sono sprint massimali: devi poter parlare a frasi brevi.',
    'Chiudi sempre con qualche decina di secondi molto facili.',
  ],
  breathing:
    'Respirazione regolare per tutta la pedalata: tieni un ritmo che ti permetta di parlare a frasi brevi.',
  quickCues: [
    "Sellino all'altezza dell'anca.",
    'Pedalata rotonda e regolare.',
    'Facile vuol dire poter parlare.',
    'Sostenuto non vuol dire sprint.',
    'Chiudi sempre con tratto facile.',
  ],
  commonMistakes: [
    "Sellino troppo basso: il segnale e' il ginocchio molto chiuso a fine pedalata.",
    "Resistenza troppo alta nel riscaldamento: il segnale e' il respiro corto dopo un minuto.",
    "Trasformare i tratti sostenuti in sprint: il programma li esclude espressamente.",
    "Saltare la parte facile finale: il segnale e' finire la seduta col respiro ancora alto.",
    "Usare l'alternativa a intervalli per abitudine: va scelta espressamente e non si attiva col passare dei giorni.",
  ],
  returningNotes: [
    "Nelle prime due settimane il lavoro finale e' 8-10 minuti facili: non serve di piu'.",
    "L'alternativa a intervalli e' prevista solo dalla settimana 7 e solo nella seduta B.",
    'Il riscaldamento di 5 minuti serve a preparare la seduta, non a stancare.',
    "Se la giornata e' faticosa, resta sul lavoro continuo facile.",
    'Nessun test di potenza e nessuna prova massimale, in nessuna fase.',
  ],
  variantNotes: [
    'Pedalata continua facile: la versione base, usata sia in riscaldamento sia nel lavoro finale.',
    "Alternativa a intervalli da 15 minuti, dalla settimana 7 e solo nella seduta B: va scelta espressamente.",
    'Cyclette verticale o reclinata: cambia la postura e spesso la scala di resistenza, quindi annota quale usi.',
  ],
  personalSettingsToRecord: [
    'Altezza del sellino.',
    'Distanza del sellino dal manubrio.',
    'Altezza del manubrio.',
    'Livello di resistenza usato nel tratto facile e in quello sostenuto.',
    "Tipo di cyclette (verticale o reclinata) ed etichetta dell'attrezzo.",
  ],
  motorcyclePurpose:
    "Prepara il lavoro aerobico di base e aiuta a sostenere piu' turni nella stessa giornata con meno affaticamento generale. E' una finalita' della preparazione generale, non una garanzia sui tempi.",
};

// ---------------------------------------------------------------------------
// Varianti
// ---------------------------------------------------------------------------

const legPressVariants: readonly ExerciseVariant[] = [
  {
    id: 'feetHigh',
    name: 'Piedi alti sulla pedana',
    description:
      "Appoggio dei piedi nella parte alta della pedana: piu' glutei e posteriori, corsa piu' gestibile con poca mobilita' di caviglia.",
    separateHistory: true,
  },
  {
    id: 'feetWide',
    name: 'Piedi larghi, punte in fuori',
    description:
      "Appoggio piu' largo con punte aperte: piu' lavoro per adduttori e glutei rispetto alla posizione neutra.",
    separateHistory: true,
  },
];

const chestPressVariants: readonly ExerciseVariant[] = [
  {
    id: 'neutralGrip',
    name: 'Impugnatura neutra',
    description:
      "Presa coi palmi affrontati, se la macchina la offre: spesso piu' comoda per la spalla e con numeri diversi dalla presa prona.",
    separateHistory: true,
  },
  {
    id: 'higherSeat',
    name: "Sedile un foro piu' alto",
    description:
      "Spinta leggermente piu' obliqua verso l'alto: coinvolge di piu' le spalle e cambia il carico gestibile.",
    separateHistory: true,
  },
];

const seatedCableRowVariants: readonly ExerciseVariant[] = [
  {
    id: 'triangleHandle',
    name: 'Maniglia a triangolo',
    description: 'Presa neutra con maniglia a triangolo: la versione di riferimento del programma.',
    separateHistory: true,
  },
  {
    id: 'wideBarPronated',
    name: 'Barra larga, presa prona',
    description:
      "Presa larga con palmi verso il basso: piu' lavoro sulla parte alta della schiena, carichi tipicamente inferiori.",
    separateHistory: true,
  },
  {
    id: 'singleArm',
    name: 'Un braccio per volta',
    description:
      'Una maniglia sola, un lato alla volta: utile per pareggiare due lati diversi. Si registra per lato.',
    separateHistory: true,
  },
];

const legCurlVariants: readonly ExerciseVariant[] = [
  {
    id: 'seated',
    name: 'Leg curl seduto',
    description:
      "Versione seduta: piu' semplice da tenere fermi col bacino appoggiato, buon riferimento di partenza.",
    separateHistory: true,
  },
  {
    id: 'prone',
    name: "Leg curl a pancia in giu'",
    description:
      "Versione prona: richiede piu' attenzione al bacino che tende a staccarsi; la scala e' diversa da quella della versione seduta.",
    separateHistory: true,
  },
];

const pallofPressVariants: readonly ExerciseVariant[] = [
  {
    id: 'standingSplit',
    name: 'In piedi, passo affiancato',
    description: "La versione base del programma: la piu' stabile e la piu' semplice da dosare.",
    separateHistory: true,
  },
  {
    id: 'halfKneeling',
    name: 'In ginocchio su un ginocchio',
    description:
      "Posizione in ginocchio: riduce l'aiuto delle gambe e aumenta il lavoro del tronco, i carichi scendono.",
    separateHistory: true,
  },
  {
    id: 'timedHold',
    name: 'Tenuta a braccia distese',
    description:
      "Tenuta prolungata invece di piu' ripetizioni: utile quando il carico minimo della colonna e' gia' facile.",
    separateHistory: true,
  },
];

const farmerCarryVariants: readonly ExerciseVariant[] = [
  {
    id: 'twoDumbbells',
    name: 'Due manubri',
    description: 'La versione del programma: un manubrio per mano, cammino a passi normali.',
    separateHistory: true,
  },
  {
    id: 'suitcaseSingle',
    name: 'Un solo manubrio (valigia)',
    description:
      "Carico su un lato solo: aumenta molto il lavoro contro l'inclinazione laterale. Si registra per lato.",
    separateHistory: true,
  },
  {
    id: 'staticHold',
    name: 'Tenuta da fermo',
    description:
      "Stessi manubri tenuti in piedi senza camminare: utile quando non c'e' un percorso libero.",
    separateHistory: true,
  },
];

const romanianDeadliftVariants: readonly ExerciseVariant[] = [
  {
    id: 'twoDumbbells',
    name: 'Due manubri',
    description:
      "La versione del programma: un manubrio per mano lungo le gambe, senza arrivare a terra.",
    separateHistory: true,
  },
  {
    id: 'singleDumbbellTwoHands',
    name: 'Un manubrio a due mani',
    description:
      "Un solo manubrio tenuto con entrambe le mani: corsa piu' corta, utile per imparare a portare il bacino indietro.",
    separateHistory: true,
  },
];

const latPulldownVariants: readonly ExerciseVariant[] = [
  {
    id: 'widePronated',
    name: 'Presa prona larga',
    description: 'La versione del programma: barra larga tirata davanti al petto.',
    separateHistory: true,
  },
  {
    id: 'neutralVBar',
    name: 'Presa neutra, barra a V',
    description:
      "Palmi affrontati su barra a V: spesso piu' comoda per spalla e gomito, i carichi non coincidono con la presa larga.",
    separateHistory: true,
  },
  {
    id: 'closeSupinated',
    name: 'Presa supina stretta',
    description:
      "Presa stretta coi palmi verso di te: piu' lavoro delle braccia e corsa piu' breve, numeri diversi.",
    separateHistory: true,
  },
];

const stepUpVariants: readonly ExerciseVariant[] = [
  {
    id: 'lowStep',
    name: 'Gradino basso',
    description:
      "Altezza di ingresso prevista dal programma: consente la discesa controllata e l'appoggio della mano quando serve.",
    separateHistory: true,
  },
  {
    id: 'higherStep',
    name: "Gradino piu' alto",
    description:
      "Altezza maggiore: aumenta il lavoro e va introdotta solo con discesa controllata. Corsa diversa, quindi storico diverso.",
    separateHistory: true,
  },
  {
    id: 'withDumbbells',
    name: 'Con manubri lungo i fianchi',
    description:
      'Stessa altezza di gradino con sovraccarico: il peso si registra come kg aggiunti, quindi resta nello stesso storico.',
    separateHistory: false,
  },
];

const inclineDumbbellPressVariants: readonly ExerciseVariant[] = [
  {
    id: 'incline15',
    name: 'Inclinazione minima (circa 15 gradi)',
    description: "Inclinazione appena accennata: la versione piu' vicina alla panca piana.",
    separateHistory: true,
  },
  {
    id: 'incline30',
    name: 'Inclinazione media (circa 30 gradi)',
    description:
      "Inclinazione piu' marcata: piu' lavoro sulla parte alta del petto e sulle spalle, carichi tipicamente inferiori.",
    separateHistory: true,
  },
  {
    id: 'neutralGrip',
    name: 'Presa neutra',
    description:
      "Palmi affrontati per tutta la spinta: spesso piu' comoda per la spalla, i numeri non coincidono con la presa prona.",
    separateHistory: true,
  },
];

const adductorMachineVariants: readonly ExerciseVariant[] = [
  {
    id: 'narrowStart',
    name: 'Apertura di partenza ridotta',
    description: 'Ampiezza contenuta: la versione di ingresso adatta al rientro.',
    separateHistory: true,
  },
  {
    id: 'wideStart',
    name: 'Apertura di partenza ampia',
    description:
      "Ampiezza maggiore: piu' corsa e carichi inferiori, da usare solo quando il controllo e' stabile.",
    separateHistory: true,
  },
];

const sideplankVariants: readonly ExerciseVariant[] = [
  {
    id: 'kneesDown',
    name: 'Ginocchia appoggiate',
    description: "La versione del programma: leva piu' corta e tenute piu' gestibili.",
    separateHistory: true,
  },
  {
    id: 'legsExtended',
    name: 'Gambe distese',
    description:
      "Appoggio sui piedi con gambe distese: leva piu' lunga, tenute piu' brevi, non confrontabile con la versione a ginocchia appoggiate.",
    separateHistory: true,
  },
];

const hipThrustVariants: readonly ExerciseVariant[] = [
  {
    id: 'feetUnderHips',
    name: 'Piedi vicini al bacino',
    description: "Appoggio dei piedi piu' vicino al bacino: piu' lavoro per i glutei.",
    separateHistory: true,
  },
  {
    id: 'feetForward',
    name: "Piedi piu' avanti",
    description:
      "Appoggio dei piedi piu' avanti sulla pedana: piu' coinvolgimento dei posteriori della coscia.",
    separateHistory: true,
  },
];

const stationaryBikeVariants: readonly ExerciseVariant[] = [
  {
    id: 'warmupEasy',
    name: 'Riscaldamento facile (5 minuti)',
    description:
      "Pedalata facile di 5 minuti a inizio seduta, prevista dal riscaldamento del programma.",
    separateHistory: true,
  },
  {
    id: 'finalContinuous',
    name: 'Lavoro finale continuo',
    description:
      'Pedalata continua facile a fine seduta: 8-10 minuti nelle prime due settimane, poi gradualmente 12-15 minuti.',
    separateHistory: true,
  },
  {
    id: 'intervals15',
    name: 'Alternativa a intervalli (15 minuti)',
    description:
      '3 minuti facili, 6 cicli di 30 secondi sostenuti e 60 facili, 3 minuti facili. Prevista dalla settimana 7 solo nella seduta B e solo se scelta espressamente. I tratti sostenuti non sono sprint.',
    separateHistory: true,
  },
];

// ---------------------------------------------------------------------------
// Esercizi
// ---------------------------------------------------------------------------

export const EXERCISES: readonly Exercise[] = [
  {
    id: EXERCISE_IDS.legPress,
    name: 'Pressa per le gambe',
    shortName: 'Pressa',
    pattern: 'squat',
    equipment: ['legPressMachine'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 4,
    transitionSeconds: 60,
    guide: legPressGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.hipThrustMachine, EXERCISE_IDS.stepUp],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: legPressVariants,
  },
  {
    id: EXERCISE_IDS.chestPressMachine,
    name: 'Chest press alla macchina',
    shortName: 'Chest press',
    pattern: 'horizontalPush',
    equipment: ['chestPressMachine'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 4,
    transitionSeconds: 60,
    guide: chestPressGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.inclineDumbbellPress],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: chestPressVariants,
  },
  {
    id: EXERCISE_IDS.seatedCableRow,
    name: 'Rematore seduto al cavo',
    shortName: 'Rematore cavo',
    pattern: 'horizontalPull',
    equipment: ['cableColumn'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 3,
    transitionSeconds: 55,
    guide: seatedCableRowGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.latPulldownFront],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: seatedCableRowVariants,
  },
  {
    id: EXERCISE_IDS.legCurl,
    name: 'Leg curl',
    shortName: 'Leg curl',
    pattern: 'kneeFlexion',
    equipment: ['legCurlMachine'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 3.5,
    transitionSeconds: 55,
    guide: legCurlGuide,
    compatibleAlternativeIds: [
      EXERCISE_IDS.dumbbellRomanianDeadlift,
      EXERCISE_IDS.hipThrustMachine,
    ],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: legCurlVariants,
  },
  {
    id: EXERCISE_IDS.pallofPress,
    name: 'Pallof press al cavo',
    shortName: 'Pallof press',
    pattern: 'antiRotation',
    equipment: ['cableColumn'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: true,
    restAfterBothSides: false,
    secondsPerRep: 3,
    transitionSeconds: 60,
    guide: pallofPressGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.sideplankKneesDown],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: pallofPressVariants,
  },
  {
    id: EXERCISE_IDS.farmerCarry,
    name: 'Farmer carry con due manubri',
    shortName: 'Farmer carry',
    pattern: 'carry',
    equipment: ['dumbbells'],
    loadConvention: 'perDumbbell',
    metric: 'seconds',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 1,
    transitionSeconds: 45,
    guide: farmerCarryGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.sideplankKneesDown],
    defaultLoadStep: DUMBBELL_STEP,
    variants: farmerCarryVariants,
  },
  {
    id: EXERCISE_IDS.dumbbellRomanianDeadlift,
    name: 'Stacco rumeno con manubri',
    shortName: 'Stacco rumeno',
    pattern: 'hinge',
    equipment: ['dumbbells'],
    loadConvention: 'perDumbbell',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 4,
    transitionSeconds: 50,
    guide: romanianDeadliftGuide,
    // Alternativa gia' prevista dalla specifica §3.4, con storico separato.
    compatibleAlternativeIds: [EXERCISE_IDS.hipThrustMachine, EXERCISE_IDS.legCurl],
    defaultLoadStep: DUMBBELL_STEP,
    variants: romanianDeadliftVariants,
  },
  {
    id: EXERCISE_IDS.latPulldownFront,
    name: 'Lat machine davanti al petto',
    shortName: 'Lat machine',
    pattern: 'verticalPull',
    equipment: ['latMachine'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 3,
    transitionSeconds: 55,
    guide: latPulldownGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.seatedCableRow],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: latPulldownVariants,
  },
  {
    id: EXERCISE_IDS.stepUp,
    name: 'Step-up su gradino basso',
    shortName: 'Step-up',
    pattern: 'lunge',
    equipment: ['step', 'dumbbells'],
    loadConvention: 'bodyweightPlus',
    metric: 'reps',
    perSide: true,
    // Specifica §3.3: recupero di 90 s DOPO entrambe le gambe.
    restAfterBothSides: true,
    secondsPerRep: 3.5,
    transitionSeconds: 45,
    guide: stepUpGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.legPress],
    defaultLoadStep: BODYWEIGHT_PLUS_STEP,
    variants: stepUpVariants,
  },
  {
    id: EXERCISE_IDS.inclineDumbbellPress,
    name: 'Spinte con manubri su panca leggermente inclinata',
    shortName: 'Spinte inclinate',
    pattern: 'horizontalPush',
    equipment: ['inclineBench', 'dumbbells'],
    loadConvention: 'perDumbbell',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 4,
    transitionSeconds: 60,
    guide: inclineDumbbellPressGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.chestPressMachine],
    defaultLoadStep: DUMBBELL_STEP,
    variants: inclineDumbbellPressVariants,
  },
  {
    id: EXERCISE_IDS.adductorMachine,
    name: 'Macchina per gli adduttori',
    shortName: 'Adduttori',
    pattern: 'hipAdduction',
    equipment: ['adductorMachine'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 3,
    transitionSeconds: 50,
    guide: adductorMachineGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.legPress],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: adductorMachineVariants,
  },
  {
    id: EXERCISE_IDS.sideplankKneesDown,
    name: 'Plank laterale con ginocchia appoggiate',
    shortName: 'Plank laterale',
    pattern: 'antiLateralFlexion',
    equipment: ['bodyweightOnly'],
    loadConvention: 'timeOnly',
    metric: 'seconds',
    perSide: true,
    restAfterBothSides: false,
    secondsPerRep: 1,
    transitionSeconds: 40,
    guide: sideplankGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.pallofPress],
    defaultLoadStep: TIME_ONLY_STEP,
    variants: sideplankVariants,
  },
  {
    id: EXERCISE_IDS.hipThrustMachine,
    name: 'Hip thrust alla macchina',
    shortName: 'Hip thrust',
    pattern: 'hinge',
    equipment: ['hipThrustMachine'],
    loadConvention: 'machineStack',
    metric: 'reps',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 3.5,
    transitionSeconds: 70,
    guide: hipThrustGuide,
    compatibleAlternativeIds: [EXERCISE_IDS.dumbbellRomanianDeadlift, EXERCISE_IDS.legCurl],
    defaultLoadStep: MACHINE_STACK_STEP,
    variants: hipThrustVariants,
  },
  {
    id: EXERCISE_IDS.stationaryBike,
    name: 'Cyclette',
    shortName: 'Cyclette',
    pattern: 'cardio',
    equipment: ['stationaryBike'],
    loadConvention: 'timeOnly',
    metric: 'seconds',
    perSide: false,
    restAfterBothSides: false,
    secondsPerRep: 1,
    transitionSeconds: 60,
    guide: stationaryBikeGuide,
    compatibleAlternativeIds: [],
    defaultLoadStep: TIME_ONLY_STEP,
    variants: stationaryBikeVariants,
  },
];

/** Indice pronto all'uso della libreria completa. */
export const EXERCISE_LIBRARY: ExerciseLibrary = new ExerciseLibrary(EXERCISES);
