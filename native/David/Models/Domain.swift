//  Domain.swift
//  David — dominio di allenamento (portato dalla web-app "ponte").
//  Contiene: catalogo esercizi, sedute A/B/C, regole di SICUREZZA SCHIENA
//  (ernie lombari) e le utility su date/logica (streak, aderenza).
//
//  Tutto a corpo libero / in acqua senza attrezzi. Sessioni 45–60'.

import Foundation

// MARK: - Tipi base

enum SessionType: String, CaseIterable, Codable, Identifiable {
    case A, B, C
    var id: String { rawValue }
    var label: String {
        switch self {
        case .A: return "Sessione A"
        case .B: return "Sessione B"
        case .C: return "Sessione C"
        }
    }
}

enum ExerciseView: String, Codable { case water, dry }   // vista nuoto / a secco

struct Cue: Identifiable {
    let id = UUID()
    let text: String
    var contra: Bool = false   // true = controindicazione (mostrata in rosso con ✗)
}

struct Exercise: Identifiable {
    let id: String
    let name: String
    let view: ExerciseView
    let hernia: Bool           // richiede avviso schiena
    let cues: [Cue]
    var equipment: String { "Nessuna" }
    /// SF Symbol indicativo per una guida visiva pulita e nativa.
    var symbol: String {
        switch view {
        case .water: return "figure.pool.swim"
        case .dry:   return "figure.cooldown"
        }
    }
}

struct SessionItem: Identifiable {
    let id: String             // id stabile per le spunte (per data+tipo)
    let ref: String            // riferimento al catalogo esercizi
    let schema: String
}

struct SessionBlock: Identifiable {
    let id = UUID()
    let title: String
    let items: [SessionItem]
}

struct Session: Identifiable {
    let type: SessionType
    let name: String
    let duration: String
    let focus: String
    let blocks: [SessionBlock]
    var id: String { type.rawValue }
    var allItems: [SessionItem] { blocks.flatMap { $0.items } }
}

// MARK: - Catalogo esercizi (Appendice A)

enum Catalog {

    static let exercises: [String: Exercise] = [
        "spalle": Exercise(id: "spalle", name: "Rotazioni delle spalle", view: .dry, hernia: false, cues: [
            Cue(text: "Cerchi ampi e lenti, avanti e indietro"),
            Cue(text: "Spalle lontane dalle orecchie"),
            Cue(text: "Respira, non irrigidirti")
        ]),
        "chintuck": Exercise(id: "chintuck", name: "Chin Tuck", view: .dry, hernia: false, cues: [
            Cue(text: "Testa indietro, mento in dentro (doppio mento)"),
            Cue(text: "Allunga la nuca verso l'alto"),
            Cue(text: "Tieni 2″, poi rilascia")
        ]),
        "torace": Exercise(id: "torace", name: "Apertura del torace a parete", view: .dry, hernia: false, cues: [
            Cue(text: "Avambraccio a parete, ruota il busto opposto"),
            Cue(text: "Spalla bassa e lontana dall'orecchio"),
            Cue(text: "Respiro lungo, senza forzare")
        ]),
        "catcow": Exercise(id: "catcow", name: "Cat-Cow", view: .dry, hernia: false, cues: [
            Cue(text: "Inspira inarcando dolce, espira arrotondando"),
            Cue(text: "Il movimento parte dalla pelvi"),
            Cue(text: "Ampiezza comoda, mai forzare")
        ]),
        "streamline": Exercise(id: "streamline", name: "Galleggiamento & streamline", view: .water, hernia: false, cues: [
            Cue(text: "Corpo come una linea unica"),
            Cue(text: "Pancia attiva, collo neutro"),
            Cue(text: "Niente schiena spezzata")
        ]),
        "sculling": Exercise(id: "sculling", name: "Sculling", view: .water, hernia: false, cues: [
            Cue(text: "Avambracci a \"otto\", figure morbide"),
            Cue(text: "Gomiti alti e fermi"),
            Cue(text: "Senti l'appoggio sull'acqua")
        ]),
        "gambe": Exercise(id: "gambe", name: "Battuta di gambe (senza tavoletta)", view: .water, hernia: false, cues: [
            Cue(text: "Movimento piccolo dall'anca"),
            Cue(text: "Caviglie morbide"),
            Cue(text: "Bacino stabile, core in isometria")
        ]),
        "verticalkick": Exercise(id: "verticalkick", name: "Vertical kicking", view: .water, hernia: false, cues: [
            Cue(text: "Assetto verticale, braccia incrociate al petto"),
            Cue(text: "Gambe continue e regolari"),
            Cue(text: "Addome attivo, intervalli brevi")
        ]),
        "dorso": Exercise(id: "dorso", name: "Dorso", view: .water, hernia: true, cues: [
            Cue(text: "Corpo lungo, fianchi alti"),
            Cue(text: "Spalle libere, scapole \"giù\""),
            Cue(text: "Testa ferma, sguardo in alto"),
            Cue(text: "Non inarcare la schiena per galleggiare", contra: true)
        ]),
        "crawl": Exercise(id: "crawl", name: "Crawl", view: .water, hernia: true, cues: [
            Cue(text: "Rollio dal bacino, bracciata lunga"),
            Cue(text: "Respira di lato ruotando la testa"),
            Cue(text: "Gambe leggere e continue"),
            Cue(text: "Niente farfalla: carica la zona lombare", contra: true)
        ])
    ]

