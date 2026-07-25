//  DavidWatchApp.swift
//  David (Apple Watch) — avvio di una nuotata in piscina dal polso.
//  Usa HKWorkoutSession + HKLiveWorkoutBuilder: le metriche (distanza, battito,
//  durata) vengono raccolte dal Watch e salvate in Apple Salute, dove l'app
//  iPhone le rilegge.

import SwiftUI

@main
struct DavidWatchApp: App {
    var body: some Scene {
        WindowGroup {
            WatchRootView()
        }
    }
}

struct WatchRootView: View {
    @StateObject private var workout = WorkoutManager()

    var body: some View {
        NavigationStack {
            if workout.isRunning {
                LiveWorkoutView(workout: workout)
            } else {
                StartWorkoutView(workout: workout)
            }
        }
        .task { await workout.requestAuthorization() }
    }
}

struct StartWorkoutView: View {
    @ObservedObject var workout: WorkoutManager

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Image(systemName: "figure.pool.swim").font(.system(size: 34))
                Text("Nuoto in piscina").font(.headline)
                Text("Lunghezza vasca 25 m").font(.caption2).foregroundStyle(.secondary)
                Button {
                    workout.start(poolLength: 25)
                } label: {
                    Label("Avvia nuotata", systemImage: "play.fill").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.blue)
                Text("Attento alla schiena: niente farfalla né spinte lombari.")
                    .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
                if let e = workout.lastError {
                    Text(e).font(.caption2).foregroundStyle(.red)
                }
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle("David")
    }
}

struct LiveWorkoutView: View {
    @ObservedObject var workout: WorkoutManager

    var body: some View {
        VStack(spacing: 8) {
            Text(timeString(workout.elapsed))
                .font(.system(size: 34, weight: .semibold, design: .rounded))
                .monospacedDigit()
            HStack {
                metric("\(Int(workout.distance)) m", "ruler")
                metric(workout.heartRate > 0 ? "\(Int(workout.heartRate))" : "—", "heart.fill")
            }
            Button(role: .destructive) {
                workout.stop()
            } label: {
                Label("Termina", systemImage: "stop.fill").frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(.horizontal, 6)
        .navigationTitle("In vasca")
    }

    private func metric(_ value: String, _ symbol: String) -> some View {
        Label(value, systemImage: symbol).font(.callout).frame(maxWidth: .infinity)
    }
    private func timeString(_ t: TimeInterval) -> String {
        let m = Int(t) / 60, s = Int(t) % 60
        return String(format: "%d:%02d", m, s)
    }
}
