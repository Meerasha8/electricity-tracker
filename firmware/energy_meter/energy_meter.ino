/*
 * Electricity Tracker: ESP32 + TCRT5000 energy meter reader
 *
 * The TCRT5000 watches your meter and produces one pulse per fixed amount of
 * energy: one per revolution of the spinning disc (its black mark), or one per
 * blink of the pulse LED on a static meter. This sketch
 *
 *   1. counts those pulses (interrupt, with debounce),
 *   2. closes a reading at the end of every clock minute: pulses / PULSES_PER_KWH = kWh,
 *   3. uploads the readings to Supabase's minute_readings table in batches.
 *
 * If Wi-Fi or the internet is down the readings wait in memory (up to 24 h) and
 * are uploaded later with their ORIGINAL timestamps, so the hourly / daily /
 * monthly totals still come out right. Re-sending a minute is harmless: the
 * database ignores duplicates.
 *
 * Wiring (3.3 V!, the module's DO pin must never see 5 V):
 *     TCRT5000 module   VCC -> ESP32 3V3
 *                       GND -> ESP32 GND
 *                       DO  -> ESP32 GPIO 27   (PULSE_PIN below)
 *
 * Setup steps are in firmware/README.md.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

#include "secrets.h"   // copy secrets.example.h -> secrets.h and fill it in
#include "readings.h"

// ════════════════════════════════════════════════════════════════════════
//  SETTINGS: the ones marked ◄ you must check
// ════════════════════════════════════════════════════════════════════════

// ◄ Pulses your meter makes per kWh. Printed on the meter's front plate as
//   "imp/kWh" (LED meters) or "rev/kWh" (disc meters), e.g. 1600 imp/kWh.
constexpr double PULSES_PER_KWH = 1600.0;

// GPIO the module's DO pin is wired to. Avoid GPIO 0, 2, 12, 15 (boot pins).
constexpr int PULSE_PIN = 27;

// Which edge counts as one pulse. Most TCRT5000 modules pull DO LOW when they
// see the reflective surface / light, so FALLING counts once per pulse.
// If you get no pulses or double counts, try RISING.
#define PULSE_EDGE FALLING

// Ignore edges closer together than this. 30 ms is safe up to ~30 pulses per
// second (a 3-phase meter at 3200 imp/kWh reaches ~9/s at 10 kW).
constexpr uint32_t DEBOUNCE_MS = 30;

// Print every pulse to the Serial Monitor. Handy while aiming the sensor;
// set to false once it works.
constexpr bool DEBUG_PULSES = true;

// Minutes with no pulses are not uploaded (they add nothing to the totals).
// Set true if you want a row every minute as a "device is alive" heartbeat.
constexpr bool SEND_IDLE_MINUTES = false;

// How often to upload queued readings, and how many readings per request.
constexpr uint32_t UPLOAD_EVERY_S = 60;
constexpr size_t MAX_PER_REQUEST = 60;

// How many readings to keep in memory while offline (1440 = 24 hours).
constexpr size_t QUEUE_CAPACITY = 1440;

// ════════════════════════════════════════════════════════════════════════

static_assert(PULSES_PER_KWH > 0, "PULSES_PER_KWH must be greater than 0");

constexpr uint32_t MIN_VALID_EPOCH = 1700000000UL;  // anything earlier = clock not set yet

// ── pulse counting (interrupt) ──────────────────────────────────────────
volatile uint32_t pulsesThisMinute = 0;
volatile uint32_t totalPulses = 0;   // since boot, for the debug print
volatile uint32_t lastGapMs = 0;     // time between the last two pulses
volatile uint32_t lastPulseMs = 0;
portMUX_TYPE pulseMux = portMUX_INITIALIZER_UNLOCKED;

void IRAM_ATTR onPulse() {
  const uint32_t now = millis();
  portENTER_CRITICAL_ISR(&pulseMux);
  if (now - lastPulseMs >= DEBOUNCE_MS) {
    lastGapMs = now - lastPulseMs;
    lastPulseMs = now;
    pulsesThisMinute = pulsesThisMinute + 1;
    totalPulses = totalPulses + 1;
  }
  portEXIT_CRITICAL_ISR(&pulseMux);
}

uint32_t takePulses() {
  portENTER_CRITICAL(&pulseMux);
  const uint32_t n = pulsesThisMinute;
  pulsesThisMinute = 0;
  portEXIT_CRITICAL(&pulseMux);
  return n;
}

// ── queue of readings waiting to be uploaded ────────────────────────────
ReadingQueue<QUEUE_CAPACITY> queue;
SemaphoreHandle_t queueLock;

size_t queueSize() {
  xSemaphoreTake(queueLock, portMAX_DELAY);
  const size_t n = queue.size();
  xSemaphoreGive(queueLock);
  return n;
}

void queuePush(const Reading& r) {
  xSemaphoreTake(queueLock, portMAX_DELAY);
  queue.push(r);
  xSemaphoreGive(queueLock);
}

size_t queuePeek(Reading* out, size_t max) {
  xSemaphoreTake(queueLock, portMAX_DELAY);
  const size_t n = queue.peek(out, max);
  xSemaphoreGive(queueLock);
  return n;
}

void queuePop(size_t n) {
  xSemaphoreTake(queueLock, portMAX_DELAY);
  queue.pop(n);
  xSemaphoreGive(queueLock);
}

// ── Wi-Fi ───────────────────────────────────────────────────────────────
bool ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  Serial.println("Wi-Fi: reconnecting...");
  WiFi.disconnect();
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int i = 0; i < 60 && WiFi.status() != WL_CONNECTED; i++) {
    vTaskDelay(pdMS_TO_TICKS(250));
  }
  return WiFi.status() == WL_CONNECTED;
}

// ── upload ──────────────────────────────────────────────────────────────
enum class UploadResult { Ok, Retry, Drop };

// Espressif's built-in list of trusted root certificates (all the major CAs),
// compiled into the ESP32 Arduino core. Supabase's certificate is checked
// against it, so nobody on the network can impersonate Supabase and steal the
// key. (This needs the clock to be set, which uploads already wait for.)
extern const uint8_t rootca_crt_bundle_start[] asm("_binary_x509_crt_bundle_start");
extern const uint8_t rootca_crt_bundle_end[] asm("_binary_x509_crt_bundle_end");

void configureTls(WiFiClientSecure& client) {
  client.setCACertBundle(rootca_crt_bundle_start, rootca_crt_bundle_end - rootca_crt_bundle_start);
}

UploadResult postBatch(const char* body, size_t len) {
  WiFiClientSecure client;
  configureTls(client);

  HTTPClient http;
  http.setConnectTimeout(8000);
  http.setTimeout(15000);
  http.setReuse(false);

  const String url = String(SUPABASE_URL) + "/rest/v1/minute_readings?on_conflict=recorded_at";
  if (!http.begin(client, url)) {
    Serial.println("Upload: could not start the request (check SUPABASE_URL)");
    return UploadResult::Retry;
  }
  http.addHeader("apikey", SUPABASE_SECRET_KEY);
  // Legacy service_role keys are JWTs and go in Authorization too; the newer
  // sb_secret_... keys must be sent in "apikey" only.
  if (strncmp(SUPABASE_SECRET_KEY, "eyJ", 3) == 0) {
    http.addHeader("Authorization", String("Bearer ") + SUPABASE_SECRET_KEY);
  }
  http.addHeader("Content-Type", "application/json");
  // Insert, silently skip minutes that already exist, don't send rows back.
  http.addHeader("Prefer", "resolution=ignore-duplicates,return=minimal");

  const int code = http.POST((uint8_t*)body, len);
  UploadResult result;
  if (code >= 200 && code < 300) {
    result = UploadResult::Ok;
  } else if (code == 400 || code == 413 || code == 422) {
    // The server rejected the data itself; resending can never succeed.
    Serial.printf("Upload: HTTP %d, dropping this batch: %s\n", code, http.getString().substring(0, 200).c_str());
    result = UploadResult::Drop;
  } else {
    // Network trouble, 401/403 (wrong key), 404 (SQL not run yet), 5xx...
    if (code < 0) {
      Serial.printf("Upload: failed (%s), will retry\n", HTTPClient::errorToString(code).c_str());
    } else {
      Serial.printf("Upload: HTTP %d, will retry: %s\n", code, http.getString().substring(0, 200).c_str());
    }
    result = UploadResult::Retry;
  }
  http.end();
  return result;
}

void uploadTask(void*) {
  static Reading batch[MAX_PER_REQUEST];
  static char body[6144];

  for (;;) {
    vTaskDelay(pdMS_TO_TICKS(UPLOAD_EVERY_S * 1000UL));
    if (queueSize() == 0) continue;
    if (!ensureWifi()) {
      Serial.printf("Upload: no Wi-Fi, %u reading(s) waiting\n", (unsigned)queueSize());
      continue;
    }

    while (true) {
      const size_t n = queuePeek(batch, MAX_PER_REQUEST);
      if (n == 0) break;

      const size_t len = buildBatchJson(batch, n, PULSES_PER_KWH, body, sizeof(body));
      if (len == 0) {
        Serial.println("Upload: batch too large for the buffer, dropping it");
        queuePop(n);
        continue;
      }

      const UploadResult r = postBatch(body, len);
      if (r == UploadResult::Retry) break;  // keep the data, try again next round
      queuePop(n);
      if (r == UploadResult::Ok) {
        Serial.printf("Upload: sent %u reading(s), %u left\n", (unsigned)n, (unsigned)queueSize());
      }
    }
  }
}

// ── one minute is over ──────────────────────────────────────────────────
void closeMinute(uint32_t minuteStart, uint32_t pulses) {
  const uint16_t p = pulses > 65535 ? 65535 : (uint16_t)pulses;
  if (p > 0 || SEND_IDLE_MINUTES) queuePush({minuteStart, p});

  char ts[21];
  formatUtc(minuteStart, ts);
  const double kwh = p / PULSES_PER_KWH;
  Serial.printf("[%s] %u pulses = %.6f kWh (avg %.0f W) | queued %u | Wi-Fi %s\n",
                ts, (unsigned)p, kwh, kwh * 60000.0, (unsigned)queueSize(),
                WiFi.status() == WL_CONNECTED ? "ok" : "DOWN");
}

// ── Arduino entry points ────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println("\nElectricity Tracker: meter reader starting");
  Serial.printf("Meter constant: %.0f pulses per kWh (1 pulse = %.7f kWh)\n", PULSES_PER_KWH, 1.0 / PULSES_PER_KWH);

  queueLock = xSemaphoreCreateMutex();

  // Start counting right away, before Wi-Fi is up.
  pinMode(PULSE_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PULSE_PIN), onPulse, PULSE_EDGE);

  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // Real time comes from the internet (UTC; the database does the time-zone work).
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");

  // Uploads run in their own task so a slow connection never delays counting.
  xTaskCreate(uploadTask, "upload", 16384, nullptr, 1, nullptr);
}

void loop() {
  static uint32_t windowStart = 0;     // start of the minute being counted
  static uint32_t lastTimeNag = 0;
  static uint32_t lastSeenPulses = 0;

  if (DEBUG_PULSES) {
    const uint32_t total = totalPulses;
    if (total != lastSeenPulses) {
      Serial.printf("pulse #%lu (%lu ms since previous)\n", (unsigned long)total, (unsigned long)lastGapMs);
      lastSeenPulses = total;
    }
  }

  const uint32_t now = (uint32_t)time(nullptr);
  if (now < MIN_VALID_EPOCH) {
    // Clock not set yet: keep counting pulses, they join the first minute.
    if (millis() - lastTimeNag > 5000) {
      lastTimeNag = millis();
      Serial.printf("Waiting for the internet clock (Wi-Fi %s)...\n",
                    WiFi.status() == WL_CONNECTED ? "connected" : "connecting");
    }
    delay(100);
    return;
  }

  const uint32_t minuteStart = now - (now % 60);
  if (windowStart == 0 || minuteStart < windowStart) {
    windowStart = minuteStart;               // first run (or the clock stepped back)
  } else if (minuteStart > windowStart) {
    closeMinute(windowStart, takePulses());
    windowStart = minuteStart;
  }

  delay(50);
}
