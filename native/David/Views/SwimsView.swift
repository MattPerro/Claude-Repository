//  SwimsView.swift
//  David — "Nuotate": legge da Apple Salute le nuotate in piscina registrate
//  dall'app Allenamento e ne mostra le metriche (distanza, passo, SWOLF, ecc.).

import SwiftUI

struct SwimsView: View {
    @EnvironmentObject var health: HealthKitManager

    var body: some View {
        NavigationStack {
            Group {
                if !HealthKitManager.isAvailable {
                    ContentUnavailableView("Apple Salute non disponibile",
                        systemImage: "heart.slash",
                        description: Text("Questo dispositivo non espone i dati di salute."))
                } else if !health.authorized {
                    ContentUnavailableView {
                        Label("Collega Apple Salute", systemImage: "heart.text.square")
                    } description: {
                        Text("Concedi l'accesso per vedere qui le tue nuotate registrate dall'Apple Watch.")
                    } actions: {
                        Button("Concedi accesso") { Task { await health.requestAuthorization() } }
                            .buttonStyle(.borderedProminent)
                    }
                } else if health.swims.isEmpty {
                    ContentUnavailableView("Nessuna nuotata",
                        systemImage: "figure.pool.swim",
                        description: Text("Avvia l'allenamento \"Nuoto in piscina\" sull'Apple Watch: al termine comparirà qui."))
                } else {
                    List(health.swims) { swim in
                        SwimRow(swim: swim)
                    }
                    .refreshable { await health.refreshAll() }
                }
            }
            .navigationTitle("Nuotate")
            .toolbar {
                Button { Task { await health.refreshAll() } } label: { Image(systemName: "arrow.clockwise") }
            }
        }
    }
}

struct SwimRow: View {
    let swim: SwimWorkout

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(dateText).font(.subheadline).bold()
            HStack {
                metric("Distanza", "\(Int(swim.distance)) m", "ruler")
                metric("Durata", durationText, "clock")
                metric("Passo/100m", paceText, "speedometer")
            }
            HStack {
                metric("SWOLF", swim.swolf.map(String.init) ?? "—", "waveform.path.ecg")
                metric("Battito", swim.avgHeartRate > 0 ? "\(Int(swim.avgHeartRate))" : "—", "heart.fill")
                metric("kcal", swim.activeEnergy > 0 ? "\(Int(swim.activeEnergy))" : "—", "flame.fill")
            }
        }
        .padding(.vertical, 4)
    }

    private func metric(_ label: String, _ value: String, _ symbol: String) -> some View {
        VStack(spacing: 2) {
            Label(value, systemImage: symbol).font(.footnote).bold().labelStyle(.titleAndIcon)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }

    private var dateText: String {
        let f = DateFormatter(); f.locale = Locale(identifier: "it_IT")
        f.dateFormat = "EEEE d MMM, HH:mm"
        return f.string(from: swim.date).capitalized
    }
    private var durationText: String {
        let m = Int(swim.duration) / 60, s = Int(swim.duration) % 60
        return String(format: "%d:%02d", m, s)
    }
    private var paceText: String {
        guard swim.pace100 > 0 else { return "—" }
        let m = Int(swim.pace100) / 60, s = Int(swim.pace100) % 60
        return String(format: "%d:%02d", m, s)
    }
}
