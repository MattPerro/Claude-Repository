//  SwimMathTests.swift
//  Verifica i calcoli derivati di una nuotata (passo/100m e SWOLF ricalcolato).

import XCTest
@testable import David

final class SwimMathTests: XCTestCase {

    private func swim(distance: Double, duration: TimeInterval, strokes: Double,
                      laps: Int, poolLength: Double) -> SwimWorkout {
        SwimWorkout(id: UUID(), date: Date(), duration: duration, distance: distance,
                    strokeCount: strokes, activeEnergy: 0, avgHeartRate: 0,
                    laps: laps, poolLength: poolLength)
    }

    func testPace100() {
        let s = swim(distance: 500, duration: 600, strokes: 400, laps: 20, poolLength: 25)
        XCTAssertEqual(s.pace100, 120, accuracy: 0.001) // 600s / 500m * 100
    }

    func testPace100ZeroDistance() {
        let s = swim(distance: 0, duration: 600, strokes: 0, laps: 0, poolLength: 0)
        XCTAssertEqual(s.pace100, 0)
    }

    func testSwolfWithLaps() {
        // 20 vasche, 600s, 400 bracciate → 30 s/vasca + 20 br/vasca = 50
        let s = swim(distance: 500, duration: 600, strokes: 400, laps: 20, poolLength: 25)
        XCTAssertEqual(s.swolf, 50)
    }

    func testSwolfFromPoolLengthWhenNoLaps() {
        // niente lap ma poolLength nota → lengths = 500/25 = 20 → stesso risultato
        let s = swim(distance: 500, duration: 600, strokes: 400, laps: 0, poolLength: 25)
        XCTAssertEqual(s.swolf, 50)
    }

    func testSwolfNilWhenUnknown() {
        let s = swim(distance: 500, duration: 600, strokes: 400, laps: 0, poolLength: 0)
        XCTAssertNil(s.swolf)
    }
}
