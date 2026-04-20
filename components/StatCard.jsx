import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';

export default function StatCard({ label, value, unit, color }) {
  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text style={[styles.value, { color: color || colors.primary }]}>
          {value}
        </Text>
        <Text style={styles.unit}>{unit}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flex: 1,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  label: {
    fontSize: 12,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
  },
  unit: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
    marginBottom: 4,
  },
});