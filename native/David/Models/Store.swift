//  Store.swift
//  David — stato dell'app e persistenza locale (Codable su UserDefaults).
//  Gestisce: pattern settimanale A/B/C, sedute "fatte", spunte esercizi,
//  impostazioni (obiettivi peso, promemoria, aspetto), pesi manuali.
//  I dati restano SUL DISPOSITIVO. Nessun server.

import Foundation
import SwiftUI

enum AppearanceMode: String, CaseIterable, Codable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String {
        switch self {
        case .system: return "Automatico"
        case .light:  return "Chiaro"
        case .dark:   return "Scuro"
        }
    }
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light:  return .light
        case .dark:   return .dark
        }
    }
}

struct Settings: Codable {
    var schemaVersion = 1
    var startW: Double = 95
    var targetW: Double = 88
    var low: Double = 87
    var high: Double = 89
    var sessTime: Date = Store.time(18, 30)   // orario nuotata
    var remTime: Date = Store.time(21, 0)     // avviso la sera prima
    var reminderEnabled = false
    var appearance: AppearanceMode = .system
    var heightCm: Double = 0                  // 0 = non impostata
}

struct WeightEntry: Codable, Identifiable {
    var date: String   // ISO yyyy-MM-dd
    var kg: Double
    var id: String { date }
}

@MainActor
final class Store: ObservableObject {

    // Pattern: giorno-settimana (0=Lun … 6=Dom) -> tipo seduta.
    @Published var pattern: [Int: SessionType] { didSet { persist(\.pattern, key: .pattern) } }
    // Sedute fatte: dataISO -> tipo.
    @Published var done: [String: SessionType] { didSet { persist(\.done, key: .done) } }
    // Spunte esercizi: "dataISO_tipo" -> insieme di id esercizio.
    @Published var exChecks: [String: Set<String>] { didSet { persist(\.exChecks, key: .exChecks) } }
    // Pesi inseriti a mano (se non si usa Apple Salute come sorgente).
    @Published var weights: [WeightEntry] { didSet { persist(\.weights, key: .weights) } }
    @Published var settings: Settings { didSet { persist(\.settings, key: .settings) } }

    private enum Key: String {
        case pattern = "david.pattern"
        case done = "david.done"
        case exChecks = "david.exchecks"
        case weights = "david.weights"
        case settings = "david.settings"
    }

    private let defaults = UserDefaults.standard

    init() {
        let d = UserDefaults.standard
        pattern = Store.decode([Int: SessionType].self, d, "david.pattern") ?? [0: .A, 3: .B, 5: .C]
        done = Store.decode([String: SessionType].self, d, "david.done") ?? [:]
        exChecks = Store.decode([String: Set<String>].self, d, "david.exchecks") ?? [:]
        weights = Store.decode([WeightEntry].self, d, "david.weights") ?? []
        settings = Store.decode(Settings.self, d, "david.settings") ?? Settings()
    }

    // MARK: Persistenza

    private func persist<T: Encodable>(_ keyPath: KeyPath<Store, T>, key: Key) {
        if let data = try? JSONEncoder().encode(self[keyPath: keyPath]) {
            defaults.set(data, forKey: key.rawValue)
        }
    }
    private static func decode<T: Decodable>(_ type: T.Type, _ d: UserDefaults, _ key: String) -> T? {
        guard let data = d.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }

    static func time(_ h: Int, _ m: Int) -> Date {
        DateUtils.calendar.date(from: DateComponents(hour: h, minute: m)) ?? Date()
    }

    // MARK: Logica dominio

    func sessionType(for date: Date) -> SessionType? { pattern[DateUtils.weekdayMon(date)] }

    func isDone(_ date: Date) -> Bool { done[DateUtils.isoKey(date)] != nil }

    func toggleDone(_ date: Date, type: SessionType) {
        let k = DateUtils.isoKey(date)
        if done[k] == type { done.removeValue(forKey: k) } else { done[k] = type }
    }

    func setPattern(_ weekday: Int, _ type: SessionType?) {
        if let type { pattern[weekday] = type } else { pattern.removeValue(forKey: weekday) }
    }

    private func exKey(_ date: Date, _ type: SessionType) -> String {
        "\(DateUtils.isoKey(date))_\(type.rawValue)"
    }
    func isExChecked(_ date: Date, _ type: SessionType, _ exId: String) -> Bool {
        exChecks[exKey(date, type)]?.contains(exId) ?? false
    }
    func toggleEx(_ date: Date, _ type: SessionType, _ exId: String) {
        let k = exKey(date, type)
        var set = exChecks[k] ?? []
        if set.contains(exId) { set.remove(exId) } else { set.insert(exId) }
        exChecks[k] = set
    }

    // Conteggi settimanali
    func doneCount(weekOf monday: Date) -> Int {
        (0..<7).filter { done[DateUtils.isoKey(DateUtils.addDays(monday, $0))] != nil }.count
    }
    func plannedCount(weekOf monday: Date) -> Int {
        (0..<7).filter { pattern[DateUtils.weekdayMon(DateUtils.addDays(monday, $0))] != nil }.count
    }

    /// Settimane consecutive con ≥2 sedute (la corrente conta solo se già ≥2).
    func streakWeeks(now: Date = Date()) -> Int {
        var streak = 0
        let base = DateUtils.mondayOf(now)
        var i = 0
        while i < 520 {
            let cnt = doneCount(weekOf: DateUtils.addDays(base, -7 * i))
            if i == 0 {
                if cnt >= 2 { streak += 1 }
            } else {
                if cnt >= 2 { streak += 1 } else { break }
            }
            i += 1
        }
        return streak
    }

    /// Aderenza %: fatte / pianificate nelle ultime 4 settimane (28 giorni).
    func adherence(now: Date = Date()) -> Int {
        let t = DateUtils.startOfDay(now)
        var planned = 0, doneN = 0
        for i in 0..<28 {
            let d = DateUtils.addDays(t, -i)
            if pattern[DateUtils.weekdayMon(d)] != nil { planned += 1 }
            if done[DateUtils.isoKey(d)] != nil { doneN += 1 }
        }
        guard planned > 0 else { return 0 }
        return min(100, Int((Double(doneN) / Double(planned) * 100).rounded()))
    }

    // Peso
    var currentWeight: Double { weights.last?.kg ?? settings.startW }

    func addWeight(_ kg: Double, on date: Date = Date()) {
        let k = DateUtils.isoKey(date)
        if let idx = weights.firstIndex(where: { $0.date == k }) {
            weights[idx].kg = kg
        } else {
            weights.append(WeightEntry(date: k, kg: kg))
        }
        weights.sort { $0.date < $1.date }
    }

    // Backup
    func exportJSON() -> Data? {
        let dump = Backup(settings: settings, pattern: pattern, done: done, exChecks: exChecks, weights: weights)
        return try? JSONEncoder().encode(dump)
    }
    func importJSON(_ data: Data) -> Bool {
        guard let b = try? JSONDecoder().decode(Backup.self, from: data) else { return false }
        settings = b.settings; pattern = b.pattern; done = b.done
        exChecks = b.exChecks; weights = b.weights.sorted { $0.date < $1.date }
        return true
    }
    func reset() {
        pattern = [0: .A, 3: .B, 5: .C]; done = [:]; exChecks = [:]; weights = []; settings = Settings()
    }

    struct Backup: Codable {
        var settings: Settings
        var pattern: [Int: SessionType]
        var done: [String: SessionType]
        var exChecks: [String: Set<String>]
        var weights: [WeightEntry]
    }
}
