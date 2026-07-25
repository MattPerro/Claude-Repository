//  SettingsView.swift
//  David — "Impostazioni": aspetto, obiettivi, promemoria (notifiche vere),
//  calendario, Apple Salute, dati/backup e una pagina "Cosa può fare" con i
//  limiti dichiarati onestamente.

import SwiftUI
import UniformTypeIdentifiers

struct SettingsView: View {
    @EnvironmentObject var store: Store
    @EnvironmentObject var health: HealthKitManager
    @EnvironmentObject var notifications: NotificationService
    @EnvironmentObject var calendar: CalendarService

    @State private var heightInput = ""
    @State private var showExporter = false
    @State private var showImporter = false
    @State private var showResetAlert = false

    var body: some View {
        NavigationStack {
            Form {
                // Aspetto
                Section("Aspetto") {
                    Picker("Tema", selection: $store.settings.appearance) {
                        ForEach(AppearanceMode.allCases) { Text($0.label).tag($0) }
                    }
                }

                // Obiettivi peso
                Section("Obiettivi") {
                    Stepper("Peso di partenza: \(store.settings.startW, specifier: "%.0f") kg",
                            value: $store.settings.startW, in: 60...200, step: 1)
                    Stepper("Obiettivo: \(store.settings.targetW, specifier: "%.0f") kg",
                            value: $store.settings.targetW, in: 60...150, step: 1)
                    HStack {
                        TextField("Altezza (cm)", text: $heightInput).keyboardType(.numberPad)
                        Button("Salva altezza") {
                            if let cm = Double(heightInput), cm > 0 {
                                store.settings.heightCm = cm
                                Task { await health.saveHeight(cm) }
                            }
                        }.disabled(Double(heightInput) == nil)
                    }
                }

                // Promemoria (notifiche locali vere)
                Section("Promemoria") {
                    Toggle("Avvisi la sera prima", isOn: $store.settings.reminderEnabled)
                        .onChange(of: store.settings.reminderEnabled) { _, on in
                            Task {
                                if on && !notifications.authorized { await notifications.requestAuthorization() }
                                await notifications.reschedule(pattern: store.pattern,
                                                               remTime: store.settings.remTime,
                                                               enabled: store.settings.reminderEnabled)
                            }
                        }
                    DatePicker("Orario nuotata", selection: $store.settings.sessTime, displayedComponents: .hourAndMinute)
                    DatePicker("Orario avviso", selection: $store.settings.remTime, displayedComponents: .hourAndMinute)
                        .onChange(of: store.settings.remTime) { _, _ in
                            Task { await notifications.reschedule(pattern: store.pattern,
                                                                  remTime: store.settings.remTime,
                                                                  enabled: store.settings.reminderEnabled) }
                        }
                    Text("Notifiche vere sul telefono; l'Apple Watch le eredita.")
                        .font(.caption).foregroundStyle(.secondary)
                }

                // Calendario
                Section("Calendario") {
                    Button {
                        Task { await calendar.addUpcoming(pattern: store.pattern,
                                                          sessTime: store.settings.sessTime,
                                                          remTime: store.settings.remTime) }
                    } label: { Label("Aggiungi le prossime 4 settimane", systemImage: "calendar.badge.plus") }
                    if let msg = calendar.lastMessage {
                        Text(msg).font(.caption).foregroundStyle(.secondary)
                    }
                    Text("Aggiunge le sedute al Calendario di iOS (può includere un account Google se configurato sul telefono).")
                        .font(.caption).foregroundStyle(.secondary)
                }

                // Apple Salute
                Section("Apple Salute") {
                    HStack {
                        Text("Stato accesso")
                        Spacer()
                        Text(health.authorized ? "Concesso" : "Non concesso")
                            .foregroundStyle(health.authorized ? .green : .secondary)
                    }
                    if !health.authorized {
                        Button("Concedi accesso") { Task { await health.requestAuthorization() } }
                    }
                    if let m = health.bodyMassKg { Text("Peso da Salute: \(m, specifier: "%.1f") kg").font(.caption).foregroundStyle(.secondary) }
                }

                // Dati
                Section("Dati") {
                    Button { showExporter = true } label: { Label("Esporta backup (JSON)", systemImage: "square.and.arrow.up") }
                    Button { showImporter = true } label: { Label("Importa backup (JSON)", systemImage: "square.and.arrow.down") }
                    Button(role: .destructive) { showResetAlert = true } label: { Label("Azzera dati", systemImage: "trash") }
                }

                // Panoramica
                Section {
                    NavigationLink { AboutView() } label: { Label("Cosa può fare (e cosa no)", systemImage: "info.circle") }
                }

                Section {
                    Text("I dati restano sul dispositivo (in Apple Salute e nell'app). Nessun account, nessun server.")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Impostazioni")
            .fileExporter(isPresented: $showExporter,
                          document: JSONDoc(data: store.exportJSON() ?? Data()),
                          contentType: .json, defaultFilename: "david-backup") { _ in }
            .fileImporter(isPresented: $showImporter, allowedContentTypes: [.json]) { result in
                if case .success(let url) = result,
                   url.startAccessingSecurityScopedResource(),
                   let data = try? Data(contentsOf: url) {
                    _ = store.importJSON(data)
                    url.stopAccessingSecurityScopedResource()
                }
            }
            .alert("Azzerare tutti i dati?", isPresented: $showResetAlert) {
                Button("Annulla", role: .cancel) {}
                Button("Azzera", role: .destructive) { store.reset() }
            } message: { Text("L'operazione non è reversibile (i dati in Apple Salute non vengono toccati).") }
        }
    }
}

/// Documento per l'export del backup JSON.
struct JSONDoc: FileDocument {
    static var readableContentTypes: [UTType] { [.json] }
    var data: Data
    init(data: Data) { self.data = data }
    init(configuration: ReadConfiguration) throws { data = configuration.file.regularFileContents ?? Data() }
    func fileWrapper(configuration: WriteConfiguration) throws -> FileWrapper { FileWrapper(regularFileWithContents: data) }
}

/// "Cosa può fare" — funzioni e limiti dichiarati con onestà.
struct AboutView: View {
    var body: some View {
        List {
            Section("Cosa fa") {
                row("figure.pool.swim", "Legge le nuotate in piscina da Apple Salute (Watch): distanza, vasche, bracciate, battito, calorie.")
                row("waveform.path.ecg", "Ricalcola SWOLF e passo/100 m dai dati grezzi.")
                row("calendar", "Piani A/B/C con pattern settimanale e sedute da spuntare.")
                row("bell.badge", "Promemoria locali veri, la sera prima.")
                row("chart.line.uptrend.xyaxis", "Peso verso l'obiettivo 88 kg (fascia 87–89).")
                row("checkmark.shield", "Regole di sicurezza per la schiena sempre in evidenza.")
            }
            Section("Cosa NON fa (onestà)") {
                row("xmark.circle", "Non gira l'allenamento al posto tuo: l'avvio resta un tap sul Watch.")
                row("xmark.circle", "SWOLF è una stima ricalcolata, può differire un po' da Fitness.")
                row("xmark.circle", "Nessun video reale della tecnica: qui trovi testo e avvisi chiari.")
                row("xmark.circle", "Nessuna sincronizzazione cloud: i dati restano sul dispositivo.")
            }
            Section("Peso e altezza") {
                row("scalemass", "Peso/altezza li inserisci tu (o arrivano da Apple Salute se hai una bilancia collegata).")
            }
        }
        .navigationTitle("Cosa può fare")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func row(_ symbol: String, _ text: String) -> some View {
        Label { Text(text).font(.footnote) } icon: { Image(systemName: symbol) }
    }
}
