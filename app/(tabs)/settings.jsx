import {
  View, Text, StyleSheet, ScrollView,
  TextInput, TouchableOpacity, Alert,
  Switch, ActivityIndicator
} from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../../constants/colors';

const APP_VERSION = '1.0.0';

export default function Settings() {
  const [supabaseUrl, setSupabaseUrl]   = useState('');
  const [supabaseKey, setSupabaseKey]   = useState('');
  const [useDummy, setUseDummy]         = useState(true);
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);

  // Load saved values on mount
  useEffect(() => {
    const load = async () => {
      const url   = await AsyncStorage.getItem('supabase_url') || '';
      const key   = await AsyncStorage.getItem('supabase_key') || '';
      const dummy = await AsyncStorage.getItem('use_dummy');
      setSupabaseUrl(url);
      setSupabaseKey(key);
      setUseDummy(dummy === null ? true : dummy === 'true');
    };
    load();
  }, []);

  const saveKeys = async () => {
    if (!useDummy && (!supabaseUrl || !supabaseKey)) {
      Alert.alert('Missing Info', 'Please enter both Supabase URL and API key.');
      return;
    }
    setSaving(true);
    await AsyncStorage.setItem('supabase_url', supabaseUrl);
    await AsyncStorage.setItem('supabase_key', supabaseKey);
    await AsyncStorage.setItem('use_dummy', String(useDummy));
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const clearAllData = () => {
    Alert.alert(
      'Clear All Data',
      'This will remove your saved Supabase keys and reset all settings. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.multiRemove([
              'supabase_url',
              'supabase_key',
              'use_dummy',
            ]);
            setSupabaseUrl('');
            setSupabaseKey('');
            setUseDummy(true);
            Alert.alert('Done', 'All settings cleared.');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Configure your app</Text>
        </View>

        {/* Data Source Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DATA SOURCE</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleLeft}>
                <Text style={styles.toggleLabel}>Use Dummy Data</Text>
                <Text style={styles.toggleSub}>
                  {useDummy
                    ? 'Showing simulated data'
                    : 'Using your Supabase database'}
                </Text>
              </View>
              <Switch
                value={useDummy}
                onValueChange={setUseDummy}
                trackColor={{ false: colors.primary, true: colors.border }}
                thumbColor={colors.white}
              />
            </View>
          </View>
        </View>

        {/* Supabase Config */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SUPABASE CONNECTION</Text>
          <View style={styles.card}>

            <Text style={styles.inputLabel}>Project URL</Text>
            <TextInput
              style={styles.input}
              value={supabaseUrl}
              onChangeText={setSupabaseUrl}
              placeholder="https://xxxx.supabase.co"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>Anon API Key</Text>
            <TextInput
              style={[styles.input, styles.keyInput]}
              value={supabaseKey}
              onChangeText={setSupabaseKey}
              placeholder="eyJ..."
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry={true}
              multiline={false}
            />

            <Text style={styles.inputHint}>
              Find these in your Supabase project → Settings → API
            </Text>

            {/* Save Button */}
            <TouchableOpacity
              style={[
                styles.saveBtn,
                saved && { backgroundColor: colors.success }
              ]}
              onPress={saveKeys}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color={colors.white} size="small" />
                : <Text style={styles.saveBtnText}>
                    {saved ? '✅ Saved!' : 'Save Connection'}
                  </Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* Danger Zone */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>DANGER ZONE</Text>
          <View style={styles.card}>
            <Text style={styles.dangerDesc}>
              Clear all saved settings and Supabase keys from this device.
              This does not delete data from your database.
            </Text>
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={clearAllData}
            >
              <Text style={styles.clearBtnText}>🗑 Clear All Settings</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ABOUT</Text>
          <View style={styles.card}>
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>App Name</Text>
              <Text style={styles.aboutValue}>Electricity Tracker</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Version</Text>
              <Text style={styles.aboutValue}>{APP_VERSION}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Meter Type</Text>
              <Text style={styles.aboutValue}>TANGEDCO 3-Phase</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>Built with</Text>
              <Text style={styles.aboutValue}>Expo + Supabase</Text>
            </View>
          </View>
        </View>

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
  header: {
    marginBottom: 24,
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
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  toggleLeft: {
    flex: 1,
    marginRight: 12,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
  },
  toggleSub: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.background,
  },
  keyInput: {
    fontFamily: 'monospace',
    fontSize: 12,
  },
  inputHint: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 8,
    marginBottom: 16,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  saveBtnText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  dangerDesc: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 14,
  },
  clearBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  clearBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 15,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
  },
  aboutLabel: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '500',
  },
  aboutValue: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '700',
  },
});