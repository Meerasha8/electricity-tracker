// Date helpers. All dates in the app are local calendar dates written as
// 'YYYY-MM-DD' strings (toISOString() would give the UTC day, which is the wrong
// day for part of every day in India).

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (n) => String(n).padStart(2, '0');

export function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

// 'YYYY-MM-DD' -> [year, month(1-12), day]
export function ymd(str) {
  const [y, m, d] = str.split('-').map(Number);
  return [y, m, d];
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate(); // month is 1-12; day 0 = last day of that month
}

// Local midnight of a 'YYYY-MM-DD' string.
export function toDate(str) {
  const [y, m, d] = ymd(str);
  return new Date(y, m - 1, d);
}

export function addDays(str, n) {
  const [y, m, d] = ymd(str);
  return localDateString(new Date(y, m - 1, d + n));
}

// Whole days from a to b (negative if b is earlier). Done in UTC so daylight
// saving changes can't make a day 23 or 25 hours long.
export function diffDays(a, b) {
  const [ay, am, ad] = ymd(a);
  const [by, bm, bd] = ymd(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Same day-of-month `n` months later (clamped: 31 Jan + 1 month = 28/29 Feb).
// `keepDay` lets a series of cycles stay on the original day (e.g. always the 31st).
export function addMonths(str, n, keepDay) {
  const [y, m, d] = ymd(str);
  const index = y * 12 + (m - 1) + n;
  const ny = Math.floor(index / 12);
  const nm = (index % 12) + 1;
  const day = Math.min(keepDay ?? d, daysInMonth(ny, nm));
  return `${ny}-${pad2(nm)}-${pad2(day)}`;
}

export function formatDayMonth(str) {
  const [, m, d] = ymd(str);
  return `${d} ${MONTHS[m - 1]}`;
}

export function formatWeekday(str) {
  return WEEKDAYS[toDate(str).getDay()];
}

// '5 Oct - 4 Dec' (adds the year when the two ends are in different years)
export function formatRange(a, b) {
  const [ay] = ymd(a);
  const [by] = ymd(b);
  return ay === by
    ? `${formatDayMonth(a)} – ${formatDayMonth(b)}`
    : `${formatDayMonth(a)} ${ay} – ${formatDayMonth(b)} ${by}`;
}

// 'DD/MM/YYYY' typed by the user -> 'YYYY-MM-DD', or null if it isn't a real date.
export function parseUserDate(text) {
  const match = /^\s*(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})\s*$/.exec(text || '');
  if (!match) return null;
  const d = Number(match[1]);
  const m = Number(match[2]);
  const y = Number(match[3]);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function formatUserDate(str) {
  if (!str) return '';
  const [y, m, d] = ymd(str);
  return `${pad2(d)}/${pad2(m)}/${y}`;
}

// 'x min ago', 'x h ago', or a date for anything older than a day.
export function timeAgo(timestampMs, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - timestampMs) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const d = new Date(timestampMs);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
