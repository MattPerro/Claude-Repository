//  SessionDetailView.swift
//  David — dettaglio di una seduta: blocchi, esercizi, sicurezza schiena,
//  spunte per data+tipo e (dal Piano) cambio tipo + "segna fatta".

import SwiftUI

struct SessionDetailView: View {
    @EnvironmentObject var store: Store

    /// Se `date` è presente, la vista consente di modificare il pattern del
    /// giorno-settimana e di segnare la seduta come fatta.
    let date: Date?
    @State var type: SessionType

    private var isToday: Bool { date.map { DateUtils.sameDay($0, Date()) } ?? false }
    private var checkDate: Date { date ?? Date() }

    var body: some View {
        List {
            if date != nil {
                Section {
                    Picker("Tipo di seduta", selection: $type) {
                        ForEach(SessionType.allCases) { Text($0.rawValue).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: type) { _, newValue in
                        if let d = date { store.setPattern(DateUtils.weekdayMon(d), newValue) }
                    }
                }
            }

            let session = Catalog.session(type)
            Section {
                VStack(alignment: .leading, spacing: 6) {
                    Text(session.name).font(.title2.weight(.semibold))
                    Text("\(type.label) · \(session.duration)").font(.subheadline).foregroundStyle(.secondary)
                    Text(session.focus).font(.footnote).foregroundStyle(.secondary)
                }
                SafetyCard()
            }

            ForEach(session.blocks) { block in
                Section(block.title) {
                    ForEach(block.items) { item in
                        let ex = Catalog.exercise(item.ref)
                        HStack(spacing: 12) {
                            if isToday {
                                Button {
                                    store.toggleEx(checkDate, type, item.id)
                                } label: {
                                    Image(systemName: store.isExChecked(checkDate, type, item.id)
                                          ? "checkmark.circle.fill" : "circle")
                                        .font(.title3)
                                        .foregroundStyle(store.isExChecked(checkDate, type, item.id) ? .green : .secondary)
                                }
                                .buttonStyle(.plain)
                            }
                            NavigationLink {
                                ExerciseGuideView(exercise: ex, schema: item.schema)
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: ex.symbol).foregroundStyle(ex.hernia ? .red : .accentColor).frame(width: 26)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(ex.name).font(.body)
                                        Text(item.schema).font(.caption).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                }
            }

            if let d = date {
                Section {
                    Button {
                        store.toggleDone(d, type: type)
                    } label: {
                        Label(store.done[DateUtils.isoKey(d)] == type ? "Fatta ✓ — annulla" : "Segna come fatta",
                              systemImage: store.done[DateUtils.isoKey(d)] == type ? "checkmark.seal.fill" : "checkmark.seal")
                    }
                    .tint(store.done[DateUtils.isoKey(d)] == type ? .green : .accentColor)
                }
            }
        }
        .navigationTitle(navTitle)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var navTitle: String {
        if let d = date {
            let wd = DateUtils.weekdayMon(d)
            return "\(DateUtils.giorniLong[wd])"
        }
        return "Sessione \(type.rawValue)"
    }
}

/// Guida al singolo esercizio: icona, schema, cue (con controindicazioni in rosso),
/// attrezzatura e avviso schiena dove serve. Niente video finti: testo chiaro.
struct ExerciseGuideView: View {
    let exercise: Exercise
    var schema: String? = nil

    var body: some View {
        List {
            Section {
                VStack(spacing: 10) {
                    Image(systemName: exercise.symbol)
                        .font(.system(size: 54))
                        .foregroundStyle(Color.accentColor)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                    if let schema {
                        Text(schema).font(.subheadline).foregroundStyle(.secondary)
                    }
                    Label("Attrezzatura: Nessuna", systemImage: "checkmark.seal")
                        .font(.caption).foregroundStyle(.green)
                }
            }
            Section("Come eseguirlo") {
                ForEach(exercise.cues) { CueRow(cue: $0) }
            }
            if exercise.hernia {
                Section { SafetyCard(compact: true) }
            }
        }
        .navigationTitle(exercise.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}
