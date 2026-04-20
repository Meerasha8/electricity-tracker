import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-gifted-charts';
import { supabase } from '../../lib/supabase';
import { colors } from '../../constants/colors';

// ── dummy data fallback ───────────────────────────────────────────────
function getDummyDaily() {
  const days = [];
  for (let d = 6; d >= 0; d--) {
    const date = new Date();
    date.setDate(date.getDate() - d);
    const isWeekend = [0, 6].includes(date.getDay());
    const kwh = isWeekend
      ? parseFloat((8 + Math.random() * 4).toFixed(3))
      : parseFloat((5 + Math.random() * 3).toFixed(3));
    days.push({ date: date.toISOString().split('T')[0], total_kwh: kwh });
  }
  return days;
}

// ── TANGEDCO bill for a single day (prorated) ─────────────────────────
function calcDailyBill(kwh) {
  const monthly = kwh * 30;
  let bill;
  if (monthly <= 100)      bill = 0;
  else if (monthly <= 200) bill = (monthly - 100) * 1.5 + 50;
  else if (monthly <= 500) bill = 150 + (monthly - 200) * 3 + 50;
  else                     bill = 150 + 900 + (monthly - 500) * 5 + 50;
  return parseFloat((bill / 30).toFixed(2)); // back to daily cost
}

// ── format date label ─────────────────────────────────────────────────
function formatDayLabel(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { weekday: 'short' });
}

function formatFullDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', weekday: 'short'
  });
}

export default function Daily() {
  const [dailyData, setDailyData]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      const fromDate = sevenDaysAgo.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('daily_readings')
        .select('*')
        .gte('date', fromDate)
        .order('date', { ascending: true });

      if (error || !data || data.length === 0) {
        setDailyData(getDummyDaily());
      } else {
        setDailyData(data);
      }
    } catch (e) {
      setDailyData(getDummyDaily());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Find best and worst day
  const bestDay  = dailyData.length
    ? dailyData.reduce((min, d) => d.total_kwh < min.total_kwh ? d : min, dailyData[0])
    : null;
  const worstDay = dailyData.length
    ? dailyData.reduce((max, d) => d.total_kwh > max.total_kwh ? d : max, dailyData[0])
    : null;

  // Bar chart data
  const barData = dailyData.map((d) => ({
    value: d.total_kwh,
    label: formatDayLabel(d.date),
    frontColor:
      d.date === bestDay?.date  ? colors.success :
      d.date === worstDay?.date ? colors.danger  : colors.primary,
  }));

  const weekTotal = dailyData.reduce((sum, d) => sum + d.total_kwh, 0);
  const weekAvg   = dailyData.length ? weekTotal / dailyData.length : 0;

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
          <Text style={styles.title}>Daily Usage</Text>
          <Text style={styles.subtitle}>Last 7 days</Text>
        </View>

        {/* Summary Row */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Week Total</Text>
            <Text style={[styles.summaryValue, { color: colors.primary }]}>
              {weekTotal.toFixed(2)} kWh
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Daily Avg</Text>
            <Text style={[styles.summaryValue, { color: colors.warning }]}>
              {weekAvg.toFixed(2)} kWh
            </Text>
          </View>
        </View>

        {/* Bar Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Last 7 Days</Text>
          <Text style={styles.chartSub}>
            🟢 Best day · 🔴 Highest day · 🔵 Normal
          </Text>
          {barData.length > 0 && (
            <BarChart
              data={barData}
              barWidth={32}
              spacing={12}
              roundedTop
              xAxisThickness={1}
              yAxisThickness={0}
              xAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 11 }}
              noOfSections={4}
              height={200}
              barBorderRadius={6}
            />
          )}
        </View>

        {/* Day List */}
        <Text style={styles.listTitle}>Breakdown</Text>
        {dailyData.map((day) => {
          const bill     = calcDailyBill(day.total_kwh);
          const isBest   = day.date === bestDay?.date;
          const isWorst  = day.date === worstDay?.date;
          const isToday  = day.date === new Date().toISOString().split('T')[0];

          return (
            <View key={day.date} style={styles.dayRow}>
              {/* Left: date */}
              <View style={styles.dayLeft}>
                <Text style={styles.dayDate}>{formatFullDate(day.date)}</Text>
                {isToday && (
                  <View style={styles.todayBadge}>
                    <Text style={styles.todayBadgeText}>Today</Text>
                  </View>
                )}
              </View>

              {/* Right: kwh + cost + badge */}
              <View style={styles.dayRight}>
                <Text style={styles.dayKwh}>{day.total_kwh.toFixed(2)} kWh</Text>
                <Text style={styles.dayCost}>₹{bill}</Text>
                {isBest  && <Text style={styles.bestBadge}>✅ Best</Text>}
                {isWorst && <Text style={styles.worstBadge}>🔴 High</Text>}
              </View>
            </View>
          );
        })}

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
    paddingBottom: 32,
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
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
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
    marginBottom: 4,
  },
  chartSub: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  dayRow: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  dayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayDate: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  todayBadge: {
    backgroundColor: colors.primaryLight,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  todayBadgeText: {
    fontSize: 10,
    color: colors.primary,
    fontWeight: '700',
  },
  dayRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  dayKwh: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  dayCost: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
  },
  bestBadge: {
    fontSize: 11,
    color: colors.success,
    fontWeight: '700',
  },
  worstBadge: {
    fontSize: 11,
    color: colors.danger,
    fontWeight: '700',
  },
});