//  CalendarService.swift
//  David — aggiunge le sedute al Calendario di iOS tramite EventKit.
//  Nota: il Calendario iOS può includere account Google/Exchange se configurati
//  sul telefono, quindi l'evento può finire anche lì — senza login o backend
//  dedicato e senza inviare dati a servizi terzi da parte dell'app.

import Foundation
import EventKit

@MainActor
final class CalendarService: ObservableObject {

    let store = EKEventStore()
    @Published var lastMessage: String? = nil

    func requestAccess() async -> Bool {
        do {
            if #available(iOS 17.0, *) {
                return try await store.requestWriteOnlyAccessToEvents()
            } else {
                return try await store.requestAccess(to: .event)
            }
        } catch {
            lastMessage = error.localizedDescription
            return false
        }
    }

    /// Crea gli eventi delle prossime `weeks` settimane in base al pattern,
    /// ciascuno con un avviso la sera prima all'orario indicato.
    func addUpcoming(pattern: [Int: SessionType], sessTime: Date, remTime: Date, weeks: Int = 4) async {
        guard await requestAccess() else { lastMessage = "Accesso al Calendario negato."; return }

        let cal = DateUtils.calendar
        let sc = cal.dateComponents([.hour, .minute], from: sessTime)
        let rc = cal.dateComponents([.hour, .minute], from: remTime)
        let start = DateUtils.startOfDay(Date())
        var created = 0

        for i in 0..<(weeks * 7) {
            let day = DateUtils.addDays(start, i)
            guard let type = pattern[DateUtils.weekdayMon(day)] else { continue }
            let session = Catalog.session(type)

            let event = EKEvent(eventStore: store)
            event.title = "🏊 Nuoto — \(type.label): \(session.name)"
            event.notes = session.focus
            event.calendar = store.defaultCalendarForNewEvents
            var s = cal.dateComponents([.year, .month, .day], from: day)
            s.hour = sc.hour; s.minute = sc.minute
            let startDate = cal.date(from: s)!
            event.startDate = startDate
            event.endDate = cal.date(byAdding: .minute, value: 60, to: startDate)!

            // Avviso la sera prima all'orario scelto (offset relativo all'inizio).
            let eve = DateUtils.addDays(day, -1)
            var e = cal.dateComponents([.year, .month, .day], from: eve)
            e.hour = rc.hour; e.minute = rc.minute
            if let alarmDate = cal.date(from: e) {
                event.addAlarm(EKAlarm(absoluteDate: alarmDate))
            }

            do { try store.save(event, span: .thisEvent); created += 1 }
            catch { lastMessage = error.localizedDescription; return }
        }
        lastMessage = "Aggiunte \(created) sedute al Calendario (prossime \(weeks) settimane)."
    }
}