    static func exercise(_ id: String) -> Exercise {
        exercises[id] ?? Exercise(id: id, name: id, view: .water, hernia: false, cues: [])
    }

    // Movimenti VIETATI (mostrati come "da evitare", non come esercizi).
    static let forbidden: [String] = [
        "Farfalla",
        "Rana \"spinta\" / a delfino aggressiva",
        "Sit-up / crunch",
        "Qualsiasi flessione lombare sotto carico",
        "Tuffi e virate spinte"
    ]

    // MARK: - Le 3 sedute (Appendice B)

    static let sessions: [SessionType: Session] = [
        .A: Session(type: .A, name: "Tecnica & postura", duration: "~50′",
                    focus: "Dorso, drill e allineamento: il correttivo posturale n°1.",
                    blocks: [
                        SessionBlock(title: "Riscaldamento a secco", items: [
                            SessionItem(id: "a1", ref: "spalle", schema: "2′ avanti/indietro"),
                            SessionItem(id: "a2", ref: "chintuck", schema: "10 rip. lente"),
                            SessionItem(id: "a3", ref: "torace", schema: "30″ ×2 per lato"),
                            SessionItem(id: "a4", ref: "catcow", schema: "8 rip. lente")
                        ]),
                        SessionBlock(title: "In acqua", items: [
                            SessionItem(id: "a5", ref: "streamline", schema: "6×15 m (rec 20″)"),
                            SessionItem(id: "a6", ref: "dorso", schema: "8×50 m tecnico (rec 25″)"),
                            SessionItem(id: "a7", ref: "sculling", schema: "4×25 m"),
                            SessionItem(id: "a8", ref: "crawl", schema: "6×50 m sciolto (rec 20″)"),
                            SessionItem(id: "a9", ref: "dorso", schema: "100–150 m defaticamento")
                        ])
                    ]),
        .B: Session(type: .B, name: "Resistenza & cardio", duration: "~55′",
                    focus: "Crawl continuo: il motore aerobico che intacca il grasso.",
                    blocks: [
                        SessionBlock(title: "Riscaldamento a secco breve", items: [
                            SessionItem(id: "b1", ref: "spalle", schema: "90″"),
                            SessionItem(id: "b2", ref: "chintuck", schema: "8 rip."),
                            SessionItem(id: "b3", ref: "catcow", schema: "6 rip.")
                        ]),
                        SessionBlock(title: "In acqua", items: [
                            SessionItem(id: "b4", ref: "crawl", schema: "200 m riscaldamento"),
                            SessionItem(id: "b5", ref: "crawl", schema: "8–10×50 m a ritmo (rec 15–20″)"),
                            SessionItem(id: "b6", ref: "dorso", schema: "4×50 m di scarico"),
                            SessionItem(id: "b7", ref: "gambe", schema: "6×25 m"),
                            SessionItem(id: "b8", ref: "crawl", schema: "150–200 m defaticamento")
                        ])
                    ]),
        .C: Session(type: .C, name: "Misto leggero / recupero", duration: "~40′",
                    focus: "Recupero attivo a bassa intensità (opzionale).",
                    blocks: [
                        SessionBlock(title: "In acqua", items: [
                            SessionItem(id: "c1", ref: "streamline", schema: "4×15 m"),
                            SessionItem(id: "c2", ref: "dorso", schema: "6×50 m facile"),
                            SessionItem(id: "c3", ref: "verticalkick", schema: "4×20″ (rec 40″)"),
                            SessionItem(id: "c4", ref: "crawl", schema: "4×50 m rilassato"),
                            SessionItem(id: "c5", ref: "streamline", schema: "5 min galleggiamento & respirazione")
                        ]),
                        SessionBlock(title: "Mobilità a secco", items: [
                            SessionItem(id: "c6", ref: "catcow", schema: "8 rip."),
                            SessionItem(id: "c7", ref: "torace", schema: "30″ ×2 per lato")
                        ])
                    ])
    ]

    static func session(_ t: SessionType) -> Session { sessions[t]! }
}

// MARK: - Utility su date (settimana da lunedì, DST-safe via Calendar)

enum DateUtils {
    static var calendar: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.firstWeekday = 2   // lunedì
        return c
    }

    static let giorni = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
    static let giorniLong = ["Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"]

    /// 0 = lunedì … 6 = domenica
    static func weekdayMon(_ date: Date) -> Int {
        let wd = calendar.component(.weekday, from: date) // 1=dom … 7=sab
        return (wd + 5) % 7
    }

    static func startOfDay(_ date: Date) -> Date { calendar.startOfDay(for: date) }

    static func addDays(_ date: Date, _ n: Int) -> Date {
        calendar.date(byAdding: .day, value: n, to: date)!
    }

    static func mondayOf(_ date: Date) -> Date {
        addDays(startOfDay(date), -weekdayMon(date))
    }

    static func isoKey(_ date: Date) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year!, c.month!, c.day!)
    }

    static func sameDay(_ a: Date, _ b: Date) -> Bool {
        calendar.isDate(a, inSameDayAs: b)
    }
}
