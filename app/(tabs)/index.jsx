import { useCallback } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import BarsChart from '../../components/BarsChart';
import Logo from '../../components/Logo';
import SlabBar from '../../components/SlabBar';
import { FitText, Text } from '../../components/Text';
import { Card, EmptyState, Loading, Screen, StatusNote } from '../../components/ui';
import { colors, radius } from '../../constants/colors';
import { cycleFor, forecastUnits, sumDays, toDayMap } from '../../lib/billing';
import { useRemote } from '../../lib/data';
import { useResponsive } from '../../lib/responsive';
import { deriveBilling, useSettings } from '../../lib/settings';
import { calcBill, formatRate, formatRupees, nextLimit } from '../../lib/tariff';
import { formatDayMonth, formatRange, formatWeekday, localDateString } from '../../lib/utils';

// Sum readings into 24 slots by the device's local hour, so a missing reading or
// several readings in one hour still land on the right bar.
function bucketByHour(rows) {
  const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, kwh: 0 }));
  for (const r of rows || []) {
    const hour = new Date(r.recorded_at).getHours();
    if (Number.isNaN(hour)) continue;
    buckets[hour].kwh += Number(r.kwh) || 0;
  }
  return buckets;
}

const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`;
const chartLabel = (h) => (h % 6 === 0 ? `${h % 12 || 12}${h < 12 ? 'a' : 'p'}` : '');
const fmtUnits = (u) => (u >= 100 ? String(Math.round(u)) : u.toFixed(1));

export default function Home() {
  const { settings } = useSettings();
  if (!settings) return <Loading />;
  return <HomeContent settings={settings} />;
}

function HomeContent({ settings }) {
  const { rs } = useResponsive();
  const today = localDateString();
  const { tariff, anchor, anchorIsDefault } = deriveBilling(settings, today);
  const cycle = cycleFor(today, anchor, tariff.billingMonths);

  // Today's readings, hour by hour (local midnight as an absolute instant: recorded_at is timestamptz)
  const hourly = useRemote(`home-hourly-${today}`, (client) => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    return client
      .from('hourly_readings')
      .select('recorded_at,kwh')
      .gte('recorded_at', startOfToday.toISOString())
      .order('recorded_at', { ascending: true });
  });

  // Every day of the current bill so far
  const daily = useRemote(`home-daily-${cycle.start}`, (client) =>
    client.from('daily_readings').select('date,total_kwh').gte('date', cycle.start).lte('date', today)
  );

  const refreshing = hourly.refreshing || daily.refreshing;
  const onRefresh = useCallback(() => Promise.all([hourly.refresh(), daily.refresh()]), [hourly.refresh, daily.refresh]);

  if (daily.source === 'loading' && !daily.rows) return <Loading />;

  if (!daily.rows) {
    return (
      <Screen refreshing={refreshing} onRefresh={onRefresh}>
        <Brand />
        <EmptyState
          title={daily.source === 'unconfigured' ? 'Database not set up' : "Can't load your usage"}
          message={
            daily.source === 'unconfigured'
              ? daily.message
              : 'Check your internet connection and try again.'
          }
          actionLabel={daily.source === 'unconfigured' ? undefined : 'Try again'}
          onAction={onRefresh}
        />
      </Screen>
    );
  }

  // ── bill so far ──
  const units = sumDays(toDayMap(daily.rows), cycle.start, cycle.end, today);
  const bill = calcBill(units, tariff);
  const projected = forecastUnits(units, cycle);
  const projectedBill = projected == null ? null : calcBill(projected, tariff);

  // ── "close to a limit" notice ──
  const limit = nextLimit(units, tariff);
  let warning = null;
  if (settings.warnNearLimit && limit) {
    const crossingSoon = limit.remaining <= Math.max(15, limit.at * 0.08);
    const onPace = limit.planChange && projected != null && projected > limit.at;
    if (onPace) {
      warning = {
        title: `On pace to pass ${limit.at} units`,
        body: `At this pace you will use about ${Math.round(projected)} units this bill. Passing ${limit.at} moves the whole bill to the higher-rate table, roughly ${formatRupees(limit.jump)} more.`,
      };
    } else if (crossingSoon) {
      const left = limit.remaining < 1 ? 'Less than 1 unit' : `${Math.floor(limit.remaining)} units`;
      warning = limit.planChange
        ? {
            title: `Close to ${limit.at} units`,
            body: `${left} to go. Passing ${limit.at} moves the whole bill to the higher-rate table, roughly ${formatRupees(limit.jump)} more.`,
          }
        : {
            title: `Close to ${limit.at} units`,
            body: `${left} left before the rate goes from ${formatRate(limit.rate)} to ${formatRate(limit.nextRate)} per unit.`,
          };
    }
  }

  // ── today ──
  const buckets = bucketByHour(hourly.rows);
  const todayKwh = buckets.reduce((s, b) => s + b.kwh, 0);
  const peak = buckets.reduce((best, b) => (b.kwh > best.kwh ? b : best), { hour: -1, kwh: 0 });
  const hasToday = peak.hour >= 0;

  const cachedAt = [hourly, daily].filter((q) => q.source === 'cached').map((q) => q.updatedAt);
  const note = cachedAt.length
    ? { source: 'cached', updatedAt: Math.min(...cachedAt) }
    : [hourly, daily].some((q) => q.source === 'loading')
      ? { source: 'loading', updatedAt: null }
      : { source: 'live', updatedAt: null };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <Brand />
      <StatusNote source={note.source} updatedAt={note.updatedAt} />

      {/* ── this bill ── */}
      <Card dark>
        <View style={styles.rowBetween}>
          <Text style={styles.darkLabel}>THIS BILL</Text>
          <Text style={[styles.darkMuted, styles.shrink, { textAlign: 'right' }]} numberOfLines={1}>
            {formatRange(cycle.start, cycle.end)}
          </Text>
        </View>

        <View style={[styles.split, { marginTop: 14, alignItems: 'flex-end' }]}>
          <View style={styles.col}>
            <FitText style={[styles.heroYellow, { fontSize: rs(46), lineHeight: rs(52) }]}>
              {fmtUnits(units)}
            </FitText>
            <Text style={styles.darkMuted} numberOfLines={1}>units so far</Text>
          </View>
          <View style={[styles.col, { alignItems: 'flex-end' }]}>
            <FitText style={[styles.heroWhite, { fontSize: rs(30), lineHeight: rs(38) }]}>
              {formatRupees(bill.total)}
            </FitText>
            <Text style={styles.darkMuted} numberOfLines={1}>estimated bill</Text>
          </View>
        </View>

        <View style={{ marginTop: 20 }}>
          <SlabBar tariff={tariff} units={units} />
        </View>

        <View style={styles.divider} />
        <Text style={styles.darkMuted}>Forecast for this bill</Text>
        <View style={[styles.split, { marginTop: 4 }]}>
          <View style={styles.col}>
            <FitText style={styles.forecast}>
              {projectedBill ? `~${Math.round(projected)} units` : 'After the first day'}
            </FitText>
          </View>
          {projectedBill && (
            <View style={[styles.col, { alignItems: 'flex-end' }]}>
              <FitText style={styles.forecast}>{formatRupees(projectedBill.total)}</FitText>
            </View>
          )}
        </View>

        {anchorIsDefault && (
          <Pressable onPress={() => router.navigate('/settings')} style={styles.nudge}>
            <Text style={styles.nudgeText}>Set your last meter-reading date for exact bill dates</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.yellow} />
          </Pressable>
        )}
      </Card>

      {/* ── near a limit ── */}
      {warning && (
        <View style={styles.warning}>
          <Ionicons name="warning-outline" size={20} color={colors.warning} style={{ marginTop: 1 }} />
          <View style={styles.shrink}>
            <Text style={styles.warningTitle}>{warning.title}</Text>
            <Text style={styles.warningBody}>{warning.body}</Text>
          </View>
        </View>
      )}

      {/* ── today ── */}
      <Card>
        <View style={styles.split}>
          <View style={styles.col}>
            <Text style={styles.label}>TODAY</Text>
            <View style={styles.valueRow}>
              <FitText style={[styles.todayValue, { fontSize: rs(34) }]} minScale={0.6}>
                {todayKwh.toFixed(2)}
              </FitText>
              <Text style={styles.todayUnit}>kWh</Text>
            </View>
          </View>
          {hasToday && (
            <View style={[styles.col, { alignItems: 'flex-end' }]}>
              <Text style={styles.label} numberOfLines={1}>PEAK HOUR</Text>
              <FitText style={styles.peakValue}>{hourLabel(peak.hour)}</FitText>
              <Text style={styles.todayUnit} numberOfLines={1}>{peak.kwh.toFixed(2)} kWh</Text>
            </View>
          )}
        </View>

        <View style={{ marginTop: 18 }}>
          {hasToday ? (
            <BarsChart
              data={buckets.map((b) => ({ value: b.kwh, label: chartLabel(b.hour) }))}
              selected={peak.hour}
              height={rs(130)}
            />
          ) : (
            <Text style={styles.noToday}>No readings yet today.</Text>
          )}
        </View>
      </Card>
    </Screen>
  );
}

function Brand() {
  const now = localDateString();
  return (
    <View style={styles.brand}>
      <View style={styles.brandLeft}>
        <Logo size={38} radius={26} />
        <FitText style={styles.brandName} minScale={0.7}>Electrify</FitText>
      </View>
      <Text style={styles.brandDate} numberOfLines={1}>{`${formatWeekday(now)}, ${formatDayMonth(now)}`}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // layout helpers: anything that sits side by side may shrink, so nothing can push past the card
  shrink: { flexShrink: 1, minWidth: 0 },
  col: { flexShrink: 1, minWidth: 0 },
  split: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 },

  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 20 },
  brandLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1, minWidth: 0 },
  brandName: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5, flexShrink: 1 },
  brandDate: { fontSize: 13, fontWeight: '600', color: colors.textMuted, flexShrink: 0 },

  darkLabel: { fontSize: 12, fontWeight: '700', color: colors.yellow, letterSpacing: 1 },
  darkMuted: { fontSize: 13, color: colors.onDarkMuted },
  heroYellow: { fontWeight: '800', color: colors.yellow, letterSpacing: -1.5 },
  heroWhite: { fontWeight: '800', color: colors.white, letterSpacing: -0.5 },
  divider: { height: 1, backgroundColor: colors.trackDark, marginVertical: 16 },
  forecast: { fontSize: 16, fontWeight: '700', color: colors.white },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.trackDark,
  },
  nudgeText: { fontSize: 13, color: colors.yellow, fontWeight: '600', flex: 1, paddingRight: 8 },

  warning: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.card,
    padding: 16,
    marginBottom: 14,
  },
  warningTitle: { fontSize: 15, fontWeight: '700', color: colors.warning },
  warningBody: { fontSize: 13, color: colors.warning, marginTop: 3, lineHeight: 19 },

  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  todayValue: { fontWeight: '800', color: colors.text, letterSpacing: -1, flexShrink: 1 },
  todayUnit: { fontSize: 14, fontWeight: '600', color: colors.textMuted },
  peakValue: { fontSize: 20, fontWeight: '800', color: colors.text, marginTop: 2 },
  noToday: { fontSize: 14, color: colors.textMuted, textAlign: 'center', paddingVertical: 24 },
});
