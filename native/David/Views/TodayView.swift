//  TodayView.swift
//  David — schermata "Oggi": seduta del giorno (o prossima se riposo),
//  striscia settimana e mini-statistiche.

import SwiftUI

struct TodayView: View {
    @EnvironmentObject var store: Store

    var body: some View {
        NavigationStack {
            List {
                heroSection
                weekStripSection
                statsSection
            }
            .navigationTitle("Oggi")
        }
    }

    // Card principale
    @ViewBuilder private var heroSection: some View {
        let today = Date()
        if let type = store.sessionType(for: today) {
            let session = Catalog.session(type)
            let done = store.isDone(today)
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(DateUtils.giorniLong[DateUtils.weekdayMon(today)]) · \(type.label) · \(session.duration)")
                        .font(.caption).bold().foregroundStyle(.secondary)
                    Text(session.name).font(.title.weight(.semibold))
                    Text(session.focus).font(.subheadline).foregroundStyle(.secondary)
                    if done {
                        Label("Completata", systemImage: "checkmark.seal.fill").foregroundStyle(.green).padding(.top, 4)
                    }
                    NavigationLink {
                        SessionDetailView(date: today, type: type)
                    } label: {
                        Label(done ? "Rivedi la sessione" : "Vai alla sessione", systemImage: "figure.pool.swim")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .padding(.top, 4)
                }
                .padding(.vertical, 4)
            }
        } else {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Oggi · Riposo").font(.caption).bold().foregroundStyle(.secondary)
                    Text("Giorno di recupero").font(.title.weight(.semibold))
                    Text("Riposa: il progresso si costruisce anche fuori dall'acqua.")
                        .font(.subheadline).foregroundStyle(.secondary)
                    if let (nextDate, nextType) = nextSession() {
                        let s = Catalog.session(nextType)
                        Text("Prossima: \(DateUtils.giorniLong[DateUtils.weekdayMon(nextDate)]) — \(nextType.label), \(s.name)")
                            .font(.footnote).foregroundStyle(.secondary).padding(.top, 2)
                        NavigationLink {
                            SessionDetailView(date: nextDate, type: nextType)
                        } label: {
                            Label("Cosa prevede", systemImage: "list.bullet.rectangle").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding(.vertical, 4)
            }
        }
    }

    private var weekStripSection: some View {
        let monday = DateUtils.mondayOf(Date())
        return Section("Questa settimana") {
            HStack {
                ForEach(0..<7, id: \.self) { i in
                    let d = DateUtils.addDays(monday, i)
                    let isToday = DateUtils.sameDay(d, Date())
                    VStack(spacing: 6) {
                        Text(DateUtils.giorni[i]).font(.caption2).foregroundStyle(.secondary)
                        Circle()
                            .fill(dotColor(d))
                            .frame(width: 10, height: 10)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
                    .background(isToday ? Color(.systemGray5) : .clear, in: RoundedRectangle(cornerRadius: 8))
                }
            }
        }
    }

    private var statsSection: some View {
        let monday = DateUtils.mondayOf(Date())
        return Section {
            HStack(spacing: 10) {
                StatTile(value: "\(store.doneCount(weekOf: monday))/\(store.plannedCount(weekOf: monday))",
                         label: "sedute questa settimana")
                StatTile(value: "\(store.streakWeeks())", label: "settimane di fila (≥2)")
            }
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private func dotColor(_ d: Date) -> Color {
        if store.isDone(d) { return .green }
        if store.sessionType(for: d) != nil { return Color(red: 0.78, green: 0.64, blue: 0.48) }
        return Color(.systemGray4)
    }

    private func nextSession() -> (Date, SessionType)? {
        var d = Date()
        for _ in 0..<14 {
            d = DateUtils.addDays(d, 1)
            if let t = store.sessionType(for: d) { return (d, t) }
        }
        return nil
    }
}
