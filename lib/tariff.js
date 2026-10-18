// Electricity tariffs and bill maths.
//
// A tariff is billed per billing period (every 2 months in Tamil Nadu) and has
// one or more "plans". Which plan applies depends on the TOTAL units in the
// bill (Chennai: 500 units or fewer use one table, more than 500 use another).
// Inside a plan the slabs are telescopic: each unit is charged at the rate of
// the slab it falls in.

// Chennai (TANGEDCO / TNPDCL) domestic. Rates in ₹ per unit, per 2-month bill.
// Source: a secondary article (verified.realestate.com, updated 8 Jun 2026)
// describing the scheme in force from 10 May 2026. NOT from an official TNERC /
// TNPDCL page: check against your bill and edit if needed.
export const CHENNAI_PLANS = [
  {
    maxUnits: 500,
    slabs: [
      { upTo: 200, rate: 0 },
      { upTo: 400, rate: 4.7 },
      { upTo: 500, rate: 6.3 },
    ],
  },
  {
    maxUnits: Infinity,
    slabs: [
      { upTo: 100, rate: 0 },
      { upTo: 400, rate: 4.7 },
      { upTo: 500, rate: 6.3 },
      { upTo: 600, rate: 8.4 },
      { upTo: 800, rate: 9.45 },
      { upTo: 1000, rate: 10.5 },
      { upTo: Infinity, rate: 11.55 },
    ],
  },
];

// Fixed charge per bill by connected load: up to 500 W ₹30, up to 1 kW ₹45,
// above that ₹45 plus ₹30 for each extra kW (part of a kW counts as a full one).
export function chennaiFixedCharge(loadKw) {
  const kw = Number(loadKw) || 0;
  if (kw <= 0.5) return 30;
  if (kw <= 1) return 45;
  return 45 + 30 * Math.ceil(kw - 1);
}

// Builds the tariff the app should use from the saved settings.
export function buildTariff(settings) {
  if (settings.tariffMode === 'custom') {
    const c = settings.custom;
    return {
      id: 'custom',
      name: 'My city',
      billingMonths: c.billingMonths,
      fixedCharge: c.fixedCharge,
      plans: [
        {
          maxUnits: Infinity,
          slabs: c.slabs.map((s) => ({ upTo: s.upTo == null ? Infinity : s.upTo, rate: s.rate })),
        },
      ],
    };
  }
  return {
    id: 'chennai',
    name: 'Chennai (TANGEDCO)',
    billingMonths: 2,
    fixedCharge: chennaiFixedCharge(settings.connectedLoadKw),
    plans: CHENNAI_PLANS,
  };
}

// Checks a custom tariff typed in Settings. Returns an error message, or null if it is fine.
export function validateCustomTariff(c) {
  if (!Number.isInteger(c.billingMonths) || c.billingMonths < 1 || c.billingMonths > 12) {
    return 'Billing period must be a whole number of months (1 to 12).';
  }
  if (!(c.fixedCharge >= 0)) return 'Fixed charge must be 0 or more.';
  if (!c.slabs.length) return 'Add at least one slab.';
  let prev = 0;
  for (let i = 0; i < c.slabs.length; i++) {
    const s = c.slabs[i];
    const last = i === c.slabs.length - 1;
    if (!(s.rate >= 0)) return `Slab ${i + 1}: rate must be 0 or more.`;
    if (last) {
      if (s.upTo != null) return 'The last slab must have no upper limit.';
    } else {
      if (!(s.upTo > prev)) return `Slab ${i + 1}: "up to" must be higher than the previous slab.`;
      prev = s.upTo;
    }
  }
  return null;
}

export function pickPlan(units, tariff) {
  return tariff.plans.find((p) => units <= p.maxUnits) || tariff.plans[tariff.plans.length - 1];
}

// Bill for `units` in one billing period.
// -> { units, plan, energy, fixed, total, slabs: [{ from, upTo, units, rate, cost }] }
export function calcBill(units, tariff) {
  const u = Math.max(0, Number(units) || 0);
  const plan = pickPlan(u, tariff);
  const slabs = [];
  let energy = 0;
  let from = 0;
  for (const s of plan.slabs) {
    if (u <= from) break;
    const n = Math.min(u, s.upTo) - from;
    if (n > 0) {
      const cost = n * s.rate;
      slabs.push({ from, upTo: s.upTo, units: n, rate: s.rate, cost });
      energy += cost;
    }
    from = s.upTo;
    if (u <= s.upTo) break;
  }
  return { units: u, plan, energy, fixed: tariff.fixedCharge, total: energy + tariff.fixedCharge, slabs };
}

// The next point where the price per unit goes up, for the "you're close to a
// limit" warning. `planChange` is true when passing it moves the WHOLE bill to
// the next plan (Chennai at 500 units), which costs far more than one slab step.
// -> { at, remaining, rate, nextRate, planChange, jump } or null
export function nextLimit(units, tariff) {
  const plan = pickPlan(units, tariff);
  for (let i = 0; i < plan.slabs.length; i++) {
    const s = plan.slabs[i];
    if (s.upTo === Infinity) return null;
    if (units < s.upTo) {
      const planChange = plan.maxUnits === s.upTo;
      const nextRate = planChange ? null : plan.slabs[i + 1]?.rate;
      const rises = planChange || (nextRate != null && nextRate > s.rate);
      if (!rises) return null;
      return {
        at: s.upTo,
        remaining: s.upTo - units,
        rate: s.rate,
        nextRate,
        planChange,
        // extra cost of ONE more unit past the limit (for a plan change this is the whole step)
        jump: calcBill(s.upTo + 1, tariff).total - calcBill(s.upTo, tariff).total,
      };
    }
  }
  return null;
}

export function formatRupees(amount) {
  return `₹${Math.round(amount).toLocaleString('en-IN')}`;
}

export function formatRate(rate) {
  return rate === 0 ? 'Free' : `₹${rate.toFixed(2)}`;
}
