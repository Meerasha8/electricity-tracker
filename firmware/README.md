# ESP32 meter reader (TCRT5000)

Sketch: [`energy_meter/energy_meter.ino`](energy_meter/energy_meter.ino). Open that file in
Arduino IDE; the other files in the folder open as tabs.

It counts the pulses from your electricity meter, turns them into kWh once a minute, and
uploads them to the `minute_readings` table. Nothing else to install: it only uses
libraries that come with the ESP32 board package (built and checked with ESP32 core 3.3.11).

## 1. Prepare Supabase

Run [`supabase/schema.sql`](../supabase/schema.sql) in the Supabase SQL Editor. **Run it again
even if you already did**: this version adds a unique timestamp per reading (safe retries) and
7-decimal precision (so one pulse isn't rounded).

## 2. Wire it (3.3 V only)

| TCRT5000 module | ESP32 |
| --- | --- |
| VCC | 3V3 |
| GND | GND |
| DO | GPIO 27 |

Power it from **3V3, not 5V**: the DO pin would then output 5 V into a 3.3 V-only GPIO.

## 3. Configure

1. Copy `energy_meter/secrets.example.h` to `energy_meter/secrets.h` and fill in your 2.4 GHz
   Wi-Fi, project URL, and the **service_role / secret key** (Supabase → Project Settings →
   API Keys). `secrets.h` is git-ignored. Never use that key in the phone app.
2. In `energy_meter.ino`, set **`PULSES_PER_KWH`** to the number printed on your meter's front
   plate: `imp/kWh` for a blinking-LED meter or `rev/kWh` for a spinning-disc meter. This is
   the only setting that affects accuracy.

## 4. Upload

Arduino IDE → Tools → Board → **ESP32 Dev Module** → pick the port → Upload. Open the Serial
Monitor at **115200 baud**.

## 5. Aim the sensor

- **Disc meter:** point it at the disc's black mark from about 5–10 mm. **LED meter:** point it
  at the pulse LED (usually labelled imp), shielded from room light with tape or a small tube.
- Turn the little blue potentiometer on the module until its onboard LED switches **once per
  revolution / blink** and not in between.
- With `DEBUG_PULSES` on, the Serial Monitor prints `pulse #N (... ms since previous)` for each
  pulse. Switch on a heater for a minute: you should see the pulses speed up.

## What you'll see

```
[2026-10-18T10:15:00Z] 7 pulses = 0.004375 kWh (avg 262 W) | queued 1 | Wi-Fi ok
Upload: sent 1 reading(s), 0 left
```

Check the `avg ... W` against what you expect from your appliances. If it is wrong by a
fixed factor, `PULSES_PER_KWH` is wrong.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| No pulses | Re-aim, adjust the potentiometer, or change `PULSE_EDGE` to `RISING`. |
| About double the pulses | Lower sensitivity (potentiometer) or raise `DEBOUNCE_MS`. |
| `Upload: HTTP 401` | Wrong key. It must be the service_role / secret key, not anon. |
| `Upload: HTTP 404` | `schema.sql` has not been run. Readings wait in memory (up to 24 h). |
| `Upload: failed (connection refused / -1)` | Check `SUPABASE_URL` and the Wi-Fi signal. |
| `Waiting for the internet clock` forever | Wi-Fi not connected, or it is a 5 GHz network. |

## Good to know

- Readings made while offline are kept in memory and uploaded later with their **original
  times**. They are lost only if the ESP32 loses power before they are sent (and the minute
  being counted at that moment).
- Minutes with no pulses are not uploaded (they add nothing). Turn on `SEND_IDLE_MINUTES` for a
  row every minute.
- The Supabase certificate is verified against Espressif's built-in list of trusted
  authorities, so the key can't be intercepted on the network.
