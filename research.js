// Uplit - research weights and scoring.
//
// Every number the UI may show lives in WEIGHTS, one row per figure with its
// sample size, grade and source. Revising the research changes this file only.
//
// Three rules keep the output honest:
//   1. Never display a synthesised percentage. WEIGHTS holds marginal effects
//      from one dataset. They are not independent and do not add. Output a
//      band: strong/fair/weak/avoid.
//   2. Name the dominant signal with its own rate and sample size.
//   3. Unknowns are not a pass. score() returns unknowns[]; the caller shows
//      the count instead of a band built on holes.
//
// Grades: 'B' single-source, from GigRadar (133,872 proposals, 543 agency
// teams, Dec 2025-Feb 2026) - a vendor that sells proposal automation. 'A'
// independently grounded (Upwork patent US10489745B1; Hong, Wang & Pavlou, ISR
// 2016, 1.8M bids; NBER 18720; NBER 30886). 'X' no measured basis, kept so the
// UI can say so.
//
// Pure data and pure functions. No DOM, no network. Loads before content.js.

(function (root) {
  'use strict';

  // Measured platform-wide reply rate. Every band below is judged against this,
  // never against another band.
  var PLATFORM_MEAN_REPLY = 7.45;

  var SRC_GIGRADAR = 'GigRadar, 133,872 proposals / 543 agency teams, Dec 2025-Feb 2026';
  var SRC_ISR = 'Hong, Wang & Pavlou, Information Systems Research 2016 (1.8M bids)';

  // WEIGHTS - the single auditable table.
  //   signal  machine key, groups rows for one variable
  //   band    human label for the bucket
  //   rate    measured reply rate %, null when the row is an increment
  //   pp      marginal effect in percentage points, null otherwise
  //   n       sample size, null when the source published none
  //   grade   A grounded | B single-source | X no measured basis
  var WEIGHTS = [
    // --- minutes since posting -----------------------------------------------
    { signal: 'age', band: '3-4 min', rate: 11.86, pp: null, n: 371, grade: 'B', source: SRC_GIGRADAR, note: 'small sample' },
    { signal: 'age', band: '4-5 min', rate: 8.99, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'age', band: '5-11 min', rate: 6.60, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR, note: 'dead zone, 6.3-6.9% across the range' },
    { signal: 'age', band: '12-15 min', rate: 8.07, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR, note: 'second wave' },
    { signal: 'age', band: '20-30 min', rate: 6.42, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'age', band: '30-45 min', rate: 5.34, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },

    // --- proposals already submitted -----------------------------------------
    { signal: 'proposals', band: '11+', rate: 2.11, pp: null, n: 133872, grade: 'B', source: SRC_GIGRADAR },

    // --- client lifetime spend ------------------------------------------------
    // Note the direction: big spenders reply LESS. A minimum-spend filter selects
    // the worst band, which is why Uplit ships a band control instead.
    { signal: 'spend', band: '$1-$1,000', rate: 8.15, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'spend', band: '$500,000+', rate: 3.85, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR, note: 'falls continuously between the endpoints' },

    // --- client rating --------------------------------------------------------
    // Low-rated clients reply at twice the rate. They are also the ones who can
    // cost you JSS. This is a risk control, not a quality filter.
    { signal: 'rating', band: 'below 3.5 stars', rate: 13.11, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'rating', band: '4.8 stars and above', rate: 6.51, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },

    // --- client jobs posted ---------------------------------------------------
    // The only measured proxy for "is this client a hirer". Hire rate is NOT.
    { signal: 'jobsPosted', band: '1 posted', rate: 5.83, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'jobsPosted', band: '6-10 posted', rate: 7.50, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR },

    // --- the "hire rate above 50%" rule --------------------------------------
    // Searched for specifically. Every citation traces to vendor opinion; no
    // dataset supports it. Present so the panel can label the filter honestly.
    { signal: 'hireRate', band: 'any threshold', rate: null, pp: null, n: null, grade: 'X', source: 'no measured basis; every citation traces to vendor opinion' },

    // --- payment verification -------------------------------------------------
    { signal: 'verified', band: 'payment verified', rate: null, pp: 2.60, n: null, grade: 'B', source: SRC_GIGRADAR },

    // --- title wording --------------------------------------------------------
    // The jobs that LOOK like the best fit are the crowded ones.
    { signal: 'title', band: 'names a technology', rate: null, pp: -2.43, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'title', band: 'contains "Developer"', rate: null, pp: -2.70, n: null, grade: 'B', source: SRC_GIGRADAR },
    { signal: 'title', band: 'contains "Senior"', rate: null, pp: -1.83, n: null, grade: 'B', source: SRC_GIGRADAR },

    // --- bid placement --------------------------------------------------------
    { signal: 'bid', band: '95-105% of budget', rate: 8.80, pp: null, n: 59339, grade: 'B', source: SRC_GIGRADAR + '; direction independently supported by ' + SRC_ISR, note: 'worst of nine bands, and where 88% of all bids sit' },

    // --- category -------------------------------------------------------------
    { signal: 'category', band: 'Web, Mobile & Software Dev', rate: 4.90, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR, note: '4.0-5.8% reply, 13.6% view, 58.5% of all agency bids' },
    { signal: 'category', band: 'Engineering & Architecture', rate: 11.75, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR, note: '10.9-12.6% reply, 35-39% view, 0.6% of all agency bids' },

    // --- economics ------------------------------------------------------------
    { signal: 'connects', band: 'Connect price', rate: null, pp: null, n: null, grade: 'B', source: SRC_GIGRADAR, note: '$0.15 per Connect' }
  ];

  function rowsFor(signal) {
    var out = [];
    for (var i = 0; i < WEIGHTS.length; i++) if (WEIGHTS[i].signal === signal) out.push(WEIGHTS[i]);
    return out;
  }
  function rowFor(signal, band) {
    var rows = rowsFor(signal);
    for (var i = 0; i < rows.length; i++) if (rows[i].band === band) return rows[i];
    return null;
  }

  var CONNECT_PRICE_USD = 0.15;

  // Post age at minute resolution. Unmeasured ranges carry measured:false and
  // no rate. They are gaps, not zeroes, so the UI must not colour them.
  var AGE_BANDS = [
    { max: 3, key: 'early', label: 'Send now', tone: 'good', measured: false, band: null,
      advice: 'Earlier than the measured 3-4 min peak.' },
    { max: 4, key: 'peak', label: 'Send now', tone: 'good', measured: true, band: '3-4 min',
      advice: 'Best measured window.' },
    { max: 5, key: 'peak', label: 'Send now', tone: 'good', measured: true, band: '4-5 min',
      advice: 'Still in the opening window.' },
    { max: 12, key: 'dead', label: 'Dead zone', tone: 'warn', measured: true, band: '5-11 min',
      advice: 'Hold. The 12-15 min second wave measures higher.', waitUntil: 12 },
    { max: 15, key: 'second', label: 'Second wave', tone: 'good', measured: true, band: '12-15 min',
      advice: 'Second measured peak.' },
    { max: 20, key: 'gap', label: 'Fading', tone: 'neutral', measured: false, band: null,
      advice: 'Between measured bands.' },
    { max: 30, key: 'marginal', label: 'Marginal', tone: 'neutral', measured: true, band: '20-30 min',
      advice: 'Below the 7.45% platform mean.' },
    { max: 45, key: 'marginal', label: 'Marginal', tone: 'neutral', measured: true, band: '30-45 min',
      advice: 'Below the platform mean and still falling.' },
    { max: 60, key: 'gap', label: 'Late', tone: 'neutral', measured: false, band: null,
      advice: 'Between measured bands; the trend is downward.' },
    { max: Infinity, key: 'cold', label: 'Cold', tone: 'bad', measured: false, band: null,
      advice: 'Past 60 min reply rate keeps falling. Skip unless the niche is yours.' }
  ];

  // minutes -> reading, or null when age is unknown so callers can record it as
  // an unknown rather than a pass.
  function postAgeBand(minutes) {
    if (typeof minutes !== 'number' || !isFinite(minutes) || minutes < 0) return null;
    for (var i = 0; i < AGE_BANDS.length; i++) {
      if (minutes < AGE_BANDS[i].max) {
        var b = AGE_BANDS[i];
        var row = b.band ? rowFor('age', b.band) : null;
        return {
          signal: 'age',
          key: b.key,
          label: b.label,
          tone: b.tone,
          advice: b.advice,
          measured: b.measured,
          waitUntil: b.waitUntil || null,
          rate: row ? row.rate : null,
          n: row ? row.n : null,
          grade: row ? row.grade : null,
          bandLabel: b.band
        };
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Single-variable readings. Each returns null for "cannot tell", never a
  // neutral-looking default.
  // ---------------------------------------------------------------------------

  function proposalBand(floor) {
    if (typeof floor !== 'number' || !isFinite(floor)) return null;
    if (floor >= 11) {
      var r = rowFor('proposals', '11+');
      return { signal: 'proposals', label: '11+ proposals', tone: 'bad', measured: true,
        rate: r.rate, n: r.n, grade: r.grade, bandLabel: r.band };
    }
    // Below 11 the source publishes no per-bucket rate, only that it is better.
    return { signal: 'proposals', label: floor + ' or fewer proposals', tone: 'good',
      measured: false, rate: null, n: null, grade: 'B', bandLabel: null,
      advice: 'Under the 11+ cliff.' };
  }

  function spendBand(usd) {
    if (typeof usd !== 'number' || !isFinite(usd)) return null;
    if (usd <= 1000) {
      var lo = rowFor('spend', '$1-$1,000');
      return { signal: 'spend', label: 'Client spend under $1k', tone: 'good', measured: true,
        rate: lo.rate, n: lo.n, grade: lo.grade, bandLabel: lo.band,
        advice: 'Replies most, but least proven as a hirer.' };
    }
    if (usd >= 500000) {
      var hi = rowFor('spend', '$500,000+');
      return { signal: 'spend', label: 'Client spend $500k+', tone: 'bad', measured: true,
        rate: hi.rate, n: hi.n, grade: hi.grade, bandLabel: hi.band,
        advice: 'Experienced, flooded, and usually already has people.' };
    }
    // Measured only as "falls continuously" between the endpoints.
    return { signal: 'spend', label: 'Client spend in band', tone: 'neutral', measured: false,
      rate: null, n: null, grade: 'B', bandLabel: null,
      advice: 'Between the measured endpoints; reply rate falls as spend rises.' };
  }

  function ratingBand(rating) {
    if (typeof rating !== 'number' || !isFinite(rating)) return null;
    if (rating < 3.5) {
      var low = rowFor('rating', 'below 3.5 stars');
      return { signal: 'rating', label: 'Client rated under 3.5', tone: 'risk', measured: true,
        rate: low.rate, n: low.n, grade: low.grade, bandLabel: low.band,
        advice: 'Replies about twice as often, and is the client who can cost you JSS.' };
    }
    if (rating >= 4.8) {
      var high = rowFor('rating', '4.8 stars and above');
      return { signal: 'rating', label: 'Client rated 4.8+', tone: 'neutral', measured: true,
        rate: high.rate, n: high.n, grade: high.grade, bandLabel: high.band,
        advice: 'Safer to work for, replies less.' };
    }
    return { signal: 'rating', label: 'Client rated ' + rating, tone: 'neutral', measured: false,
      rate: null, n: null, grade: 'B', bandLabel: null };
  }

  function jobsPostedBand(count) {
    if (typeof count !== 'number' || !isFinite(count)) return null;
    if (count <= 1) {
      var one = rowFor('jobsPosted', '1 posted');
      return { signal: 'jobsPosted', label: 'First job posted', tone: 'bad', measured: true,
        rate: one.rate, n: one.n, grade: one.grade, bandLabel: one.band };
    }
    if (count >= 6 && count <= 10) {
      var six = rowFor('jobsPosted', '6-10 posted');
      return { signal: 'jobsPosted', label: count + ' jobs posted', tone: 'good', measured: true,
        rate: six.rate, n: six.n, grade: six.grade, bandLabel: six.band };
    }
    return { signal: 'jobsPosted', label: count + ' jobs posted', tone: 'neutral', measured: false,
      rate: null, n: null, grade: 'B', bandLabel: null };
  }

  // ---------------------------------------------------------------------------
  // Title wording. A regex over text the card already carries.
  // ---------------------------------------------------------------------------
  var TECH_TERMS = [
    'react', 'react native', 'next\\.?js', 'node(?:\\.?js)?', 'vue', 'angular', 'svelte',
    'python', 'django', 'flask', 'fastapi', 'ruby on rails', 'rails', 'laravel', 'php',
    'wordpress', 'shopify', 'webflow', 'squarespace', 'magento', 'woocommerce',
    'javascript', 'typescript', 'golang', 'rust', 'kotlin', 'swift',
    'flutter', 'ionic', 'android', 'unity', 'unreal',
    'aws', 'azure', 'gcp', 'kubernetes', 'docker', 'terraform',
    'postgres(?:ql)?', 'mysql', 'mongodb', 'firebase', 'supabase',
    'tensorflow', 'pytorch', 'langchain', 'openai', 'salesforce', 'hubspot', 'zapier',
    'figma', 'tailwind', 'bootstrap'
  ];
  var TECH_RE = new RegExp('(?:^|[^a-z0-9])(' + TECH_TERMS.join('|') + ')(?:[^a-z0-9]|$)', 'i');

  // -> { hits, totalPp, namesTech, hasDeveloper, hasSenior, allThree }
  // totalPp exists for ORDERING ONLY. It is a sum of marginal effects and must
  // never be rendered as a predicted rate - see rule 1.
  function titlePenalty(title) {
    var t = String(title || '');
    if (!t.trim()) return null;
    var hits = [];
    var namesTech = TECH_RE.test(t);
    var hasDeveloper = /\bdevelopers?\b/i.test(t);
    var hasSenior = /\bsenior\b/i.test(t);
    if (namesTech) hits.push(rowFor('title', 'names a technology'));
    if (hasDeveloper) hits.push(rowFor('title', 'contains "Developer"'));
    if (hasSenior) hits.push(rowFor('title', 'contains "Senior"'));
    var total = 0;
    for (var i = 0; i < hits.length; i++) total += hits[i].pp;
    return {
      signal: 'title',
      hits: hits,
      totalPp: Math.round(total * 100) / 100,
      namesTech: namesTech,
      hasDeveloper: hasDeveloper,
      hasSenior: hasSenior,
      allThree: namesTech && hasDeveloper && hasSenior
    };
  }

  // Bid placement. 95-105% of budget is the worst of nine measured bands and
  // holds 88% of all bids. Auction theory agrees: do not shade down to compete.
  function bidBand(budget) {
    if (typeof budget !== 'number' || !isFinite(budget) || budget <= 0) return null;
    var row = rowFor('bid', '95-105% of budget');
    return {
      signal: 'bid',
      avoidLow: Math.round(budget * 0.95),
      avoidHigh: Math.round(budget * 1.05),
      suggestUnder: Math.round(budget * 0.5),
      suggestOver: Math.round(budget * 2),
      rate: row.rate, n: row.n, grade: row.grade, note: row.note
    };
  }

  // ---------------------------------------------------------------------------
  // Connects economics. Pure arithmetic on a published unit price - the one
  // place a number may be multiplied out, because it is a price, not an effect.
  // ---------------------------------------------------------------------------
  function connectCost(connects) {
    if (typeof connects !== 'number' || !isFinite(connects) || connects < 0) return null;
    return { connects: connects, usd: Math.round(connects * CONNECT_PRICE_USD * 100) / 100,
      unitPrice: CONNECT_PRICE_USD, grade: 'B' };
  }

  // Hard stops. Each carries a reason the UI prints verbatim.
  //
  // The spend rule looks inverted on purpose: sub-$1k clients reply most
  // (8.15%), but the band starts at $1k because it targets clients who hire.
  var FREE_WORK_RE = /(free\s+(?:test|sample|trial|work|task)|unpaid\s+(?:test|trial|sample|work)|test\s+task\s+(?:is\s+)?unpaid|no\s+pay\s+for\s+(?:the\s+)?test)/i;

  function hardStops(job) {
    var out = [];
    var j = job || {};

    if (typeof j.proposalsFloor === 'number' && isFinite(j.proposalsFloor) && j.proposalsFloor > 10) {
      out.push({ rule: 'proposals', text: j.proposalsFloor + '+ proposals already', detail: '11+ -> 2.11% (n=133,872)' });
    }
    if (j.paymentVerified === false) {
      out.push({ rule: 'verified', text: 'Payment not verified', detail: 'the verified badge is worth +2.60pp' });
    }
    if (typeof j.rating === 'number' && isFinite(j.rating) && j.rating < 4.0) {
      out.push({ rule: 'rating', text: 'Client rated ' + j.rating + '/5', detail: 'below 4.0 raises hire risk' });
    }
    // Upper bound only. A low bound here marked the highest-replying band as
    // "avoid": WEIGHTS records $1-$1,000 at 8.15% against $500,000+ at 3.85%,
    // and spendBand() returns tone 'good' for the same figure this stop was
    // calling a reason to skip the job. The two contradicted each other inside
    // one score() result, which said "Client spend in band" and "outside
    // $1k-$25k" at once. Reply rate falls as spend rises, so only the top end
    // is a stop. Under $1k stays a graded reason, never a verdict.
    if (typeof j.spendUsd === 'number' && isFinite(j.spendUsd) && j.spendUsd > 25000) {
      out.push({ rule: 'spend', text: 'Client spend over $25k', detail: 'reply rate falls as spend rises; $500k+ replies at 3.85%' });
    }
    if (typeof j.ageMinutes === 'number' && isFinite(j.ageMinutes) && j.ageMinutes > 240) {
      out.push({ rule: 'age', text: 'Posted over 4 hours ago', detail: 'reply rate falls continuously past 60 min' });
    }
    var tp = titlePenalty(j.title);
    if (tp && tp.allThree) {
      out.push({ rule: 'title', text: 'Title is "Senior" + "Developer" + a technology', detail: 'the three most crowded title markers' });
    }
    // `=== false`, not `!== true`. A card that renders neither payment badge
    // leaves paymentVerified undefined, and `!== true` read that unknown as a
    // refusal: a $5,000 job on a tile whose badge did not parse was forced to
    // "avoid" with the text "no verified badge", having never checked one. An
    // absent field must never fire a stop, which is the rule the sibling stops
    // and jobMatches() both follow.
    if (typeof j.budgetUsd === 'number' && isFinite(j.budgetUsd) && j.budgetUsd > 2500 && j.paymentVerified === false) {
      out.push({ rule: 'budget', text: 'Budget over $2,500 with no verified badge', detail: 'classic bait shape' });
    }
    if (j.description && FREE_WORK_RE.test(String(j.description))) {
      out.push({ rule: 'freework', text: 'Post asks for free or unpaid work', detail: 'matched the free-work phrasing' });
    }
    return out;
  }

  // score(job) -> { band, dominant, reasons, unknowns, hardStops }
  // band is strong|fair|weak|avoid. No numeric score, by design. `dominant` is
  // the measured reading furthest from the platform mean, with its own n.
  var BAND_ORDER = ['avoid', 'weak', 'fair', 'strong'];

  function bandFromRate(rate) {
    if (rate >= 9) return 'strong';
    if (rate >= 7) return 'fair';
    if (rate >= 5) return 'weak';
    return 'avoid';
  }
  function demote(band, steps) {
    var i = BAND_ORDER.indexOf(band);
    if (i < 0) return band;
    return BAND_ORDER[Math.max(0, i - (steps || 1))];
  }

  function score(job) {
    var j = job || {};
    var reasons = [];
    var unknowns = [];

    var readings = [
      { value: postAgeBand(j.ageMinutes), missing: 'post age' },
      { value: proposalBand(j.proposalsFloor), missing: 'proposal count' },
      { value: spendBand(j.spendUsd), missing: 'client spend' },
      { value: ratingBand(j.rating), missing: 'client rating' },
      { value: jobsPostedBand(j.jobsPosted), missing: 'jobs posted' }
    ];

    var measured = [];
    for (var i = 0; i < readings.length; i++) {
      var r = readings[i];
      if (!r.value) { unknowns.push(r.missing); continue; }
      reasons.push(r.value);
      if (r.value.measured && typeof r.value.rate === 'number') measured.push(r.value);
    }

    // Title penalty is a modifier, never a dominant signal: it is expressed in
    // percentage points, and mixing pp with rates is what rule 1 forbids.
    var tp = titlePenalty(j.title);
    if (tp && tp.hits.length) reasons.push(tp);

    var stops = hardStops(j);
    if (stops.length) {
      return { band: 'avoid', dominant: null, reasons: reasons, unknowns: unknowns, hardStops: stops };
    }

    if (!measured.length) {
      return { band: 'weak', dominant: null, reasons: reasons, unknowns: unknowns, hardStops: [],
        note: 'no measured signal available' };
    }

    // Dominant = furthest from the platform mean in either direction.
    var dominant = measured[0];
    for (var k = 1; k < measured.length; k++) {
      if (Math.abs(measured[k].rate - PLATFORM_MEAN_REPLY) > Math.abs(dominant.rate - PLATFORM_MEAN_REPLY)) {
        dominant = measured[k];
      }
    }

    var band = bandFromRate(dominant.rate);

    // A second measured reading below the mean is corroboration, not arithmetic:
    // one step down, never a subtraction.
    var negatives = 0;
    for (var m = 0; m < measured.length; m++) if (measured[m].rate < PLATFORM_MEAN_REPLY) negatives++;
    if (negatives >= 2) band = demote(band, 1);

    // All three crowded title markers is already a hard stop; two is a nudge.
    if (tp && tp.hits.length >= 2) band = demote(band, 1);

    // Rule 3: a band built on holes is not a band.
    if (unknowns.length >= 3 && BAND_ORDER.indexOf(band) > BAND_ORDER.indexOf('weak')) band = 'weak';

    return { band: band, dominant: dominant, reasons: reasons, unknowns: unknowns, hardStops: [] };
  }

  root.UplitResearch = {
    PLATFORM_MEAN_REPLY: PLATFORM_MEAN_REPLY,
    CONNECT_PRICE_USD: CONNECT_PRICE_USD,
    WEIGHTS: WEIGHTS,
    rowsFor: rowsFor,
    rowFor: rowFor,
    postAgeBand: postAgeBand,
    proposalBand: proposalBand,
    spendBand: spendBand,
    ratingBand: ratingBand,
    jobsPostedBand: jobsPostedBand,
    titlePenalty: titlePenalty,
    bidBand: bidBand,
    connectCost: connectCost,
    hardStops: hardStops,
    score: score
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
