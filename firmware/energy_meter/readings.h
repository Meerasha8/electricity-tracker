// Plain C++ with no Arduino/ESP32 dependencies: the queue of unsent readings,
// UTC timestamp formatting and the JSON body sent to Supabase.
#pragma once

#include <stddef.h>
#include <stdint.h>
#include <stdio.h>

// One closed minute of pulses.
struct Reading {
  uint32_t minuteStart;  // UTC epoch seconds, always a multiple of 60
  uint16_t pulses;       // meter pulses counted during that minute
};

// Fixed-size first-in-first-out queue. When it is full the OLDEST entry is
// dropped, so the newest data always wins. Not thread-safe: lock around it.
template <size_t CAPACITY>
class ReadingQueue {
 public:
  void push(const Reading& r) {
    if (count_ == CAPACITY) {
      head_ = (head_ + 1) % CAPACITY;
      count_--;
      dropped_++;
    }
    items_[(head_ + count_) % CAPACITY] = r;
    count_++;
  }

  size_t size() const { return count_; }
  uint32_t dropped() const { return dropped_; }

  // Copies up to `max` of the oldest entries into `out` (does not remove them).
  size_t peek(Reading* out, size_t max) const {
    size_t n = count_ < max ? count_ : max;
    for (size_t i = 0; i < n; i++) out[i] = items_[(head_ + i) % CAPACITY];
    return n;
  }

  // Removes the `n` oldest entries (after they were uploaded).
  void pop(size_t n) {
    if (n > count_) n = count_;
    head_ = (head_ + n) % CAPACITY;
    count_ -= n;
  }

 private:
  Reading items_[CAPACITY];
  size_t head_ = 0;
  size_t count_ = 0;
  uint32_t dropped_ = 0;
};

// Writes "2026-10-18T10:15:00Z" (21 bytes including the terminator).
// Done by hand (civil-from-days) so it does not depend on libc time zones.
inline void formatUtc(uint32_t epoch, char out[21]) {
  const uint32_t days = epoch / 86400UL;
  const uint32_t secs = epoch % 86400UL;

  const int64_t z = (int64_t)days + 719468;
  const int64_t era = (z >= 0 ? z : z - 146096) / 146097;
  const unsigned doe = (unsigned)(z - era * 146097);
  const unsigned yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
  int y = (int)yoe + (int)(era * 400);
  const unsigned doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  const unsigned mp = (5 * doy + 2) / 153;
  const unsigned d = doy - (153 * mp + 2) / 5 + 1;
  const unsigned m = mp < 10 ? mp + 3 : mp - 9;
  if (m <= 2) y++;
  if (y < 0) y = 0;        // cannot happen for a 32-bit epoch; keeps the text a fixed width
  if (y > 9999) y = 9999;

  char tmp[48];
  snprintf(tmp, sizeof(tmp), "%04d-%02u-%02uT%02u:%02u:%02uZ", y, m, d,
           (unsigned)(secs / 3600), (unsigned)((secs % 3600) / 60), (unsigned)(secs % 60));
  for (int i = 0; i < 20; i++) out[i] = tmp[i];
  out[20] = '\0';
}

// Builds the request body:
//   [{"recorded_at":"2026-10-18T10:15:00Z","kwh":0.0018750},{...}]
// Every object has both keys (required for a bulk insert). kWh has 7 decimals
// so a single pulse is never rounded. Returns the length, or 0 if it did not fit.
inline size_t buildBatchJson(const Reading* items, size_t n, double pulsesPerKwh,
                             char* out, size_t cap) {
  if (cap < 3) return 0;
  size_t pos = 0;
  out[pos++] = '[';
  for (size_t i = 0; i < n; i++) {
    char ts[21];
    formatUtc(items[i].minuteStart, ts);
    const int w = snprintf(out + pos, cap - pos,
                           "%s{\"recorded_at\":\"%s\",\"kwh\":%.7f}",
                           i ? "," : "", ts, (double)items[i].pulses / pulsesPerKwh);
    if (w < 0 || (size_t)w >= cap - pos) return 0;
    pos += (size_t)w;
  }
  if (pos + 2 > cap) return 0;
  out[pos++] = ']';
  out[pos] = '\0';
  return pos;
}
