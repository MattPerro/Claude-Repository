//  PlanView.swift
//  David — "Piano": settimana navigabile, badge seduta per giorno, spunta rapida
//  del "fatto", e accesso al dettaglio (dove si cambia il tipo di seduta).

import SwiftUI

struct PlanView: View {
    @EnvironmentObject var store: Store
    @State private var weekOffset = 0

    private var monday: Date { DateUtils.addDays(DateUtils.mondayOf(Date()), weekOffset * 7) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack {
                        Button { weekOffset -= 1 } label: { Image(systemName: "chevron.left") }
                            .buttonStyle(.bordered)
                        Spacer()
                        Text(rangeLabel).font(.headline)
                        Spacer()
                        Button { weekOffset += 1 } label: { Image(systemName: "chevron.right") }
                            .buttonStyle(.bordered)
                    }
                }

                Section {
                    ForEach(0..<7, id: \.self) { i in
                        let d = DateUtils.addDays(monday, i)
                        dayRow(d, index: i)
                    }
                }
            }
            .navigationTitle("Piano")
        }
    }

    @ViewBuilder private func dayRow(_ d: Date, index: Int) -> some View {
        let type = store.sessionType(for: d)
        let isToday = DateUtils.sameDay(d, Date())
        HStack(spacing: 12) {
            if let type {
                Button { store.toggleDone(d, type: type) } label: {
                    Image(systemName: store.done[DateUtils.isoKey(d)] == type ? "checkmark.circle.fill" : "circle")
                        .font(.title2)
                        .foregroundStyle(store.done[DateUtils.isoKey(d)] == type ? .green : .secondary)
                }
                .buttonStyle(.plain)
            } else {
                Image(systemName: "circle.dashed").font(.title2).foregroundStyle(Color(.systemGray4))
            }

            NavigationLink {
                SessionDetailView(date: d, type: type ?? .A)
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("\(DateUtils.giorniLong[index])  \(shortDate(d))")
                        .font(.subheadline).bold()
                        .foregroundStyle(isToday ? Color.accentColor : .primary)
                    if let type {
                        SessionTag(type: type)
                    } else {
                        Text("+ assegna seduta").font(.footnote).foregroundStyle(Color.accentColor)
                    }
                }
            }
        }
    }

    private var rangeLabel: String {
        let end = DateUtils.addDays(monday, 6)
        let f = DateFormatter(); f.locale = Locale(identifier: "it_IT"); f.dateFormat = "d MMM"
        return "\(f.string(from: monday)) – \(f.string(from: end))"
    }
    private func shortDate(_ d: Date) -> String {
        let f = DateFormatter(); f.locale = Locale(identifier: "it_IT"); f.dateFormat = "d MMM"
        return f.string(from: d)
    }
}
