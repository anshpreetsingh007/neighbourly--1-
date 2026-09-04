/**
 * Load test for the Neighbourly API.
 *
 *   node scripts/loadtest.mjs            # unauthenticated: /api/health only
 *   TOKEN=<supabase access token> node scripts/loadtest.mjs
 *
 * Every route except /api/health sits behind requireAuth, and that middleware
 * calls Supabase to verify the token on every request - so an authenticated
 * run measures your API *plus* a network round trip to Supabase, which is
 * usually the slowest part. That contrast is the point: compare the two.
 *
 * Point this at a local server. Never at production - you would be paying to
 * DDoS yourself, and a free Postgres tier will hit its connection limit.
 */
import autocannon from 'autocannon';

const URL = process.env.LOAD_URL || 'http://localhost:3000';
const TOKEN = process.env.TOKEN;
const CONNECTIONS = Number(process.env.CONNECTIONS) || 20;
const DURATION = Number(process.env.DURATION) || 10;

if (!URL.includes('localhost') && !process.env.I_MEAN_IT) {
  console.error(`Refusing to load test ${URL}. Set I_MEAN_IT=1 if this really is yours to hammer.`);
  process.exit(1);
}

const headers = TOKEN ? { authorization: `Bearer ${TOKEN}` } : undefined;

/** Only the reads. Hammering POST /api/jobs would fill your database with junk. */
const targets = [
  { name: 'GET /api/health   (no auth, no DB)', path: '/api/health', auth: false },
  { name: 'GET /api/jobs     (auth + DB read)', path: '/api/jobs', auth: true },
  { name: 'GET /api/users/me (auth + DB read)', path: '/api/users/me', auth: true },
  { name: 'GET /api/conversations', path: '/api/conversations', auth: true },
];

const pad = (s, n) => String(s).padEnd(n);

for (const target of targets) {
  if (target.auth && !TOKEN) {
    console.log(`\n${target.name} - skipped, needs TOKEN`);
    continue;
  }

  console.log(`\n=== ${target.name} ===`);
  const result = await autocannon({
    url: `${URL}${target.path}`,
    connections: CONNECTIONS,
    duration: DURATION,
    headers: target.auth ? headers : undefined,
  });

  // non2xx catches the case that makes a load test lie: 20,000 requests per
  // second is not a good result if every one of them is a 401.
  const bad = result.non2xx + result.errors;
  console.log(`  ${pad('requests/sec', 16)} ${result.requests.average.toFixed(0)}`);
  console.log(`  ${pad('latency p50', 16)} ${result.latency.p50} ms`);
  console.log(`  ${pad('latency p99', 16)} ${result.latency.p99} ms`);
  console.log(`  ${pad('max latency', 16)} ${result.latency.max} ms`);
  console.log(`  ${pad('total requests', 16)} ${result.requests.total}`);
  if (bad) console.log(`  ${pad('FAILED', 16)} ${bad}  <- results below are meaningless`);
}
