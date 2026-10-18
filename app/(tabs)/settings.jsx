import { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, TextInput } from '../../components/Text';
import { Card, Loading, PageTitle, Screen, SectionLabel, Segmented } from '../../components/ui';
import { colors, radius } from '../../constants/colors';
import { cycleFor } from '../../lib/billing';
import { clearCache } from '../../lib/cache';
import { loadSettings, resetSettings, useSettings } from '../../lib/settings';
import {
  CHENNAI_PLANS, buildTariff, chennaiFixedCharge, formatRate, validateCustomTariff,
} from '../../lib/tariff';
import { formatRange, formatUserDate, localDateString, parseUserDate } from '../../lib/utils';

const APP_VERSION = '1.0.0';

const toNumber = (text) => {
  const t = String(text ?? '').trim().replace(',', '.');
  return t === '' ? NaN : Number(t);
};

export default function Settings() {
  const { settings, update, setSettings } = useSettings();
  const [version, setVersion] = useState(0); // bumping this rebuilds the form from fresh settings
  if (!settings) return <Loading />;

  const reset = async () => {
    await resetSettings();
    await clearCache();
    setSettings(await loadSettings());
    setVersion((v) => v + 1);
  };

  return <SettingsForm key={version} settings={settings} update={update} onReset={reset} />;
}

