//  HealthKitManager.swift
//  David — lettura delle nuotate in piscina e di peso/altezza da Apple Salute,
//  e scrittura (facoltativa) di peso/altezza inseriti a mano.
//
//  MVP "sola lettura": l'utente nuota con l'app Allenamento integrata del Watch
//  (modalità "Nuoto in piscina"); qui leggiamo i workout risultanti da HealthKit.
//  SWOLF e passo/100 m NON sono esposti da Apple → li RICALCOLIAMO dai dati grezzi.

import Foundation
import HealthKit

/// Riepilogo di una nuotata, pronto per l'interfaccia.
struct SwimWorkout: Identifiable {
    let id: UUID
    let date: Date
    let duration: TimeInterval          // secondi
    let distance: Double                // metri
    let strokeCount: Double             // bracciate totali
    let activeEnergy: Double            // kcal
    let avgHeartRate: Double            // bpm (0 se non disponibile)
    let laps: Int                       // n. vasche/segmenti (0 se non disponibile)
    let poolLength: Double              // metri per vasca (0 se sconosciuta)

    /// Passo per 100 m (secondi). 0 se distanza nulla.
    var pace100: Double { distance > 0 ? duration / distance * 100 : 0 }

    /// SWOLF ricalcolato ≈ (secondi per vasca) + (bracciate per vasca).
    /// Se non conosciamo le vasche, stimiamo dai metri e dalla lunghezza vasca.
    var swolf: Int? {
        let lengths: Double
        if laps > 0 { lengths = Double(laps) }
        else if poolLength > 0, distance > 0 { lengths = distance / poolLength }
        else { return nil }
        guard lengths > 0 else { return nil }
        let secPerLap = duration / lengths
        let strokesPerLap = strokeCount / lengths
        return Int((secPerLap + strokesPerLap).rounded())
    }
}

@MainActor
final class HealthKitManager: ObservableObject {

    let store = HKHealthStore()

    @Published var authorized = false
    @Published var swims: [SwimWorkout] = []
    @Published var bodyMassKg: Double? = nil
    @Published var heightCm: Double? = nil
    @Published var lastError: String? = nil

    static var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    private var readTypes: Set<HKObjectType> {
        var s: Set<HKObjectType> = [HKObjectType.workoutType()]
        if let m = HKObjectType.quantityType(forIdentifier: .bodyMass) { s.insert(m) }
        if let h = HKObjectType.quantityType(forIdentifier: .height) { s.insert(h) }
        if let hr = HKObjectType.quantityType(forIdentifier: .heartRate) { s.insert(hr) }
        if let d = HKObjectType.quantityType(forIdentifier: .distanceSwimming) { s.insert(d) }
        if let st = HKObjectType.quantityType(forIdentifier: .swimmingStrokeCount) { s.insert(st) }
        if let e = HKObjectType.quantityType(forIdentifier: .activeEnergyBurned) { s.insert(e) }
        return s
    }
    private var writeTypes: Set<HKSampleType> {
        var s: Set<HKSampleType> = []
        if let m = HKObjectType.quantityType(forIdentifier: .bodyMass) { s.insert(m) }
        if let h = HKObjectType.quantityType(forIdentifier: .height) { s.insert(h) }
        return s
    }

    func requestAuthorization() async {
        guard Self.isAvailable else { lastError = "Apple Salute non è disponibile su questo dispositivo."; return }
        do {
            try await store.requestAuthorization(toShare: writeTypes, read: readTypes)
            authorized = true
            await refreshAll()
        } catch {
            lastError = error.localizedDescription
        }
    }

    func refreshAll() async {
        await fetchSwims()
        await fetchBody()
    }

    // MARK: Nuotate

    func fetchSwims(limit: Int = 50) async {
        let type = HKObjectType.workoutType()
        let predicate = HKQuery.predicateForWorkouts(with: .swimming)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        let workouts: [HKWorkout] = await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: type, predicate: predicate, limit: limit, sortDescriptors: [sort]) { _, samples, error in
                if let error { Task { @MainActor in self.lastError = error.localizedDescription } }
                cont.resume(returning: (samples as? [HKWorkout]) ?? [])
            }
            store.execute(q)
        }

        var result: [SwimWorkout] = []
        for w in workouts {
            let distance = w.totalDistance?.doubleValue(for: .meter()) ?? 0
            let energy = w.totalEnergyBurned?.doubleValue(for: .kilocalorie()) ?? 0
            let strokes = await sumQuantity(.swimmingStrokeCount, unit: .count(), workout: w)
            let hr = await averageHeartRate(workout: w)
            let laps = w.workoutEvents?.filter { $0.type == .lap || $0.type == .segment }.count ?? 0
            let poolLen = (w.metadata?[HKMetadataKeyLapLength] as? HKQuantity)?.doubleValue(for: .meter()) ?? 0
            result.append(SwimWorkout(
                id: w.uuid, date: w.startDate, duration: w.duration,
                distance: distance, strokeCount: strokes, activeEnergy: energy,
                avgHeartRate: hr, laps: laps, poolLength: poolLen))
        }
        swims = result
    }

    private func sumQuantity(_ id: HKQuantityTypeIdentifier, unit: HKUnit, workout: HKWorkout) async -> Double {
        guard let qType = HKObjectType.quantityType(forIdentifier: id) else { return 0 }
        let predicate = HKQuery.predicateForObjects(from: workout)
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: qType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, stats, _ in
                cont.resume(returning: stats?.sumQuantity()?.doubleValue(for: unit) ?? 0)
            }
            store.execute(q)
        }
    }

    private func averageHeartRate(workout: HKWorkout) async -> Double {
        guard let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) else { return 0 }
        let predicate = HKQuery.predicateForObjects(from: workout)
        let unit = HKUnit.count().unitDivided(by: .minute())
        return await withCheckedContinuation { cont in
            let q = HKStatisticsQuery(quantityType: hrType, quantitySamplePredicate: predicate, options: .discreteAverage) { _, stats, _ in
                cont.resume(returning: stats?.averageQuantity()?.doubleValue(for: unit) ?? 0)
            }
            store.execute(q)
        }
    }

    // MARK: Peso / Altezza

    func fetchBody() async {
        bodyMassKg = await latest(.bodyMass, unit: .gramUnit(with: .kilo))
        heightCm = await latest(.height, unit: .meterUnit(with: .centi))
    }

    private func latest(_ id: HKQuantityTypeIdentifier, unit: HKUnit) async -> Double? {
        guard let qType = HKObjectType.quantityType(forIdentifier: id) else { return nil }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        return await withCheckedContinuation { cont in
            let q = HKSampleQuery(sampleType: qType, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
                let v = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
                cont.resume(returning: v)
            }
            store.execute(q)
        }
    }

    func saveBodyMass(_ kg: Double) async {
        await save(.bodyMass, value: kg, unit: .gramUnit(with: .kilo))
        await fetchBody()
    }
    func saveHeight(_ cm: Double) async {
        await save(.height, value: cm, unit: .meterUnit(with: .centi))
        await fetchBody()
    }

    private func save(_ id: HKQuantityTypeIdentifier, value: Double, unit: HKUnit) async {
        guard let qType = HKObjectType.quantityType(forIdentifier: id) else { return }
        let sample = HKQuantitySample(type: qType, quantity: HKQuantity(unit: unit, doubleValue: value), start: Date(), end: Date())
        do { try await store.save(sample) }
        catch { lastError = error.localizedDescription }
    }
}
