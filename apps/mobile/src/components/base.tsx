/**
 * Componenti di base.
 *
 * Tre requisiti sono incorporati qui, in modo che una schermata non possa
 * violarli per distrazione (specifica §9.1):
 *
 *  1. ogni comando ha un'area di tocco di almeno 44 x 44 punti;
 *  2. ogni comando ha un'etichetta per lo screen reader;
 *  3. ogni stato e' distinguibile senza il solo colore (simbolo + testo).
 */

import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  formatDecimalIt,
  parseDecimalIt,
  STATE_APPEARANCE,
  SYNC_STATE_TEXT,
  type StateName,
  type SyncStateName,
} from '@trackstrong/core';
import { useTheme } from '../theme/ThemeProvider';

// ---------------------------------------------------------------------------
// Testo
// ---------------------------------------------------------------------------

export type TextRole =
  | 'micro'
  | 'small'
  | 'body'
  | 'bodyLarge'
  | 'title'
  | 'heading'
  | 'setValue'
  | 'timer';

export function TsText({
  role = 'body',
  muted = false,
  color,
  weight,
  align,
  style,
  children,
  numberOfLines,
  accessibilityLabel,
}: {
  readonly role?: TextRole;
  readonly muted?: boolean;
  readonly color?: string;
  readonly weight?: 'regular' | 'medium' | 'semibold' | 'bold';
  readonly align?: 'left' | 'center' | 'right';
  readonly style?: StyleProp<TextStyle>;
  readonly children: React.ReactNode;
  readonly numberOfLines?: number;
  readonly accessibilityLabel?: string;
}): React.ReactElement {
  const t = useTheme();
  const isNumeric = role === 'setValue' || role === 'timer';
  return (
    <Text
      // `allowFontScaling` resta attivo: i caratteri ingranditi di iOS devono
      // funzionare (specifica §9.1). Le schermate sono progettate per
      // scorrere, non per stare in una griglia rigida.
      allowFontScaling
      numberOfLines={numberOfLines}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          color: color ?? (muted ? t.colors.textMuted : t.colors.text),
          fontSize: t.fontSize[role],
          fontWeight: t.fontWeight[weight ?? (isNumeric ? 'bold' : 'regular')],
          textAlign: align ?? 'left',
        },
        // Cifre a larghezza fissa: un conto alla rovescia che non "salta"
        // mentre i numeri cambiano si legge molto meglio di corsa.
        isNumeric ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// Pulsanti
// ---------------------------------------------------------------------------

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled = false,
  loading = false,
  large = false,
  accessibilityHint,
  glyph,
  style,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly variant?: ButtonVariant;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Comando principale della schermata: piu' alto del minimo. */
  readonly large?: boolean;
  readonly accessibilityHint?: string;
  /** Simbolo mostrato accanto all'etichetta. */
  readonly glyph?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}): React.ReactElement {
  const t = useTheme();
  const inactive = disabled || loading;

  const background =
    variant === 'primary'
      ? t.colors.accentSurface
      : variant === 'danger'
        ? t.colors.danger
        : variant === 'ghost'
          ? 'transparent'
          : t.colors.surfaceRaised;

  const foreground =
    variant === 'primary' || variant === 'danger' ? t.colors.onAccent : t.colors.text;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      // `disabled` va comunicato allo screen reader, non solo reso grigio.
      accessibilityState={{ disabled: inactive, busy: loading }}
      // L'area di tocco non scende sotto 44 punti nemmeno se il contenuto e'
      // piu' piccolo del riquadro visibile.
      hitSlop={8}
      style={({ pressed }) => [
        {
          minHeight: large ? t.primaryActionHeight : t.minTouchSize,
          minWidth: t.minTouchSize,
          paddingHorizontal: t.spacing.lg,
          borderRadius: t.radius.md,
          backgroundColor: background,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: t.colors.borderControl,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: t.spacing.sm,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} />
      ) : (
        <>
          {glyph !== undefined && (
            <TsText role={large ? 'title' : 'body'} color={foreground} weight="bold">
              {glyph}
            </TsText>
          )}
          <TsText
            role={large ? 'title' : 'body'}
            color={foreground}
            weight="semibold"
            numberOfLines={2}
          >
            {label}
          </TsText>
        </>
      )}
    </Pressable>
  );
}

/**
 * Comando compatto per le regolazioni rapide (+15 s, -15 s, +1 ripetizione).
 * Piccolo alla vista, ma 44 x 44 al tocco.
 */
