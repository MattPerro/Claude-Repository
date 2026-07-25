//  ProgressDashboardView.swift
//  David — "Progressi": peso attuale, grafico verso l'obiettivo (fascia 87–89,
//  linea a 88), inserimento peso (salvato anche in Apple Salute), aderenza/streak.

import SwiftUI
import Charts

struct ProgressDashboardView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var health: HealthKitManager

    @State private var weightInput = ""

    /// Peso corrente: preferisce Apple Salute, altrimenti l'ultimo inserito.
    private var current: Double { health.bodyMassKg ?? store.currentWeight }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Peso attuale").font(.caption).bold().foregroundStyle(.secondary)
                        Text("\(current, specifier: "%.1f") kg").font(.system(size: 40, weight: .semibold)).monospacedDigit()
                        Text(deltaText).font(.subheadline).bold()
                            .foregroundStyle(current - store.targetWSafe > 0 ? Color(red: 0.55, green: 0.38, blue: 0.22) : .green)
                    }
                    HStack {
                        TextField("Aggiungi peso di oggi", text: $weightInput)
                            .keyboardType(.decimalPad)
                            .textFieldStyle(.roundedBorder)
                        Button("Salva") { saveWeight() }
                            .buttonStyle(.borderedProminent)
                            .disabled(Double(weightInput.replacingOccurrences(of: ",", with: ".")) == nil)
                    }
                }

                Section("Andamento peso · obiettivo 87–89") {
                    chart.frame(height: 220)
                }

                Section {
                    HStack(spacing: 10) {
                        StatTile(value: "\(store.adherence())%", label: "aderenza (4 sett.)")
                        StatTile(value: "\(store.streakWeeks())", label: "settimane di fila")
                    }
                    .listRowInsets(EdgeInsets()).listRowBackground(Color.clear)
                }
            }
            .navigationTitle("Progressi")
        }
    }

    private var deltaText: String {
        let d = current - store.settings.targetW
        if abs(d) < 0.05 { return "obiettivo raggiunto" }
        return d > 0 ? "+\(String(format: "%.1f", d)) kg dall'obiettivo"
                     : "\(String(format: "%.1f", d)) kg (sotto 88)"
    }

    private var series: [WeightEntry] {
        var s = store.weights
        // include il peso letto da Salute come punto "oggi" se assente
        if let hk = health.bodyMassKg {
            let today = DateUtils.isoKey(Date())
            if !s.contains(where: { $0.date == today }) { s.append(WeightEntry(date: today, kg: hk)) }
        }
        if s.isEmpty { s = [WeightEntry(date: DateUtils.isoKey(Date()), kg: store.settings.startW)] }
        return s.sorted { $0.date < $1.date }
    }

    private var chart: some View {
        Chart {
            // Fascia obiettivo 87–89: due linee tenui ai bordi.
            RuleMark(y: .value("low", store.settings.low))
                .lineStyle(StrokeStyle(lineWidth: 1))
                .foregroundStyle(.green.opacity(0.35))
            RuleMark(y: .value("high", store.settings.high))
                .lineStyle(StrokeStyle(lineWidth: 1))
                .foregroundStyle(.green.opacity(0.35))
            // Linea obiettivo 88 (tratteggiata).
            RuleMark(y: .value("obiettivo", store.settings.targetW))
                .lineStyle(StrokeStyle(lineWidth: 1.5, dash: [5, 4]))
                .foregroundStyle(.green)
                .annotation(position: .top, alignment: .trailing) { Text("88").font(.caption2).foregroundStyle(.green) }
            ForEach(series) { e in
                LineMark(x: .value("data", e.date), y: .value("kg", e.kg))
                    .foregroundStyle(Color(red: 0.55, green: 0.38, blue: 0.22))
                    .interpolationMethod(.monotone)
                PointMark(x: .value("data", e.date), y: .value("kg", e.kg))
                    .foregroundStyle(Color(red: 0.55, green: 0.38, blue: 0.22))
            }
        }
        .chartXAxis(.hidden)
    }

    private func saveWeight() {
        guard let v = Double(weightInput.replacingOccurrences(of: ",", with: ".")), v > 0, v < 300 else { return }
        store.addWeight(v)
        Task { await health.saveBodyMass(v) }
        weightInput = ""
    }
}

private extension Store {
    var targetWSafe: Double { settings.targetW }
}
