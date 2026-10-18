# Electrify

Electricity usage tracker for your home (Expo + Supabase). Shows your current
2-month bill with a forecast, today's usage by the hour, and a history of days and
billing cycles. Bill estimates use the Chennai (TANGEDCO) tariff, or your own city's
rates.

Three screens: **Home** (this bill, forecast, near-limit warning, today's chart),
**History** (Week / Month by billing cycle, tap a bar for details), **Settings**
(bill-cycle date, rates, alerts).

## Run it on your phone with Expo Go

**Requirements**

- Node.js 22.13+ (or 24.3+)
- **Expo Go** from the Google Play Store, on an Android phone
- Phone and PC on the **same Wi-Fi**

**1. Point the app at your database.** The Supabase details are built into the app;
people using it never type them in.

```bash
copy .env.example .env      # macOS/Linux: cp .env.example .env
```

Open `.env` and fill in your project URL and the **anon / publishable** key (Supabase
dashboard → Project Settings → API). Never put the `service_role` / secret key here:
anything in the app can be extracted from it.

**2. Start it.**

```bash
npm install
npx expo start -c
```

Open Expo Go, tap **Scan QR code**, and scan the QR shown in the terminal. (Use `-c`
whenever you change `.env`.)

If the phone can't reach the PC (corporate/college Wi-Fi, VPN, or Windows Firewall
blocking Node), use a tunnel instead:

```bash
npm run tunnel
```

### SDK version

This project is on **Expo SDK 57**. The Play Store version of Expo Go only opens
projects from the SDK it was built for. SDK 58 was announced on 15 Oct 2026 and its
Expo Go is rolling out to the stores over the following weeks. Once your Expo Go
updates to 58, this project will show *"Project is incompatible with this version
of Expo Go"*. Either:

- upgrade the project: `npx expo install expo@^58 --fix`, then `npx expo-doctor`, or
- install the SDK 57 build of Expo Go:
  <https://github.com/expo/expo-go-releases/releases/download/Expo-Go-57.0.9/Expo-Go-57.0.9.apk>

## Bills and rates

Tamil Nadu bills **every 2 months**, and the rate you pay depends on the whole bill
(crossing 500 units moves the entire bill to a higher-rate table). Electrify follows
that:

- **Settings → Bill cycle:** enter the date of your last bill or meter reading. Cycles
  then run in 2-month steps from it. Until you do, it assumes Jan–Feb, Mar–Apr, ...
- **Settings → Electricity rates:** **Chennai** uses the TANGEDCO domestic slabs (set
  your connected load for the fixed charge). **My city** lets you type your own
  slabs, fixed charge and billing period; changes save automatically.
- **Check the Chennai rates against your bill.** They come from a secondary, non-official
  source (an article from June 2026 describing the scheme from 10 May 2026: up to 500
  units the first 200 are free; above 500 only the first 100). They are defined in
  [`lib/tariff.js`](lib/tariff.js); if your bill differs, use *My city* or edit that file.
- A day's "est. cost" in History is what that day's units added to its bill, so units
  inside the free slab show ₹0 and the day that crosses a limit costs more.

## Offline behaviour

The app remembers the last data it loaded. With no connection it shows that data
with an "Offline. Showing data from ..." notice, and an empty state with a *Try again*
button if it has never loaded anything.

## Setting up the Supabase database

In your Supabase project open **SQL Editor → New query**, paste the contents of
[`supabase/schema.sql`](supabase/schema.sql), and run it. Data is stored in four
tiers, and each tier is rolled up into the next automatically, the moment a row
arrives:

```
ESP32 ─► minute_readings ─► hourly_readings ─► daily_readings ─► monthly_readings
         raw, kept 30 days   kept forever       kept forever      kept forever
```

| Table | One row per | Columns | Who uses it |
| --- | --- | --- | --- |
| `minute_readings` | reading | `recorded_at`, `kwh` | ESP32 writes here |
| `hourly_readings` | local hour | `recorded_at` (hour start), `kwh` | app reads (Home) |
| `daily_readings` | local day | `date`, `total_kwh` | app reads (Home, History) |
| `monthly_readings` | local month | `year`, `month`, `total_kwh` | not used by the app (bills follow your bill cycle) |

- `kwh` in `minute_readings` is the energy used **since the previous reading**, not
  the meter's running total.
- A nightly job (needs the `pg_cron` extension) deletes minute rows older than 30
  days; the hourly, daily and monthly totals are not affected.
- The app's anon key can only read hourly/daily/monthly. The ESP32 writes with the
  `service_role` key (the file shows the exact request).
- The script also loads about 7 months of sample data (only if the tables are
  empty) so you can try the app before the ESP32 is sending; the file explains how
  to skip or remove it.

## The meter reader (ESP32 + TCRT5000)

The Arduino sketch that counts your meter's pulses and uploads them lives in
[`firmware/`](firmware/README.md): wiring, the one setting you must change
(`PULSES_PER_KWH`), and troubleshooting.

## Later: a standalone APK

Expo Go is for testing. For an installable APK, set an `android.package` in
`app.json` and use [EAS Build](https://docs.expo.dev/build/setup/)
(`eas build -p android --profile preview`). Set `EXPO_PUBLIC_SUPABASE_URL` and
`EXPO_PUBLIC_SUPABASE_KEY` as EAS environment variables so the build includes them.
