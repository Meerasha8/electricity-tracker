import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors } from '../constants/colors';
import { formatRate, pickPlan } from '../lib/tariff';

const GAP = 3;
const MIN_SHARE = 0.22; // no slab gets less than this share of the bar, so its labels fit

// Progress through the rate slabs of a bill, drawn on a dark card:
//   [#####|##      |    ]     how many units used, and where each price starts.
// A tariff can have many slabs (Chennai above 500 units has seven). They would not
// be readable side by side on a phone, so only the previous, current and next slab
// are drawn when there are more than fit.
export default function SlabBar({ tariff, units }) {
  const [width, setWidth] = useState(0);
  const plan = pickPlan(units, tariff);

  // Every slab as a segment. The open-ended top slab gets enough room to show the units.
  const all = [];
  let from = 0;
  plan.slabs.forEach((slab) => {
    const to = Number.isFinite(slab.upTo)
      ? slab.upTo
      : Math.max(units * 1.08, from + Math.max(50, from * 0.25));
    all.push({
      from,
      to,
      upTo: slab.upTo,
      rate: slab.rate,
      fill: Math.min(1, Math.max(0, (units - from) / (to - from))),
    });
    from = Number.isFinite(slab.upTo) ? slab.upTo : to;
  });

  const maxSegments = width >= 300 ? 4 : 3;
  let segments = all;
  if (all.length > maxSegments) {
    const found = all.findIndex((s) => units < s.to);
    const current = found === -1 ? all.length - 1 : found;
    const end = Math.min(all.length, Math.max(current + 2, maxSegments));
    segments = all.slice(end - maxSegments, end);
  }

  // Widths: proportional to each slab's size, but never too thin to label.
  const ranges = segments.map((s) => s.to - s.from);
  const rangeSum = ranges.reduce((a, b) => a + b, 0);
  const weights = ranges.map((r) => Math.max(r, rangeSum * MIN_SHARE));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const usable = Math.max(0, width - GAP * (segments.length - 1));
  const widthOf = (i) => (weights[i] / weightSum) * usable;

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <View style={styles.row}>
            {segments.map((s, i) => (
              <View
                key={i}
                style={[styles.track, { width: widthOf(i), marginRight: i < segments.length - 1 ? GAP : 0 }]}
              >
                <View style={[styles.fill, { width: `${s.fill * 100}%` }]} />
              </View>
            ))}
          </View>
          <View style={[styles.row, { marginTop: 8 }]}>
            {segments.map((s, i) => (
              <View key={i} style={{ width: widthOf(i), marginRight: i < segments.length - 1 ? GAP : 0 }}>
                <View style={styles.between}>
                  <Text style={styles.number} numberOfLines={1}>{s.from}</Text>
                  {i === segments.length - 1 && Number.isFinite(s.upTo) ? (
                    <Text style={styles.number} numberOfLines={1}>{s.upTo}</Text>
                  ) : null}
                </View>
                <Text style={styles.rate} numberOfLines={1}>{formatRate(s.rate)}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row' },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.trackDark, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: colors.yellow },
  number: { fontSize: 11, fontWeight: '600', color: colors.onDarkMuted },
  rate: { fontSize: 11, color: colors.textFaint, marginTop: 1 },
});
