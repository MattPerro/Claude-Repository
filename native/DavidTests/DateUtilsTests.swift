//  DateUtilsTests.swift
//  Verifica le utility di data (settimana da lunedì, DST-safe).

import XCTest
@testable import David

final class DateUtilsTests: XCTestCase {

    private func date(_ y: Int, _ m: Int, _ d: Int) -> Date {
        DateUtils.calendar.date(from: DateComponents(year: y, month: m, day: d))!
    }

    func testWeekdayMon() {
        // 2026-01-05 è un lunedì, 2026-01-11 è domenica.
        XCTAssertEqual(DateUtils.weekdayMon(date(2026, 1, 5)), 0)
        XCTAssertEqual(DateUtils.weekdayMon(date(2026, 1, 7)), 2) // mercoledì
        XCTAssertEqual(DateUtils.weekdayMon(date(2026, 1, 11)), 6)
    }

    func testMondayOf() {
        XCTAssertEqual(DateUtils.isoKey(DateUtils.mondayOf(date(2026, 1, 7))), "2026-01-05")
        XCTAssertEqual(DateUtils.isoKey(DateUtils.mondayOf(date(2026, 1, 5))), "2026-01-05")
        XCTAssertEqual(DateUtils.isoKey(DateUtils.mondayOf(date(2026, 1, 11))), "2026-01-05")
    }

    func testAddDaysAndIso() {
        XCTAssertEqual(DateUtils.isoKey(DateUtils.addDays(date(2026, 1, 31), 1)), "2026-02-01")
        XCTAssertEqual(DateUtils.isoKey(DateUtils.addDays(date(2026, 3, 1), -1)), "2026-02-28")
        XCTAssertEqual(DateUtils.isoKey(date(2026, 7, 4)), "2026-07-04")
    }
}
