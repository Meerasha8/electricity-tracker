// Billing cycles (a bill covers `months` months, e.g. 2 in Tamil Nadu) and the
// numbers derived from daily readings: units per cycle, cost per day, forecast.
//
// A cycle starts on the same day of the month as the user's last meter-reading
// date (the "anchor") and repeats every `months` months.

import { addDays, addMonths, diffDays, ymd, toDate } from './utils';
import { calcBill } from './tariff';

const pad2 = (n) => String(n).padStart(2, '0');

// Before the user enters a reading date, fall back to calendar pairs
// (Jan-Feb, Mar-Apr, ...) so the app still works.
export function defaultAnchor(today, months) {
  const [y, m] = ymd(today);
  const startMonth0 = (m - 1) - ((m - 1) % months);
  return `${y}-${pad2(startMonth0 + 1)}-01`;
}

function cycleStart(k, anchor, months) {
  return addMonths(anchor, k * months, ymd(anchor)[2]);
}

// Which cycle (by index; 0 = the one starting at the anchor) contains `date`.
function cycleIndexOf(date, anchor, months) {
  const [ay, am] = ymd(anchor);
  const [y, m] = ymd(date);
  let k = Math.floor(((y - ay) * 12 + (m - am)) / months);
  while (cycleStart(k + 1, anchor, months) <= date) k++;
  while (cycleStart(k, anchor, months) > date) k--;
  return k;
}

// -> { index, start, end, days }   (end is the last day of the cycle, inclusive)
function cycleAt(k, anchor, months) {
  const start = cycleStart(k, anchor, months);
  const end = addDays(cycleStart(k + 1, anchor, months), -1);
  return { index: k, start, end, days: diffDays(start, end) + 1 };
}

export function cycleFor(date, anchor, months) {
  return cycleAt(cycleIndexOf(date, anchor, months), anchor, months);
}

// The last `count` cycles up to and including the one containing `today`, oldest first.
export function recentCycles(today, anchor, months, count) {
  const current = cycleIndexOf(today, anchor, months);
  const list = [];
  for (let k = current - count + 1; k <= current; k++) list.push(cycleAt(k, anchor, months));
  return list;
}

// rows: [{ date: 'YYYY-MM-DD', total_kwh }] -> Map(date -> kWh)
export function toDayMap(rows) {
  const map = new Map();
  for (const r of rows || []) map.set(r.date, (map.get(r.date) || 0) + Number(r.total_kwh || 0));
  return map;
}

// Sum of the days from `start` to `end` (inclusive, clipped to `through` if given).
export function sumDays(dayMap, start, end, through) {
  const last = through && through < end ? through : end;
  let total = 0;
  for (const [date, kwh] of dayMap) if (date >= start && date <= last) total += kwh;
  return total;
}

// Estimated cost of each day: what that day's units added to its cycle's bill
// (bill after the day minus bill before it). This is exactly how the bill grows,
// so free units show as ₹0 days and the days that cross a limit cost more.
// -> Map(date -> ₹)
export function dayCosts(dayMap, anchor, tariff) {
  const months = tariff.billingMonths;
  const dates = [...dayMap.keys()].sort();
  const costs = new Map();
  let cycleKey = null;
  let running = 0;
  for (const date of dates) {
    const c = cycleIndexOf(date, anchor, months);
    if (c !== cycleKey) {
      cycleKey = c;
      running = 0;
    }
    const kwh = dayMap.get(date);
    costs.set(date, calcBill(running + kwh, tariff).total - calcBill(running, tariff).total);
    running += kwh;
  }
  return costs;
}

// Percentage change from `previous` to `current`; null when there is nothing to compare with.
export function percentChange(current, previous) {
  if (!(previous > 0)) return null;
  return ((current - previous) / previous) * 100;
}

// Projects the units at the end of the cycle at the pace so far.
// Returns null in the first day of a cycle (too little data to project).
export function forecastUnits(unitsSoFar, cycle, now = new Date()) {
  const elapsedDays = (now.getTime() - toDate(cycle.start).getTime()) / 86400000;
  if (!(elapsedDays >= 1)) return null;
  return Math.max(unitsSoFar, (unitsSoFar / Math.min(elapsedDays, cycle.days)) * cycle.days);
}