export function StepperButton({
  label,
  onPress,
  accessibilityLabel,
  disabled = false,
  testID,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      hitSlop={10}
      style={({ pressed }) => ({
        width: t.minTouchSize,
        height: t.minTouchSize,
        borderRadius: t.radius.md,
        borderWidth: 1,
        borderColor: t.colors.borderControl,
        backgroundColor: t.colors.surfaceRaised,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
      })}
    >
      <TsText role="body" weight="bold">
        {label}
      </TsText>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Campo numerico con virgola italiana
// ---------------------------------------------------------------------------

/**
 * Campo per carichi, ripetizioni e secondi.
 *
 * Requisiti incorporati (specifica §9.1 e §10):
 *  - tastiera numerica con la virgola dove serve (`decimal-pad`);
 *  - la virgola italiana e' accettata e mostrata;
 *  - un campo vuoto o illeggibile produce `null`, **non** 0: uno zero salvato
 *    come carico e' un dato falso;
 *  - il valore precompilato e' visivamente distinto da uno confermato.
 */
export function NumericField({
  value,
  onChangeValue,
  label,
  unit,
  allowDecimals = true,
  prefilled = false,
  placeholder,
  disabled = false,
  testID,
}: {
  readonly value: number | null;
  readonly onChangeValue: (value: number | null) => void;
  readonly label: string;
  readonly unit?: string;
  readonly allowDecimals?: boolean;
  /** true se il valore arriva da una precompilazione e non da una conferma. */
  readonly prefilled?: boolean;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}): React.ReactElement {
  const t = useTheme();
  // Il testo mostrato e' uno stato locale: mentre si digita "12," il valore
  // numerico non esiste ancora, e sostituire il testo dell'utente mentre
  // scrive e' il modo piu' rapido di rendere un campo inutilizzabile.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);

  const displayed = draft ?? (value === null ? '' : formatDecimalIt(value));

  const handleChange = useCallback(
    (text: string) => {
      setDraft(text);
      if (text.trim() === '') {
        setInvalid(false);
        onChangeValue(null);
        return;
      }
      const parsed = parseDecimalIt(text);
      if (parsed === null) {
        // Testo non interpretabile: si segnala, e NON si inventa un valore.
        setInvalid(true);
        onChangeValue(null);
        return;
      }
      setInvalid(false);
      onChangeValue(parsed);
    },
    [onChangeValue],
  );

  const handleBlur = useCallback(() => {
    setDraft(null);
    setInvalid(false);
  }, []);

  return (
    <View style={{ gap: t.spacing.xs }}>
      <TsText role="small" muted>
        {label}
        {unit !== undefined ? ` (${unit})` : ''}
      </TsText>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: t.spacing.sm,
          borderWidth: invalid ? 2 : 1,
          borderColor: invalid ? t.colors.danger : t.colors.borderControl,
          borderRadius: t.radius.md,
          backgroundColor: t.colors.surface,
          paddingHorizontal: t.spacing.md,
          minHeight: t.minTouchSize + 8,
        }}
      >
        <TextInput
          testID={testID}
          value={displayed}
          onChangeText={handleChange}
          onBlur={handleBlur}
          editable={!disabled}
          // `decimal-pad` mostra la virgola sulle tastiere italiane;
          // `number-pad` la nasconde, ed e' giusto per le ripetizioni.
          keyboardType={allowDecimals ? 'decimal-pad' : 'number-pad'}
          inputMode={allowDecimals ? 'decimal' : 'numeric'}
          placeholder={placeholder ?? (prefilled ? undefined : '—')}
          placeholderTextColor={t.colors.textMuted}
          accessibilityLabel={label}
          accessibilityHint={
            invalid
              ? 'Il valore inserito non e leggibile e non verra salvato.'
              : prefilled
                ? 'Valore precompilato dall ultima prestazione confrontabile. Non e ancora registrato.'
                : undefined
          }
          allowFontScaling
          style={{
            flex: 1,
            paddingVertical: t.spacing.md,
            fontSize: t.fontSize.setValue,
            fontWeight: t.fontWeight.bold,
            fontVariant: ['tabular-nums'],
            // Il valore precompilato e' piu' tenue: si vede a occhio che non
            // e' ancora un fatto.
            color: prefilled && draft === null ? t.colors.textMuted : t.colors.text,
          }}
        />
        {unit !== undefined && (
          <TsText role="body" muted>
            {unit}
          </TsText>
        )}
      </View>
      {invalid && (
        <TsText role="small" color={t.colors.danger}>
          Valore non leggibile. Usa la virgola per i decimali, per esempio 12,5.
        </TsText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Contenitori
// ---------------------------------------------------------------------------

export function Card({
  children,
  raised = false,
  style,
  accessibilityLabel,
}: {
  readonly children: React.ReactNode;
  readonly raised?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly accessibilityLabel?: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          backgroundColor: raised ? t.colors.surfaceRaised : t.colors.surface,
          borderRadius: t.radius.lg,
          padding: t.spacing.lg,
          gap: t.spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Divider(): React.ReactElement {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.borderSubtle }} />;
}

export function SectionTitle({
  children,
  hint,
}: {
  readonly children: React.ReactNode;
  readonly hint?: string;
}): React.ReactElement {
  const t = useTheme();
  return (
    <View style={{ gap: t.spacing.xs }}>
      <TsText role="title" weight="semibold" accessibilityLabel={String(children)}>
        {children}
      </TsText>
      {hint !== undefined && (
        <TsText role="small" muted>
          {hint}
        </TsText>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Stati
// ---------------------------------------------------------------------------

/**
 * Pastiglia di stato.
 *
 * Mostra sempre simbolo + testo, non solo colore: chi non distingue il verde
 * dal rosso capisce comunque (specifica §9.1).
 */
export function StateBadge({ state }: { readonly state: StateName }): React.ReactElement {
  const t = useTheme();
  const appearance = STATE_APPEARANCE[state];
  const color = t.colors[appearance.colorRole];
  return (
    <View
      accessible
      accessibilityLabel={appearance.label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: t.spacing.xs,
        paddingHorizontal: t.spacing.sm,
        paddingVertical: t.spacing.xs,
        borderRadius: t.radius.pill,
        borderWidth: 1,
        borderColor: color,
      }}
    >
      <TsText role="small" color={color} weight="bold">
        {appearance.glyph}
      </TsText>
      <TsText role="small" color={color}>
        {appearance.label}
      </TsText>
    </View>
  );
}

/**
 * Indicatore di sincronizzazione, discreto.
 *
 * Nella home sta in un angolo e non ruba spazio: la sincronizzazione e' una
 * informazione di contesto, non il motivo per cui si apre l'app.
 */
export function SyncIndicator({
  state,
  detail,
  onPress,
}: {
  readonly state: SyncStateName;
  /** Testo aggiuntivo, es. "alle 18:42". */
  readonly detail?: string;
  readonly onPress?: () => void;
}): React.ReactElement {
  const t = useTheme();
  const info = SYNC_STATE_TEXT[state];
  const color = t.colors[info.colorRole];
  const label = detail === undefined ? info.short : `${info.short} ${detail}`;

  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.xs }}>
      <TsText role="small" color={color} weight="bold">
        {info.glyph}
      </TsText>
      <TsText role="small" color={color} numberOfLines={1}>
        {label}
      </TsText>
    </View>
  );

  if (onPress === undefined) {
    return (
      <View accessible accessibilityLabel={`${label}. ${info.long}`}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={info.long}
      hitSlop={12}
      style={{ minHeight: t.minTouchSize, justifyContent: 'center' }}
    >
      {content}
    </Pressable>
  );
}

/** Stato vuoto: dice cosa manca e cosa fare, non solo "nessun dato". */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}): React.ReactElement {
  const t = useTheme();
  return (
    <Card style={{ alignItems: 'flex-start' }}>
      <TsText role="bodyLarge" weight="semibold">
        {title}
      </TsText>
      <TsText role="body" muted>
        {description}
      </TsText>
      {actionLabel !== undefined && onAction !== undefined && (
        <Button label={actionLabel} onPress={onAction} variant="ghost" />
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Feedback aptico
// ---------------------------------------------------------------------------

/**
 * Feedback aptico discreto.
 *
 * Avvolto in una funzione perche' deve poter essere disattivato dalle
 * impostazioni e non deve mai far fallire un salvataggio: un errore
 * dell'aptica e' irrilevante, un errore nel salvataggio no.
 */
export const haptics = {
  setConfirmed(enabled: boolean): void {
    if (!enabled) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  },
  restFinished(enabled: boolean): void {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => undefined,
    );
  },
  warning(enabled: boolean): void {
    if (!enabled) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
      () => undefined,
    );
  },
};
