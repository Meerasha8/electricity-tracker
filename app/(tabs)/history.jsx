import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import BarsChart from '../../components/BarsChart';
import { FitText, Text } from '../../components/Text';
import {
  Card, ChangeChip, EmptyState, Loading, PageTitle, Screen, Segmented, StatusNote,
} from '../../components/ui';
import { colors } from '../../constants/colors';
import {
  dayCosts, percentChange, recentCycles, sumDays, toDayMap,
} from '../../lib/billing';
import { useRemote } from '../../lib/data';
import { useResponsive } from '../../lib/responsive';
import { deriveBilling, useSettings } from '../../lib/settings';
import { calcBill, formatRupees } from '../../lib/tariff';
import {
  MONTHS, addDays, diffDays, formatDayMonth, formatRange, formatWeekday, localDateString, ymd,
} from '../../lib/utils';

const CYCLES_SHOWN = 6;
const fmtKwh = (v) => (v >= 100 ? String(Math.round(v)) : v.toFixed(1));

export default function History() {
  const { settings } = useSettings();
  if (!settings) return <Loading />;
  return <HistoryContent settings={settings} />;
}

function HistoryContent({ settings }) {
  const { rs } = useResponsive();
  const [mode, setMode] = useState('week');
  const [picked, setPicked] = useState({ week: null, month: null });

  const today = localDateString();
  const { tariff, anchor } = deriveBilling(settings, today);
  const cycles = recentCycles(today, anchor, tariff.billingMonths, CYCLES_SHOWN);
  const from = cycles[0].start;

  // One load covers both views: every day from the start of the oldest cycle shown.
  const daily = useRemote(`history-daily-${from}`, (client) =>
    client
      .from('daily_readings')
      .select('date,total_kwh')
      .gte('date', from)
      .lte('date', today)
      .order('date', { ascending: true })
  );

  if (daily.source === 'loading' && !daily.rows) return <Loading />;

  const header = <PageTitle title="History" />;

  if (!daily.rows) {
    return (
      <Screen refreshing={daily.refreshing} onRefresh={daily.refresh}>
        {header}
        <EmptyState
          title={daily.source === 'unconfigured' ? 'Database not set up' : "Can't load your history"}
          message={
            daily.source === 'unconfigured' ? daily.message : 'Check your internet connection and try again.'
          }
          actionLabel={daily.source === 'unconfigured' ? undefined : 'Try again'}
          onAction={daily.refresh}
        />
      </Screen>
    );
  }
  if (daily.rows.length === 0) {
    return (
      <Screen refreshing={daily.refreshing} onRefresh={daily.refresh}>
        {header}
        <EmptyState
          icon="pulse-outline"
          title="No readings yet"
          message="Your usage history appears here once your meter starts sending readings."
        />
      </Screen>
    );
  }

  const dayMap = toDayMap(daily.rows);
  const costs = dayCosts(dayMap, anchor, tariff);
  const chartHeight = rs(170);

  return (
    <Screen refreshing={daily.refreshing} onRefresh={daily.refresh}>
      {header}
      <Segmented
        options={[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
        ]}
        value={mode}
        onChange={setMode}
      />
      <StatusNote source={daily.source} updatedAt={daily.updatedAt} />

      {mode === 'week' ? (
        <WeekView
          dayMap={dayMap}
          costs={costs}
          today={today}
          chartHeight={chartHeight}
          selected={picked.week}
          onSelect={(i) => setPicked((p) => ({ ...p, week: i }))}
        />
      ) : (
        <CycleView
          dayMap={dayMap}
          cycles={cycles}
          tariff={tariff}
          today={today}
          chartHeight={chartHeight}
          selected={picked.month}
          onSelect={(i) => setPicked((p) => ({ ...p, month: i }))}
        />
      )}
    </Screen>
  );
}

// A big number with its unit beside it. The number shrinks rather than overflow.
function Figure({ value, unit, size = 26, caption, align = 'flex-start' }) {
  const { rs } = useResponsive();
  return (
    <View style={[styles.col, { alignItems: align }]}>
      <View style={styles.figureRow}>
        <FitText style={[styles.figure, { fontSize: rs(size) }]} minScale={0.6}>{value}</FitText>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {caption ? <Text style={styles.muted} numberOfLines={1}>{caption}</Text> : null}
    </View>
  );
}

