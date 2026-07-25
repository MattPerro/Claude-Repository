//  Notifications.swift
//  David — promemoria locali VERI (a differenza della web-app che usava .ics).
//  Per ogni giorno con seduta pianificata, programma un avviso ricorrente
//  settimanale "la sera prima" all'orario scelto.

import Foundation
import UserNotifications

@MainActor
final class NotificationService: ObservableObject {

    @Published var authorized = false

    func requestAuthorization() async {
        do {
            authorized = try await UNUserNotificationCenter.current()
                .requestAuthorization(options: [.alert, .sound, .badge])
        } catch {
            authorized = false
        }
    }

    /// Rimuove e riprogramma i promemoria in base al pattern corrente.
    func reschedule(pattern: [Int: SessionType], remTime: Date, enabled: Bool) async {
        let center = UNUserNotificationCenter.current()
        center.removeAllPendingNotificationRequests()
        guard enabled else { return }

        let cal = DateUtils.calendar
        let comps = cal.dateComponents([.hour, .minute], from: remTime)
        let hour = comps.hour ?? 21, minute = comps.minute ?? 0

        for (weekday, type) in pattern {
            // "la sera prima": weekday 0=Lun..6=Dom → giorno precedente
            let eveWeekdayMon = (weekday + 6) % 7
            // UNCalendar usa weekday 1=dom..7=sab
            let uiWeekday = ((eveWeekdayMon + 1) % 7) + 1

            var trigger = DateComponents()
            trigger.hour = hour
            trigger.minute = minute
            trigger.weekday = uiWeekday

            let content = UNMutableNotificationContent()
            content.title = "Domani si nuota 🏊"
            content.body = "Prepara la borsa: \(type.label) — \(Catalog.session(type).name)."
            content.sound = .default

            let req = UNNotificationRequest(
                identifier: "david.reminder.\(weekday)",
                content: content,
                trigger: UNCalendarNotificationTrigger(dateMatching: trigger, repeats: true))
            try? await center.add(req)
        }
    }
}
