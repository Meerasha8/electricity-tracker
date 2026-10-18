// Copy this file to  secrets.h  (same folder) and fill it in.
// secrets.h is git-ignored, so your Wi-Fi password and key are never committed.

// Your 2.4 GHz Wi-Fi (the ESP32 cannot join 5 GHz networks).
#define WIFI_SSID     "your-wifi-name"
#define WIFI_PASSWORD "your-wifi-password"

// Supabase project URL, no trailing slash.
#define SUPABASE_URL  "https://your-project-ref.supabase.co"

// Key used to WRITE readings: the service_role key (legacy JWT starting with
// "eyJ") or a "secret" key (sb_secret_...). Supabase dashboard → Project
// Settings → API Keys. NOT the anon / publishable key; that one is read-only.
// This key can do anything to your database: keep it on the device only.
#define SUPABASE_SECRET_KEY "your-service-role-or-secret-key"
