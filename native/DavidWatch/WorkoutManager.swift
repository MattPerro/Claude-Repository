//  WorkoutManager.swift
//  David (Watch) — gestisce la sessione di allenamento "Nuoto in piscina".

import Foundation
import HealthKit

@MainActor
final class WorkoutManager: NSObject, ObservableObject {

    private let healthStore = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?

    @Published var isRunning = false
    @Published var elapsed: TimeInterval = 0
    @Published var distance: Double = 0     // metri
    @Published var heartRate: Double = 0    // bpm
    @Published var lastError: String?

    // MARK: Autorizzazione

    func requestAuthorization() async {
        guard HKHealthStore.isHealthDataAvailable() else {
            lastError = "Salute non disponibile."; return
        }
        let share: Set<HKSampleType> = [
            HKQuantityType.workoutType(),
            HKQuantityType(.distanceSwimming),
            HKQuantityType(.activeEnergyBurned),
            HKQuantityType(.heartRate)
        ]
        let read: Set<HKObjectType> = [
            HKQuantityType(.distanceSwimming),
            HKQuantityType(.heartRate),
            HKQuantityType(.activeEnergyBurned)
        ]
        do { try await healthStore.requestAuthorization(toShare: share, read: read) }
        catch { lastError = error.localizedDescription }
    }

    // MARK: Avvio / stop

    func start(poolLength: Double = 25) {
        let config = HKWorkoutConfiguration()
        config.activityType = .swimming
        config.swimmingLocationType = .pool
        config.lapLength = HKQuantity(unit: .meter(), doubleValue: poolLength)
        do {
            let session = try HKWorkoutSession(healthStore: healthStore, configuration: config)
            let builder = session.associatedWorkoutBuilder()
            builder.dataSource = HKLiveWorkoutDataSource(healthStore: healthStore, workoutConfiguration: config)
            session.delegate = self
            builder.delegate = self
            self.session = session
            self.builder = builder

            let start = Date()
            session.startActivity(with: start)
            builder.beginCollection(withStart: start) { _, _ in }
            isRunning = true
        } catch {
            lastError = error.localizedDescription
        }
    }

    func stop() {
        session?.end()
    }
}

// MARK: - Delegati (nonisolated: le callback arrivano fuori dal main-actor)

extension WorkoutManager: HKWorkoutSessionDelegate {
    nonisolated func workoutSession(_ session: HKWorkoutSession,
                                    didChangeTo toState: HKWorkoutSessionState,
                                    from fromState: HKWorkoutSessionState,
                                    date: Date) {
        guard toState == .ended else { return }
        Task { @MainActor in
            self.builder?.endCollection(withEnd: date) { _, _ in
                self.builder?.finishWorkout { _, _ in }
            }
            self.isRunning = false
        }
    }

    nonisolated func workoutSession(_ session: HKWorkoutSession, didFailWithError error: Error) {
        Task { @MainActor in self.lastError = error.localizedDescription }
    }
}

extension WorkoutManager: HKLiveWorkoutBuilderDelegate {
    nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

    nonisolated func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder,
                                    didCollectDataOf collectedTypes: Set<HKSampleType>) {
        Task { @MainActor in
            for type in collectedTypes {
                guard let q = type as? HKQuantityType, let stats = workoutBuilder.statistics(for: q) else { continue }
                if q == HKQuantityType(.distanceSwimming) {
                    self.distance = stats.sumQuantity()?.doubleValue(for: .meter()) ?? self.distance
                } else if q == HKQuantityType(.heartRate) {
                    let unit = HKUnit.count().unitDivided(by: .minute())
                    self.heartRate = stats.mostRecentQuantity()?.doubleValue(for: unit) ?? self.heartRate
                }
            }
            self.elapsed = workoutBuilder.elapsedTime
        }
    }
}
