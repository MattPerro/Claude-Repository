//  StoreLogicTests.swift
//  Verifica la logica di dominio dello Store (streak, aderenza, pesi, backup).

import XCTest
@testable import David

@MainActor
final class StoreLogicTests: XCTestCase {

    private func makeStore() -> Store {
        let suite = "test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        defaults.removePersistentDomain(forName: suite)
        return Store(defaults: defaults)
    }

    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        DateUtils.calendar.date(from: DateComponents(year: y, month: m, day: d))!
    }

    func testDefaultsPattern() {
        let s = makeStore()
        XCTAssertEqual(s.pattern[0], .A)
        XCTAssertEqual(s.pattern[3], .B)
        XCTAssertEqual(s.pattern[5], .C)
    }

    func testSetPatternAndRest() {
        let s = makeStore()
        s.setPattern(1, .C)
        XCTAssertEqual(s.pattern[1], .C)
        s.setPattern(1, nil) // riposo
        XCTAssertNil(s.pattern[1])
    }

    func testToggleDone() {
        let s = makeStore()
        let d = date(2026, 1, 5)
        XCTAssertFalse(s.isDone(d))
        s.toggleDone(d, type: .A)
        XCTAssertTrue(s.isDone(d))
        s.toggleDone(d, type: .A)
        XCTAssertFalse(s.isDone(d))
    }

    func testAddWeightDedupAndSort() {
        let s = makeStore()
        s.addWeight(92.0, on: date(2026, 1, 6))
        s.addWeight(93.0, on: date(2026, 1, 5))
        s.addWeight(91.5, on: date(2026, 1, 6)) // stesso giorno → sostituisce
        XCTAssertEqual(s.weights.count, 2)
        XCTAssertEqual(s.weights.first?.date, "2026-01-05")   // ordinato
        XCTAssertEqual(s.weights.last?.kg, 91.5)              // sostituito
    }

    func testDoneAndPlannedCount() {
        let s = makeStore()                 // pattern default: Lun/Gio/Sab
        let monday = date(2026, 1, 5)
        XCTAssertEqual(s.plannedCount(weekOf: monday), 3)
        s.toggleDone(date(2026, 1, 5), type: .A) // lun
        s.toggleDone(date(2026, 1, 8), type: .B) // gio
        XCTAssertEqual(s.doneCount(weekOf: monday), 2)
    }

    func testStreakTwoConsecutiveWeeks() {
        let s = makeStore()
        // settimana corrente (now = mer 2026-01-07): lun+mar fatti
        s.toggleDone(date(2026, 1, 5), type: .A)
        s.toggleDone(date(2026, 1, 6), type: .A)
        // settimana precedente: 2 fatti
        s.toggleDone(date(2025, 12, 29), type: .A)
        s.toggleDone(date(2025, 12, 30), type: .A)
        XCTAssertEqual(s.streakWeeks(now: date(2026, 1, 7)), 2)
    }

    func testStreakCurrentWeekUnderTwo() {
        let s = makeStore()
        // solo 1 fatto nella settimana corrente → non conta
        s.toggleDone(date(2026, 1, 5), type: .A)
        XCTAssertEqual(s.streakWeeks(now: date(2026, 1, 7)), 0)
    }

    func testAdherenceEmpty() {
        let s = makeStore()
        s.pattern = [:]                    // nessuna pianificazione
        XCTAssertEqual(s.adherence(now: date(2026, 1, 7)), 0)
    }

    func testBackupRoundtrip() {
        let s = makeStore()
        s.addWeight(90.0, on: date(2026, 1, 5))
        s.toggleDone(date(2026, 1, 5), type: .A)
        s.settings.targetW = 86
        guard let data = s.exportJSON() else { return XCTFail("export nil") }

        s.reset()
        XCTAssertTrue(s.weights.isEmpty)

        XCTAssertTrue(s.importJSON(data))
        XCTAssertEqual(s.weights.first?.kg, 90.0)
        XCTAssertEqual(s.settings.targetW, 86)
        XCTAssertTrue(s.isDone(date(2026, 1, 5)))
    }
}
