//  DavidApp.swift
//  David — app nativa iOS (SwiftUI). Punto di ingresso e navigazione a schede.

import SwiftUI

@main
struct DavidApp: App {
    @StateObject private var store = Store()
    @StateObject private var health = HealthKitManager()
    @StateObject private var notifications = NotificationService()
    @StateObject private var calendar = CalendarService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(health)
                .environmentObject(notifications)
                .environmentObject(calendar)
                .preferredColorScheme(store.settings.appearance.colorScheme)
        }
    }
}

struct RootView: View {
    @EnvironmentObject var health: HealthKitManager

    var body: some View {
        TabView {
            TodayView().tabItem { Label("Oggi", systemImage: "house.fill") }
            PlanView().tabItem { Label("Piano", systemImage: "calendar") }
            SwimsView().tabItem { Label("Nuotate", systemImage: "figure.pool.swim") }
            ProgressDashboardView().tabItem { Label("Progressi", systemImage: "chart.line.uptrend.xyaxis") }
            SettingsView().tabItem { Label("Impostazioni", systemImage: "gearshape.fill") }
        }
        .task {
            // Al primo avvio chiede l'accesso ad Apple Salute (se disponibile).
            if HealthKitManager.isAvailable && !health.authorized {
                await health.requestAuthorization()
            }
        }
    }
}
