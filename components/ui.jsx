import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { FitText, Text } from './Text';
import { colors, radius, shadow } from '../constants/colors';
import { MAX_CONTENT_WIDTH, useResponsive } from '../lib/responsive';
import { timeAgo } from '../lib/utils';

// Page frame: safe area, scrolling, pull-to-refresh. On wide screens (tablets,
// landscape) the content stays in a centred column instead of stretching.
export function Screen({ children, refreshing, onRefresh }) {
  const { pad } = useResponsive();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.black} colors={[colors.black]} />
          ) : undefined
        }
      >
        <View style={[styles.column, { padding: pad }]}>{children}</View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function PageTitle({ title, subtitle }) {
  const { rs } = useResponsive();
  return (
    <View style={styles.pageTitle}>
      <FitText style={[styles.h1, { fontSize: rs(30) }]}>{title}</FitText>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Card({ children, dark, style }) {
  const { rs } = useResponsive();
  return <View style={[styles.card, { padding: rs(18) }, dark && styles.cardDark, style]}>{children}</View>;
}

export function SectionLabel({ children }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

// Small "Week | Month" style switch.
export function Segmented({ options, value, onChange }) {
  return (
    <View style={styles.segment}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, active && styles.segmentItemActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Up / down change chip. Using LESS electricity is the good direction.
// The text wraps inside the chip if the screen is narrow.
export function ChangeChip({ percent, suffix }) {
  if (percent == null) return null;
  const rounded = Math.round(percent);
  const flat = Math.abs(percent) < 2;   // within noise: neither good nor bad
  const down = rounded < 0;
  const tone = flat ? 'neutral' : down ? 'good' : 'bad';
  const bg = { neutral: colors.background, good: colors.successSoft, bad: colors.dangerSoft }[tone];
  const fg = { neutral: colors.textMuted, good: colors.success, bad: colors.danger }[tone];
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Ionicons name={flat ? 'remove' : down ? 'arrow-down' : 'arrow-up'} size={12} color={fg} />
      <Text style={[styles.chipText, { color: fg }]}>
        {Math.abs(rounded)}%{suffix ? ` ${suffix}` : ''}
      </Text>
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={colors.black} />
    </View>
  );
}

// Shown when there is nothing to display at all.
export function EmptyState({ icon = 'cloud-offline-outline', title, message, actionLabel, onAction }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={30} color={colors.black} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      {message ? <Text style={styles.emptyMessage}>{message}</Text> : null}
      {actionLabel ? (
        <Pressable onPress={onAction} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// Says when the numbers are not live. Renders nothing when everything is fresh.
//   'loading': old numbers are on screen while fresh ones are being fetched
//   'cached':  the fetch failed, so these are the last known numbers
export function StatusNote({ source, updatedAt }) {
  if (source === 'loading') {
    return (
      <View style={styles.updating}>
        <ActivityIndicator size="small" color={colors.textMuted} />
        <Text style={styles.updatingText}>Updating…</Text>
      </View>
    );
  }
  if (source !== 'cached' || !updatedAt) return null;
  return (
    <View style={styles.offline}>
      <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
      <Text style={styles.offlineText}>Offline. Showing data from {timeAgo(updatedAt)}.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { alignItems: 'center', paddingBottom: 40 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },

  pageTitle: { marginBottom: 20 },
  h1: { fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: colors.textMuted, marginTop: 2 },

  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    marginBottom: 14,
    ...shadow,
  },
  cardDark: { backgroundColor: colors.black },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginLeft: 4,
  },

  segment: {
    flexDirection: 'row',
    backgroundColor: '#E9E9E4',
    borderRadius: radius.pill,
    padding: 4,
    marginBottom: 16,
  },
  segmentItem: { flex: 1, paddingVertical: 9, paddingHorizontal: 6, borderRadius: radius.pill, alignItems: 'center' },
  segmentItemActive: { backgroundColor: colors.black },
  segmentText: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  segmentTextActive: { color: colors.yellow },

  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    flexShrink: 1,
    maxWidth: '100%',
    gap: 3,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
  },
  chipText: { fontSize: 12, fontWeight: '700', flexShrink: 1 },

  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24 },
  emptyIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyMessage: { fontSize: 14, color: colors.textMuted, textAlign: 'center', marginTop: 6, lineHeight: 20 },

  button: {
    backgroundColor: colors.black,
    borderRadius: radius.pill,
    paddingVertical: 13,
    paddingHorizontal: 26,
    marginTop: 20,
    alignItems: 'center',
  },
  buttonText: { color: colors.yellow, fontSize: 15, fontWeight: '700', textAlign: 'center' },

  updating: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginLeft: 4 },
  updatingText: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },

  offline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.small,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14,
  },
  offlineText: { fontSize: 13, fontWeight: '600', color: colors.warning, flex: 1 },
});
