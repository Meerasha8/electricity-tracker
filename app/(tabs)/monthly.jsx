import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';

// ── dummy data fallback ───────────────────────────────────────────────
function getDummyMonthly() {
  const months = [];
  for (let m = 5; m >= 0; m--) {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - m);
    const kwh  = parseFloat((180 + Math.random() * 60).toFixed(2));
    const bill = calcBill(kwh);
    months.push({
      year:           date.getFullYear(),
      month:          date.getMonth() + 1,
      total_kwh:      kwh,
      estimated_bill: bill,
    });
  }
  return months;
}

// ── TANGEDCO slab calculator ──────────────────────────────────────────
function calcBill(units) {
  if (units <= 100)      return 0;
  if (units <= 200)      return (units - 100) * 1.5 + 50;
  if (units <= 500)      return 150 + (units - 200) * 3 + 50;
  return 150 + 900 + (units - 500) * 5 + 50;
}

// ── slab breakdown ────────────────────────────────────────────────────
function getSlabBreakdown(units) {
  const slabs = [];
  if (units <= 100) {
    slabs.push({ label: '0–100 units', units, rate: 0, cost: 0 });
    return slabs;
  }
  slabs.push({ label: '0–100 units', units: 100, rate: 0, cost: 0 });
  if (units <= 200) {
    slabs.push({ label: '101–200 units', units: units - 100, rate: 1.5, cost: (units - 100) * 1.5 });
    return slabs;
  }
  slabs.push({ label: '101–200 units', units: 100, rate: 1.5, cost: 150 });
  if (units <= 500) {
    slabs.push({ label: '201–500 units', units: units - 200, rate: 3.0, cost: (units - 200) * 3 });
    return slabs;
  }
  slabs.push({ label: '201–500 units', units: 300, rate: 3.0, cost: 900 });
  slabs.push({ label: '500+ units',    units: units - 500, rate: 5.0, cost: (units - 500) * 5 });
  return slabs;
}

const MONTH_NAMES = [
  'Jan','Feb','Mar','Apr','May','Jun',
  'Jul','Aug','Sep','Oct','Nov','Dec'
];

