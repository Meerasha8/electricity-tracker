import AsyncStorage from '@react-native-async-storage/async-storage';

// Remembers the last data that was loaded successfully so the app can still
// show something (clearly marked as old) when the phone is offline.

const PREFIX = 'electrify:cache:';

export async function saveCache(key, data, savedAt = Date.now()) {
  try {
    await AsyncStorage.setItem(PREFIX + key, JSON.stringify({ savedAt, data }));
  } catch {
    // Not being able to cache is not worth bothering the user about.
  }
}

// -> { savedAt, data } or null
export async function loadCache(key) {
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function clearCache() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX)));
  } catch {
    // ignore
  }
}
