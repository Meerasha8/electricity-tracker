import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildTariff } from './tariff';
import { defaultAnchor } from './billing';
import { localDateString } from './utils';

const KEY = 'electrify:settings:v1';

// Keys saved by earlier builds, when people typed the Supabase URL/key into the app.
const LEGACY_KEYS = ['supabase_url', 'supabase_key', 'use_dummy'];

const DEFAULT_SETTINGS = {
  tariffMode: 'chennai',      // 'chennai' | 'custom'
  connectedLoadKw: 1,         // sets the fixed charge for the Chennai tariff
  cycleAnchor: null,          // 'YYYY-MM-DD' last meter-reading date; null = calendar pairs
  warnNearLimit: true,        // show the "close to a rate limit" notice on Home
  custom: {                   // "my city" tariff
    billingMonths: 2,
    fixedCharge: 0,
    slabs: [
      { upTo: 100, rate: 0 },
      { upTo: 200, rate: 2.5 },
      { upTo: null, rate: 5 },
    ],
  },
};

function merge(saved) {
  const s = saved && typeof saved === 'object' ? saved : {};
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    custom: {
      ...DEFAULT_SETTINGS.custom,
      ...(s.custom || {}),
      slabs: Array.isArray(s.custom?.slabs) && s.custom.slabs.length ? s.custom.slabs : DEFAULT_SETTINGS.custom.slabs,
    },
  };
}

export async function loadSettings() {
  try {
    AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => {});   // don't leave an old key lying around
    const raw = await AsyncStorage.getItem(KEY);
    return merge(raw ? JSON.parse(raw) : null);
  } catch {
    return merge(null);
  }
}

async function saveSettings(settings) {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}

export async function resetSettings() {
  await AsyncStorage.removeItem(KEY);
}

// Everything the screens derive from the saved settings.
export function deriveBilling(settings, today = localDateString()) {
  const tariff = buildTariff(settings);
  const anchorIsDefault = !settings.cycleAnchor;
  const anchor = settings.cycleAnchor || defaultAnchor(today, tariff.billingMonths);
  return { tariff, anchor, anchorIsDefault };
}

// Loads the settings every time the tab is shown, so a change made in Settings
// is visible on Home / History straight away. `settings` is null until loaded.
export function useSettings() {
  const [settings, setSettings] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      loadSettings().then((s) => active && setSettings(s));
      return () => {
        active = false;
      };
    }, [])
  );

  const update = useCallback(async (patch) => {
    const next = await loadSettings().then((current) => merge({ ...current, ...patch }));
    setSettings(next);
    await saveSettings(next);
    return next;
  }, []);

  return { settings, update, setSettings };
}