export default function Monthly() {
  const [monthlyData, setMonthlyData] = useState([]);
  const [selected, setSelected]       = useState(null); // selected month
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('monthly_readings')
        .select('*')
        .order('year', { ascending: true })
        .order('month', { ascending: true })
        .limit(6);

      if (error || !data || data.length === 0) {
        const dummy = getDummyMonthly();
        setMonthlyData(dummy);
        setSelected(dummy[dummy.length - 1]);
      } else {
        setMonthlyData(data);
        setSelected(data[data.length - 1]);
      }
    } catch (e) {
      const dummy = getDummyMonthly();
      setMonthlyData(dummy);
      setSelected(dummy[dummy.length - 1]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Line chart data
  const lineData = monthlyData.map((m, i) => ({
    value:      m.total_kwh,
    label:      MONTH_NAMES[m.month - 1],
    dataPointText: m.total_kwh.toFixed(0),
    onPress:    () => setSelected(m),
  }));

  const bestMonth  = monthlyData.length
    ? monthlyData.reduce((min, m) => m.total_kwh < min.total_kwh ? m : min, monthlyData[0])
    : null;
  const worstMonth = monthlyData.length
    ? monthlyData.reduce((max, m) => m.total_kwh > max.total_kwh ? m : max, monthlyData[0])
    : null;

  const slabs = selected ? getSlabBreakdown(selected.total_kwh) : [];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Monthly Usage</Text>
          <Text style={styles.subtitle}>Last 6 months · tap a point to inspect</Text>
        </View>

        {/* Line Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>kWh Trend</Text>
          {lineData.length > 0 && (
            <LineChart
              data={lineData}
              height={200}
              spacing={48}
              color={colors.primary}
              thickness={3}
              startFilled
              startOpacity={0.15}
              endOpacity={0.01}
              areaChart
              dataPointsColor={colors.primary}
              dataPointsRadius={6}
              textShiftY={-8}
              textShiftX={-6}
              textFontSize={11}
              textColor={colors.text}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 11 }}
              xAxisThickness={1}
              yAxisThickness={0}
              xAxisColor={colors.border}
              noOfSections={4}
              curved
            />
          )}
        </View>

        {/* Best / Worst Row */}
        <View style={styles.row}>
          <View style={[styles.highlightCard, { borderColor: colors.success }]}>
            <Text style={styles.highlightEmoji}>✅</Text>
            <Text style={styles.highlightLabel}>Lowest Month</Text>
            <Text style={[styles.highlightMonth, { color: colors.success }]}>
              {bestMonth ? MONTH_NAMES[bestMonth.month - 1] : '--'}
            </Text>
            <Text style={styles.highlightKwh}>
              {bestMonth ? `${bestMonth.total_kwh.toFixed(1)} kWh` : '--'}
            </Text>
          </View>
          <View style={[styles.highlightCard, { borderColor: colors.danger }]}>
            <Text style={styles.highlightEmoji}>🔴</Text>
            <Text style={styles.highlightLabel}>Highest Month</Text>
            <Text style={[styles.highlightMonth, { color: colors.danger }]}>
              {worstMonth ? MONTH_NAMES[worstMonth.month - 1] : '--'}
            </Text>
            <Text style={styles.highlightKwh}>
              {worstMonth ? `${worstMonth.total_kwh.toFixed(1)} kWh` : '--'}
            </Text>
          </View>
        </View>

        {/* Selected Month Detail */}
        {selected && (
          <View style={styles.detailCard}>
            <Text style={styles.detailTitle}>
              {MONTH_NAMES[selected.month - 1]} {selected.year}
            </Text>

            {/* kWh + Bill */}
            <View style={styles.detailRow}>
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Total Usage</Text>
                <Text style={[styles.detailStatValue, { color: colors.primary }]}>
                  {selected.total_kwh.toFixed(2)} kWh
                </Text>
              </View>
              <View style={styles.detailDivider} />
              <View style={styles.detailStat}>
                <Text style={styles.detailStatLabel}>Estimated Bill</Text>
                <Text style={[styles.detailStatValue, { color: colors.warning }]}>
                  ₹{calcBill(selected.total_kwh).toFixed(0)}
                </Text>
              </View>
            </View>

            {/* Slab Breakdown */}
            <Text style={styles.slabTitle}>TANGEDCO Slab Breakdown</Text>
            {slabs.map((slab, i) => (
              <View key={i} style={styles.slabRow}>
                <Text style={styles.slabLabel}>{slab.label}</Text>
                <View style={styles.slabRight}>
                  <Text style={styles.slabUnits}>{slab.units.toFixed(0)} units</Text>
                  <Text style={styles.slabCost}>
                    {slab.cost === 0 ? 'Free' : `₹${slab.cost.toFixed(0)}`}
                  </Text>
                </View>
              </View>
            ))}

            {/* Fixed charge */}
            <View style={[styles.slabRow, styles.fixedRow]}>
              <Text style={styles.slabLabel}>Fixed Charge</Text>
              <Text style={styles.slabCost}>₹50</Text>
            </View>

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Bill</Text>
              <Text style={styles.totalValue}>
                ₹{calcBill(selected.total_kwh).toFixed(0)}
              </Text>
            </View>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    padding: 16,
    paddingBottom: 40,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  highlightCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1.5,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  highlightEmoji: {
    fontSize: 20,
    marginBottom: 4,
  },
  highlightLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  highlightMonth: {
    fontSize: 20,
    fontWeight: '800',
  },
  highlightKwh: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    marginTop: 2,
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  detailTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  detailStat: {
    flex: 1,
    alignItems: 'center',
  },
  detailStatLabel: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  detailStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  detailDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  slabTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  slabRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  fixedRow: {
    borderBottomWidth: 0,
  },
  slabLabel: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '500',
  },
  slabRight: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  slabUnits: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  slabCost: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '700',
    minWidth: 50,
    textAlign: 'right',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 2,
    borderTopColor: colors.primary,
  },
  totalLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.text,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.primary,
  },
});