//  Components.swift
//  David — componenti UI riutilizzabili (tag sedute, avviso schiena, tessere stat).

import SwiftUI

extension SessionType {
    var color: Color {
        switch self {
        case .A: return Color(red: 0.43, green: 0.61, blue: 0.71)   // acqua
        case .B: return Color(red: 0.55, green: 0.38, blue: 0.22)   // bronzo
        case .C: return Color(red: 0.36, green: 0.44, blue: 0.31)   // verde
        }
    }
}

/// Etichetta colorata per il tipo di seduta.
struct SessionTag: View {
    let type: SessionType
    var compact = false
    var body: some View {
        Text(compact ? type.rawValue : "\(type.rawValue) · \(Catalog.session(type).name)")
            .font(.caption).bold()
            .padding(.horizontal, 9).padding(.vertical, 4)
            .background(type.color.opacity(0.16), in: Capsule())
            .foregroundStyle(type.color)
    }
}

/// Card di avviso per la sicurezza della schiena (ernie lombari).
struct SafetyCard: View {
    var compact = false
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Sicurezza schiena (ernie lombari)", systemImage: "exclamationmark.triangle.fill")
                .font(.subheadline).bold()
                .foregroundStyle(.red)
            Text("In acqua: mai inarcare la schiena per respirare o galleggiare; niente tuffi o virate spinte.")
                .font(.footnote).foregroundStyle(.secondary)
            if !compact {
                Text("Da evitare sempre:").font(.footnote).bold().foregroundStyle(.red).padding(.top, 2)
                ForEach(Catalog.forbidden, id: \.self) { f in
                    Text("• \(f)").font(.footnote).foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Color.red.opacity(0.3)))
    }
}

/// Tessera statistica (valore grande + etichetta).
struct StatTile: View {
    let value: String
    let label: String
    var body: some View {
        VStack(spacing: 4) {
            Text(value).font(.title.weight(.semibold)).monospacedDigit()
            Text(label).font(.caption2).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 14))
    }
}

/// Riga "cue" con supporto controindicazione (✗ in rosso).
struct CueRow: View {
    let cue: Cue
    var body: some View {
        HStack(alignment: .top, spacing: 8) {
            Image(systemName: cue.contra ? "xmark.circle.fill" : "checkmark.circle")
                .foregroundStyle(cue.contra ? .red : .secondary)
                .font(.footnote)
            Text(cue.text)
                .font(.footnote)
                .foregroundStyle(cue.contra ? .red : .primary)
        }
    }
}
