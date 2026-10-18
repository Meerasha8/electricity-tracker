import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Text } from './Text';
import { colors } from '../constants/colors';

const LABEL_WIDTH = 44;

// A clean bar chart: no axis numbers or grid, just bars and labels. It measures
// the space it is given, so it fits any screen width.
//   data:     [{ value, label }]
//   selected: index of the highlighted (yellow) bar, if any
//   onSelect: makes the bars tappable
//   labelEvery: show every Nth label (24 hourly bars would not fit all of them)
export default function BarsChart({ data, selected, onSelect, height = 150, labelEvery = 1 }) {
  const [width, setWidth] = useState(0);

  const n = data.length;
  const slot = n ? width / n : 0;
  const barWidth = Math.max(4, slot * 0.62);
  const spacing = Math.max(2, slot - barWidth);
  const max = Math.max(...data.map((d) => d.value), 0);

  // Labels are drawn wider than their bar and shifted back so they stay centred under it
  // (24 hourly bars are only a few pixels wide, too narrow for text like "12p"). The first
  // and last labels line up with the chart edges instead so they are never cut off.
  const labelAt = (i, label) => {
    const first = i === 0;
    const last = i === n - 1;
    const shift = first ? 0 : last ? -(LABEL_WIDTH - barWidth) : -(LABEL_WIDTH - barWidth) / 2;
    return (
      <View
        style={{
          width: LABEL_WIDTH,
          marginLeft: shift,
          alignItems: first ? 'flex-start' : last ? 'flex-end' : 'center',
        }}
      >
        <Text style={styles.xLabel} numberOfLines={1}>{label}</Text>
      </View>
    );
  };

  const items = data.map((d, i) => ({
    value: d.value,
    label: i % labelEvery === 0 ? d.label : '',
    labelComponent: i % labelEvery === 0 && d.label ? () => labelAt(i, d.label) : undefined,
    frontColor: i === selected ? colors.yellow : colors.barIdle,
    onPress: onSelect ? () => onSelect(i) : undefined,
  }));

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ minHeight: height }}>
      {width > 0 && n > 0 && (
        <BarChart
          data={items}
          width={width}
          height={height}
          barWidth={barWidth}
          spacing={spacing}
          initialSpacing={spacing / 2}
          endSpacing={0}
          barBorderRadius={Math.min(6, barWidth / 2)}
          maxValue={max > 0 ? max * 1.15 : 1}
          noOfSections={1}
          hideRules
          hideYAxisText
          hideOrigin
          yAxisThickness={0}
          yAxisLabelWidth={0}
          xAxisThickness={1}
          xAxisColor={colors.border}
          disableScroll
          isAnimated={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  xLabel: { color: colors.textMuted, fontSize: 11 },
});