// ───────────────────────── Week: the last 7 days ─────────────────────────
function WeekView({ dayMap, costs, today, chartHeight, selected, onSelect }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const values = days.map((d) => dayMap.get(d) || 0);
  const previousWeek = Array.from({ length: 7 }, (_, i) => dayMap.get(addDays(today, i - 13)) || 0);

  const total = values.reduce((s, v) => s + v, 0);
  const previousTotal = previousWeek.reduce((s, v) => s + v, 0);

  const index = selected ?? 6;
  const date = days[index];
  const prevDay = index > 0 ? values[index - 1] : dayMap.get(addDays(date, -1)) || 0;

  return (
    <>
      <Card>
        <Text style={styles.label}>LAST 7 DAYS</Text>
        <View style={{ marginTop: 4 }}>
          <Figure value={total.toFixed(1)} unit="kWh" size={40} />
        </View>
        <View style={styles.wrapRow}>
          <ChangeChip percent={percentChange(total, previousTotal)} suffix="vs previous 7 days" />
          <Text style={styles.muted}>{(total / 7).toFixed(1)} kWh a day</Text>
        </View>
      </Card>

      <Card>
        <BarsChart
          data={days.map((d, i) => ({ value: values[i], label: formatWeekday(d) }))}
          selected={index}
          onSelect={onSelect}
          height={chartHeight}
        />
      </Card>

      <Card>
        <View style={styles.titleRow}>
          <Text style={styles.detailTitle}>
            {formatWeekday(date)}, {formatDayMonth(date)}
          </Text>
          {date === today && <Text style={styles.todayTag}>TODAY</Text>}
        </View>
        <View style={[styles.split, { marginTop: 12 }]}>
          <Figure value={values[index].toFixed(2)} unit="kWh" caption="usage" />
          <Figure value={formatRupees(costs.get(date) || 0)} caption="est. cost" align="flex-end" />
        </View>
        <View style={{ marginTop: 12 }}>
          <ChangeChip percent={percentChange(values[index], prevDay)} suffix="vs the day before" />
        </View>
      </Card>
    </>
  );
}

// ───────────────────── Month: billing cycles ─────────────────────
function CycleView({ dayMap, cycles, tariff, today, chartHeight, selected, onSelect }) {
  const rows = cycles.map((c) => {
    const units = sumDays(dayMap, c.start, c.end, today);
    return { ...c, units, bill: calcBill(units, tariff).total, current: c.start <= today && today <= c.end };
  });

  const index = selected ?? rows.length - 1;
  const chosen = rows[index];
  const previous = index > 0 ? rows[index - 1] : null;

  // A bill still in progress is compared with the previous one over the same number of days.
  const comparable = (row, prev) => {
    if (!prev) return null;
    if (!row.current) return prev.units;
    const elapsed = diffDays(row.start, today) + 1;
    return sumDays(dayMap, prev.start, prev.end, addDays(prev.start, elapsed - 1));
  };

  const current = rows[rows.length - 1];
  const currentChange = percentChange(current.units, comparable(current, rows[rows.length - 2]));
  const chosenChange = percentChange(chosen.units, comparable(chosen, previous));

  // 20 Aug - 19 Oct -> "Aug–Oct"; a one-month cycle -> "Aug"
  const cycleLabel = (c) => {
    const a = MONTHS[ymd(c.start)[1] - 1];
    const b = MONTHS[ymd(c.end)[1] - 1];
    return a === b ? a : `${a}–${b}`;
  };

  return (
    <>
      <Card>
        <Text style={styles.label}>THIS BILL SO FAR</Text>
        <View style={{ marginTop: 4 }}>
          <Figure value={fmtKwh(current.units)} unit="units" size={40} />
        </View>
        <View style={styles.wrapRow}>
          <ChangeChip percent={currentChange} suffix="vs same point last bill" />
          <Text style={styles.muted}>{formatRange(current.start, current.end)}</Text>
        </View>
      </Card>

      <Card>
        <BarsChart
          data={rows.map((r) => ({ value: r.units, label: cycleLabel(r) }))}
          selected={index}
          onSelect={onSelect}
          height={chartHeight}
        />
      </Card>

      <Card>
        <View style={styles.titleRow}>
          <Text style={styles.detailTitle}>{formatRange(chosen.start, chosen.end)}</Text>
          {chosen.current && <Text style={styles.todayTag}>THIS BILL</Text>}
        </View>
        <View style={[styles.split, { marginTop: 12 }]}>
          <Figure value={fmtKwh(chosen.units)} unit="units" caption={chosen.current ? 'so far' : 'total'} />
          <Figure
            value={formatRupees(chosen.bill)}
            caption={chosen.current ? 'estimated so far' : 'estimated bill'}
            align="flex-end"
          />
        </View>
        <View style={{ marginTop: 12 }}>
          <ChangeChip
            percent={chosenChange}
            suffix={chosen.current ? 'vs same point last bill' : 'vs the bill before'}
          />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  // anything side by side may shrink or wrap, so nothing can push past its card
  col: { flexShrink: 1, minWidth: 0 },
  split: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 10 },
  titleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },

  label: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 1 },
  figure: { fontWeight: '800', color: colors.text, letterSpacing: -0.8, flexShrink: 1 },
  unit: { fontSize: 15, fontWeight: '600', color: colors.textMuted },
  muted: { fontSize: 13, color: colors.textMuted, flexShrink: 1 },
  detailTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  todayTag: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.black,
    backgroundColor: colors.yellow,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    overflow: 'hidden',
    letterSpacing: 0.5,
  },
});
