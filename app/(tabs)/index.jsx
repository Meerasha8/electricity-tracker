import {
  View, Text, StyleSheet, ScrollView,
  ActivityIndicator, RefreshControl
} from 'react-native';
import { useEffect, useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BarChart } from 'react-native-gifted-charts';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/StatCard';
import { colors } from '../../constants/colors';

// ── dummy data (used until real ESP32 data arrives) ──────────────────
function getDummyHourly() {
  return Array.from({ length: 24 }, (_, h) => {
    let kwh;
    if (h < 6)                kwh = 0.05 + Math.random() * 0.05;
    else if (h < 9)           kwh = 0.30 + Math.random() * 0.20;
    else if (h < 17)          kwh = 0.15 + Math.random() * 0.10;
    else if (h < 21)          kwh = 0.40 + Math.random() * 0.20;
    else                      kwh = 0.10 + Math.random() * 0.05;
    return { hour: h, kwh: parseFloat(kwh.toFixed(3)) };
  });
}

// ── TANGEDCO bill calculator ──────────────────────────────────────────
function calcBill(units) {
  if (units <= 100) return 0;
  if (units <= 200) return (units - 100) * 1.5 + 50;
  if (units <= 500) return 150 + (units - 200) * 3 + 50;
  return 150 + 900 + (units - 500) * 5 + 50;
}

export default function Dashboard() {
  const [hourlyData, setHourlyData]   = useState([]);
  const [totalKwh, setTotalKwh]       = useState(0);
  const [peakHour, setPeakHour]       = useState(null);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  const loadData = useCallback(async () => {
    try {
      // Try fetching from Supabase first
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('hourly_readings')
        .select('*')
        .gte('recorded_at', `${today}T00:00:00`)
        .order('recorded_at', { ascending: true });

      let readings;

      if (error || !data || data.length === 0) {
        // Fall back to dummy data
        readings = getDummyHourly();
      } else {
        readings = data.map((r, i) => ({
          hour: i,
          kwh: parseFloat(r.kwh),
        }));
      }

      // Calculate totals
      const total = readings.reduce((sum, r) => sum + r.kwh, 0);
      const peak  = readings.reduce((max, r) => r.kwh > max.kwh ? r : max, readings[0]);

      setHourlyData(readings);
      setTotalKwh(parseFloat(total.toFixed(3)));
      setPeakHour(peak);
    } catch (e) {
      // Network issue — still show dummy data
      const readings = getDummyHourly();
      const total = readings.reduce((sum, r) => sum + r.kwh, 0);
      const peak  = readings.reduce((max, r) => r.kwh > max.kwh ? r : max, readings[0]);
      setHourlyData(readings);
      setTotalKwh(parseFloat(total.toFixed(3)));
      setPeakHour(peak);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // Format data for bar chart
  const barData = hourlyData.map((r) => ({
    value: r.kwh,
    label: r.hour % 6 === 0 ? `${r.hour}h` : '',
    frontColor: r.hour === peakHour?.hour ? colors.danger : colors.primary,
  }));

  const estimatedBill = calcBill(totalKwh * 30); // project daily → monthly
  const currentHour   = new Date().getHours();
  const currentUsage  = hourlyData[currentHour]?.kwh ?? 0;

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
          <Text style={styles.greeting}>Good {getTimeOfDay()} ⚡</Text>
          <Text style={styles.date}>{formatDate()}</Text>
        </View>

        {/* Stat Cards Row */}
        <View style={styles.row}>
          <StatCard
            label="Today's Usage"
            value={totalKwh.toFixed(2)}
            unit="kWh"
            color={colors.primary}
          />
          <StatCard
            label="Est. Monthly Bill"
            value={`₹${estimatedBill.toFixed(0)}`}
            unit=""
            color={colors.warning}
          />
        </View>

        {/* Second Row */}
        <View style={styles.row}>
          <StatCard
            label="This Hour"
            value={currentUsage.toFixed(3)}
            unit="kWh"
            color={colors.success}
          />
          <StatCard
            label="Peak Hour"
            value={peakHour ? `${peakHour.hour}:00` : '--'}
            unit={peakHour ? `${peakHour.kwh} kWh` : ''}
            color={colors.danger}
          />
        </View>

        {/* Hourly Bar Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>Today's Hourly Usage</Text>
          <Text style={styles.chartSub}>
            Red bar = peak hour · Pull down to refresh
          </Text>
          {barData.length > 0 && (
            <BarChart
              data={barData}
              barWidth={10}
              spacing={4}
              roundedTop
              xAxisThickness={1}
              yAxisThickness={0}
              xAxisColor={colors.border}
              yAxisTextStyle={{ color: colors.textMuted, fontSize: 10 }}
              xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9 }}
              noOfSections={4}
              maxValue={1.0}
              height={180}
              barBorderRadius={3}
            />
          )}
        </View>

        {/* Usage Status */}
        <View style={[styles.statusBanner, { backgroundColor: getStatusColor(totalKwh) }]}>
          <Text style={styles.statusText}>{getStatusMessage(totalKwh)}</Text>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ── helpers ───────────────────────────────────────────────────────────
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

function formatDate() {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
}

function getStatusColor(kwh) {
  if (kwh < 3)  return '#DCFCE7'; // green
  if (kwh < 6)  return '#FEF9C3'; // yellow
  return '#FEE2E2';               // red
}

function getStatusMessage(kwh) {
  if (kwh < 3)  return '✅ Low usage today — great job!';
  if (kwh < 6)  return '⚠️ Moderate usage — keep an eye on it';
  return '🔴 High usage today — check heavy appliances';
}

// ── styles ────────────────────────────────────────────────────────────
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
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  date: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chartCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
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
  statusBanner: {
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
});