function SettingsForm({ settings, update, onReset }) {
  // Text the user is typing (kept as text so half-typed numbers don't get mangled)
  const [dateText, setDateText] = useState(formatUserDate(settings.cycleAnchor));
  const [loadText, setLoadText] = useState(String(settings.connectedLoadKw));
  const [months, setMonths] = useState(String(settings.custom.billingMonths));
  const [fixed, setFixed] = useState(String(settings.custom.fixedCharge));
  const [slabs, setSlabs] = useState(
    settings.custom.slabs.map((s) => ({ upTo: s.upTo == null ? '' : String(s.upTo), rate: String(s.rate) }))
  );
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef(null);

  const save = async (patch) => {
    await update(patch);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), 1500);
  };
  useEffect(() => () => clearTimeout(savedTimer.current), []);

  // ── bill cycle date ──
  const parsedDate = parseUserDate(dateText);
  const dateEmpty = dateText.trim() === '';
  const dateInvalid = !dateEmpty && !parsedDate;
  useEffect(() => {
    if (dateInvalid) return;
    const next = dateEmpty ? null : parsedDate;
    if (next === settings.cycleAnchor) return;
    const t = setTimeout(() => save({ cycleAnchor: next }), 500);
    return () => clearTimeout(t);
  }, [dateText]);

  // ── connected load (Chennai fixed charge) ──
  const load = toNumber(loadText);
  const loadValid = Number.isFinite(load) && load > 0 && load <= 100;
  useEffect(() => {
    if (!loadValid || load === settings.connectedLoadKw) return;
    const t = setTimeout(() => save({ connectedLoadKw: load }), 500);
    return () => clearTimeout(t);
  }, [loadText]);

  // ── custom tariff ──
  const customDraft = {
    billingMonths: toNumber(months),
    fixedCharge: toNumber(fixed),
    slabs: slabs.map((s, i) => ({
      upTo: i === slabs.length - 1 ? null : toNumber(s.upTo),
      rate: toNumber(s.rate),
    })),
  };
  const customError = validateCustomTariff(customDraft);
  useEffect(() => {
    if (customError) return;
    if (JSON.stringify(customDraft) === JSON.stringify(settings.custom)) return;
    const t = setTimeout(() => save({ custom: customDraft }), 600);
    return () => clearTimeout(t);
  }, [months, fixed, slabs]);

  const setSlab = (i, patch) => setSlabs((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSlab = () =>
    setSlabs((list) => {
      const copy = [...list];
      const prevUpTo = Number(copy[copy.length - 2]?.upTo) || 0;
      copy[copy.length - 1] = { upTo: String(prevUpTo + 100), rate: copy[copy.length - 1].rate };
      copy.push({ upTo: '', rate: copy[copy.length - 1].rate });
      return copy;
    });
  const removeSlab = (i) => setSlabs((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : list));

  const mode = settings.tariffMode;
  const tariff = buildTariff(settings);
  const cycle = cycleFor(
    localDateString(),
    parsedDate || settings.cycleAnchor || '2000-01-01',
    tariff.billingMonths
  );

  const confirmReset = () =>
    Alert.alert('Reset Electrify?', 'This clears your bill date, rates and saved offline data on this phone. Your readings in the database are not touched.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: onReset },
    ]);

  return (
    <Screen>
      <View style={styles.titleRow}>
        <View style={{ flexShrink: 1, minWidth: 0 }}>
          <PageTitle title="Settings" />
        </View>
        {saved && (
          <View style={styles.savedPill}>
            <Ionicons name="checkmark" size={13} color={colors.black} />
            <Text style={styles.savedText}>Saved</Text>
          </View>
        )}
      </View>

      {/* ── bill cycle ── */}
      <SectionLabel>Bill cycle</SectionLabel>
      <Card>
        <Text style={styles.fieldLabel}>Last meter-reading date</Text>
        <TextInput
          style={[styles.input, dateInvalid && styles.inputError]}
          value={dateText}
          onChangeText={setDateText}
          placeholder="DD/MM/YYYY"
          placeholderTextColor={colors.textFaint}
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        {dateInvalid ? (
          <Text style={styles.error}>Enter a real date like 05/10/2026.</Text>
        ) : dateEmpty ? (
          <Text style={styles.hint}>
            Not set: bills are assumed to run in calendar pairs (Jan–Feb, Mar–Apr…). Use the date of your
            last bill or meter reading.
          </Text>
        ) : (
          <Text style={styles.hint}>Current bill: {formatRange(cycle.start, cycle.end)}</Text>
        )}
      </Card>

      {/* ── rates ── */}
      <SectionLabel>Electricity rates</SectionLabel>
      <Segmented
        options={[
          { value: 'chennai', label: 'Chennai' },
          { value: 'custom', label: 'My city' },
        ]}
        value={mode}
        onChange={(v) => save({ tariffMode: v })}
      />

      {mode === 'chennai' ? (
        <Card>
          <Text style={styles.cardTitle}>Chennai (TANGEDCO), billed every 2 months</Text>
          {CHENNAI_PLANS.map((plan, i) => (
            <View key={i} style={styles.plan}>
              <Text style={styles.planTitle}>
                {Number.isFinite(plan.maxUnits) ? `Bill up to ${plan.maxUnits} units` : 'Bill over 500 units'}
              </Text>
              {plan.slabs.map((s, j) => {
                const from = (plan.slabs[j - 1]?.upTo ?? 0) + 1;
                const range = Number.isFinite(s.upTo) ? `${from} – ${s.upTo}` : `${from}+`;
                return (
                  <View key={j} style={styles.rateRow}>
                    <Text style={styles.rateRange}>{range} units</Text>
                    <Text style={styles.rateValue} numberOfLines={1}>{formatRate(s.rate)}</Text>
                  </View>
                );
              })}
            </View>
          ))}

          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Connected load (kW)</Text>
          <TextInput
            style={[styles.input, !loadValid && styles.inputError]}
            value={loadText}
            onChangeText={setLoadText}
            placeholder="1"
            placeholderTextColor={colors.textFaint}
            keyboardType="decimal-pad"
            maxLength={5}
          />
          <Text style={loadValid ? styles.hint : styles.error}>
            {loadValid
              ? `Fixed charge: ₹${chennaiFixedCharge(load)} per bill (find your load on your bill)`
              : 'Enter your connected load in kW, for example 1 or 2.5.'}
          </Text>
          <Text style={styles.footnote}>
            Rates as published for the scheme from May 2026, taken from a non-official source. If your
            bill shows different rates, choose “My city” and enter yours.
          </Text>
        </Card>
      ) : (
        <Card>
          <Text style={styles.cardTitle}>Your own rates</Text>
          <Text style={styles.hint}>
            Copy these from your bill. A slab charges its rate for the units between the previous limit and
            its own.
          </Text>

          <View style={styles.twoCols}>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>Bill covers (months)</Text>
              <TextInput
                style={styles.input}
                value={months}
                onChangeText={setMonths}
                keyboardType="number-pad"
                maxLength={2}
              />
            </View>
            <View style={styles.colField}>
              <Text style={styles.fieldLabel}>Fixed charge (₹)</Text>
              <TextInput
                style={styles.input}
                value={fixed}
                onChangeText={setFixed}
                keyboardType="decimal-pad"
                maxLength={7}
              />
            </View>
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 18 }]}>Slabs (units per bill)</Text>
          {slabs.map((s, i) => {
            const last = i === slabs.length - 1;
            const from = i === 0 ? 0 : toNumber(slabs[i - 1].upTo);
            return (
              <View key={i} style={styles.slabRow}>
                {/* The two fields share a line when there is room, and stack when there is not */}
                <View style={styles.slabFields}>
                  <View style={styles.slabGroup}>
                    {last ? (
                      <Text style={styles.slabAbove}>Above {Number.isFinite(from) ? from : '…'}</Text>
                    ) : (
                      <>
                        <Text style={styles.inlineLabel}>Up to</Text>
                        <TextInput
                          style={[styles.input, styles.smallInput]}
                          value={s.upTo}
                          onChangeText={(t) => setSlab(i, { upTo: t })}
                          keyboardType="number-pad"
                          maxLength={5}
                        />
                      </>
                    )}
                  </View>
                  <View style={styles.slabGroup}>
                    <Text style={styles.inlineLabel}>₹</Text>
                    <TextInput
                      style={[styles.input, styles.smallInput]}
                      value={s.rate}
                      onChangeText={(t) => setSlab(i, { rate: t })}
                      keyboardType="decimal-pad"
                      maxLength={6}
                    />
                    <Text style={styles.inlineLabel}>/unit</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => removeSlab(i)}
                  disabled={slabs.length <= 1}
                  hitSlop={8}
                  style={[styles.removeBtn, slabs.length <= 1 && { opacity: 0.25 }]}
                  accessibilityLabel="Remove slab"
                >
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            );
          })}

          <Pressable onPress={addSlab} style={styles.addBtn} accessibilityRole="button">
            <Ionicons name="add" size={18} color={colors.black} />
            <Text style={styles.addText}>Add slab</Text>
          </Pressable>

          {customError ? (
            <Text style={[styles.error, { marginTop: 12 }]}>{customError}</Text>
          ) : (
            <Text style={[styles.hint, { marginTop: 12 }]}>
              {tariff.billingMonths === 1 ? 'Monthly bills.' : `Bills every ${tariff.billingMonths} months.`} Changes save automatically.
            </Text>
          )}
        </Card>
      )}

      {/* ── alerts ── */}
      <SectionLabel>Alerts</SectionLabel>
      <Card>
        <View style={styles.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.cardTitle}>Warn me near a rate limit</Text>
            <Text style={styles.hint}>Shows a notice on Home when your bill is about to move to a higher rate.</Text>
          </View>
          <Switch
            value={settings.warnNearLimit}
            onValueChange={(v) => save({ warnNearLimit: v })}
            trackColor={{ false: '#D6D6D0', true: colors.black }}
            thumbColor={settings.warnNearLimit ? colors.yellow : colors.white}
            ios_backgroundColor="#D6D6D0"
          />
        </View>
      </Card>

      {/* ── about / reset ── */}
      <SectionLabel>About</SectionLabel>
      <Card>
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>App</Text>
          <Text style={styles.aboutValue}>Electrify</Text>
        </View>
        <View style={styles.aboutDivider} />
        <View style={styles.aboutRow}>
          <Text style={styles.aboutLabel}>Version</Text>
          <Text style={styles.aboutValue}>{APP_VERSION}</Text>
        </View>
      </Card>

      <Pressable onPress={confirmReset} style={styles.resetBtn} accessibilityRole="button">
        <Text style={styles.resetText}>Reset settings</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.yellow,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.pill,
    marginTop: 8,
  },
  savedText: { fontSize: 12, fontWeight: '800', color: colors.black },

  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: colors.textMuted, letterSpacing: 0.3, marginBottom: 6 },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 8, lineHeight: 19 },
  error: { fontSize: 13, color: colors.danger, marginTop: 8, lineHeight: 19, fontWeight: '600' },
  footnote: { fontSize: 12, color: colors.textFaint, marginTop: 14, lineHeight: 17 },

  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.small,
    paddingVertical: 11,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: { borderColor: colors.danger },
  smallInput: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, fontSize: 15, minWidth: 56 },

  plan: { marginTop: 16 },
  planTitle: { fontSize: 12, fontWeight: '700', color: colors.textMuted, marginBottom: 4, letterSpacing: 0.3 },
  rateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rateRange: { fontSize: 14, color: colors.text, flexShrink: 1, paddingRight: 8 },
  rateValue: { fontSize: 14, fontWeight: '700', color: colors.text },

  twoCols: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  colField: { flexGrow: 1, flexBasis: 130, minWidth: 0 },
  slabRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  slabFields: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 8, minWidth: 0 },
  slabGroup: { flexGrow: 1, flexBasis: 125, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  inlineLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
  slabAbove: { fontSize: 14, fontWeight: '600', color: colors.text, paddingVertical: 10 },
  removeBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    marginTop: 6,
    backgroundColor: colors.yellow,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
  },
  addText: { fontSize: 14, fontWeight: '700', color: colors.black },

  switchRow: { flexDirection: 'row', alignItems: 'center' },

  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  aboutDivider: { height: 1, backgroundColor: colors.border },
  aboutLabel: { fontSize: 14, color: colors.textMuted },
  aboutValue: { fontSize: 14, fontWeight: '700', color: colors.text },

  resetBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.danger,
    marginTop: 6,
  },
  resetText: { fontSize: 15, fontWeight: '700', color: colors.danger },
});
