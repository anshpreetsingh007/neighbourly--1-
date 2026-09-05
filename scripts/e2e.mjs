/**
 * End-to-end check against a running server: `npm run e2e`.
 *
 * Signs up two real users through Supabase, then walks the whole flow - post a
 * job, browse it as someone else, apply, hire, complete, review - asserting
 * the authorisation and address-privacy rules at each step.
 *
 * REQUIRES email confirmation to be OFF (Authentication > Providers > Email >
 * "Confirm email") so signup returns a session immediately. With it on, this
 * exits 2 without running, because the built-in Supabase mailer is rate
 * limited to a handful of messages an hour and cannot be automated against.
 *
 * Point it at another server with QA_API=https://... npm run e2e
 */
import 'dotenv/config';

const API = process.env.QA_API || 'http://localhost:3050';
const SUPA = process.env.VITE_SUPABASE_URL;
const ANON = process.env.VITE_SUPABASE_ANON_KEY;

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

async function signUp(tag) {
  const domains = ['gmail.com', 'outlook.com', 'proton.me', 'example.org'];
  for (const d of domains) {
    const email = `neighbourly.qa.${tag}.${Date.now()}@${d}`;
    const res = await fetch(`${SUPA}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'TestPass!2345',
        data: { first_name: tag === 'a' ? 'Ada' : 'Bo', last_name: 'Tester' },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.access_token) return { email, token: json.access_token };
    if (json.user && !json.access_token) {
      return { email, token: null, needsConfirm: true };
    }
  }
  return null;
}

const call = (token) => async (method, path, body) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text.slice(0, 120); }
  return { status: res.status, data };
};

const a = await signUp('a');
if (!a?.token) {
  console.log('Could not obtain a token.', a?.needsConfirm ? '(email confirmation is ON)' : '');
  process.exit(2);
}
const b = await signUp('b');
if (!b?.token) { console.log('Could not create second user'); process.exit(2); }

const A = call(a.token);
const B = call(b.token);

console.log('\n== auth ==');
check('rejects no token', (await call(null)('GET', '/api/jobs')).status === 401);
check('rejects junk token', (await call('junk')('GET', '/api/jobs')).status === 401);
check('accepts valid token', (await A('GET', '/api/users/me')).status === 200);

console.log('\n== profile ==');
let me = await A('GET', '/api/users/me');
check('me returns a row', me.status === 200 && !!me.data.id);
check('me hides nothing from self', 'email' in me.data);
const stats = await A('GET', '/api/users/me/stats');
check('stats endpoint', stats.status === 200 && typeof stats.data.jobs_posted_count === 'number');

const prof = await A('POST', '/api/users/profile', {
  first_name: 'Ada', last_name: 'Tester', neighbourhood: 'Cornerstone, Calgary', bio: 'qa',
});
check('profile save', prof.status === 200, JSON.stringify(prof.data).slice(0, 80));
check('display name is first + initial', prof.data?.name === 'Ada T.', `got ${prof.data?.name}`);
await B('POST', '/api/users/profile', { first_name: 'Bo', last_name: 'Helper', neighbourhood: 'Beltline' });

console.log('\n== job validation ==');
const badCases = [
  ['no title', { category: 'snow', description: 'x', urgency: 'ASAP', lat: 51, lng: -114, address: 'Calgary', budget_min: 1, budget_max: 2 }],
  ['bad category', { title: 't', category: 'nope', description: 'x', urgency: 'ASAP', lat: 51, lng: -114, address: 'Calgary', budget_min: 1, budget_max: 2 }],
  ['bad urgency', { title: 't', category: 'snow', description: 'x', urgency: 'WHENEVER', lat: 51, lng: -114, address: 'Calgary', budget_min: 1, budget_max: 2 }],
  ['null island', { title: 't', category: 'snow', description: 'x', urgency: 'ASAP', lat: 0, lng: 0, address: 'Calgary', budget_min: 1, budget_max: 2 }],
  ['negative budget', { title: 't', category: 'snow', description: 'x', urgency: 'ASAP', lat: 51, lng: -114, address: 'Calgary', budget_min: -5, budget_max: 2 }],
  ['inverted budget', { title: 't', category: 'snow', description: 'x', urgency: 'ASAP', lat: 51, lng: -114, address: 'Calgary', budget_min: 50, budget_max: 5 }],
  ['huge budget', { title: 't', category: 'snow', description: 'x', urgency: 'ASAP', lat: 51, lng: -114, address: 'Calgary', budget_min: 1, budget_max: 1e12 }],
  ['long title', { title: 'x'.repeat(200), category: 'snow', description: 'x', urgency: 'ASAP', lat: 51, lng: -114, address: 'Calgary', budget_min: 1, budget_max: 2 }],
];
for (const [name, body] of badCases) {
  const r = await A('POST', '/api/jobs', body);
  check(`rejects ${name}`, r.status === 400, `got ${r.status}`);
}

console.log('\n== job lifecycle ==');
const created = await A('POST', '/api/jobs', {
  title: 'QA driveway shovel', category: 'snow', description: 'Test job from QA run.',
  urgency: 'ASAP', lat: 51.0447, lng: -114.0719, address: '123 Fake St, Cornerstone, Calgary',
  budget_min: 40, budget_max: 80,
});
check('create job', created.status === 201, JSON.stringify(created.data).slice(0, 100));
const jobId = created.data?.id;

const feedB = await B('GET', '/api/jobs');
check('job appears in other user feed', feedB.data?.some?.(j => j.id === jobId));
const seen = feedB.data?.find?.(j => j.id === jobId);
check('address is coarsened for browsers', seen && seen.location_precision === 'approximate');
check('exact street hidden', seen && !String(seen.address || '').includes('123 Fake St'), `got ${seen?.address}`);
check('pin is offset', seen && Math.abs(seen.lat - 51.0447) > 0.0001);
check('poster email not leaked', seen && !('email' in (seen.poster || {})));

const feedA = await A('GET', '/api/jobs');
check('own job excluded from own feed', !feedA.data?.some?.(j => j.id === jobId));

const mine = await A('GET', '/api/jobs/mine');
check('own job in /mine', mine.data?.some?.(j => j.id === jobId));
check('poster sees exact address', mine.data?.find(j => j.id === jobId)?.address?.includes('123 Fake St'));

console.log('\n== applying ==');
check('cannot apply to own job', (await A('POST', `/api/jobs/${jobId}/apply`, { proposed_price: 50 })).status === 400);
check('rejects zero bid', (await B('POST', `/api/jobs/${jobId}/apply`, { proposed_price: 0 })).status === 400);
const applied = await B('POST', `/api/jobs/${jobId}/apply`, { proposed_price: 55, message: 'I can do this' });
check('apply', applied.status === 201, JSON.stringify(applied.data).slice(0, 80));
const appId = applied.data?.application?.id;
const convId = applied.data?.conversation_id;
check('apply opened a conversation', !!convId);
const dupe = await B('POST', `/api/jobs/${jobId}/apply`, { proposed_price: 60 });
check('duplicate apply is idempotent', dupe.status === 200 || dupe.status === 201);

const appliedList = await B('GET', '/api/jobs/applied');
check('job shows in applied tab', appliedList.data?.some?.(j => j.id === jobId));

const detailB = await B('GET', `/api/jobs/${jobId}`);
check('applicant sees own application only', (detailB.data?.applications || []).length === 1);
check('application count exposed', detailB.data?.application_count === 1);

console.log('\n== authorisation ==');
check('non-poster cannot see applicant list', (await B('GET', `/api/jobs/${jobId}/applications`)).status === 403);
check('non-poster cannot edit', (await B('PATCH', `/api/jobs/${jobId}`, { title: 'hacked' })).status === 403);
check('non-poster cannot delete', (await B('DELETE', `/api/jobs/${jobId}`)).status === 403);
check('non-poster cannot complete', (await B('POST', `/api/jobs/${jobId}/complete`)).status === 403);
check('non-poster cannot hire', (await B('POST', `/api/jobs/${jobId}/applications/${appId}/accept`)).status === 403);
check('budget locked after applications', (await A('PATCH', `/api/jobs/${jobId}`, { budget_min: 1, budget_max: 2 })).status === 409);
check('title still editable', (await A('PATCH', `/api/jobs/${jobId}`, { title: 'QA driveway shovel v2' })).status === 200);

console.log('\n== messaging ==');
const msgs = await B('GET', `/api/conversations/${convId}/messages`);
check('participant can read thread', msgs.status === 200 && Array.isArray(msgs.data));
check('opening message exists', (msgs.data || []).length >= 1);
const convs = await B('GET', '/api/conversations');
check('conversation listed', convs.data?.some?.(c => c.id === convId));
check('other participant resolved', !!convs.data?.find?.(c => c.id === convId)?.otherUser);
check('unread count present', typeof convs.data?.find?.(c => c.id === convId)?.unread_count === 'number');
const unread = await A('GET', '/api/messages/unread-count');
check('poster has an unread message', unread.data?.count >= 1, `got ${unread.data?.count}`);

console.log('\n== complete + review ==');
check('cannot complete before hiring', (await A('POST', `/api/jobs/${jobId}/complete`)).status === 409);
const hire = await A('POST', `/api/jobs/${jobId}/applications/${appId}/accept`);
check('hire', hire.status === 200, JSON.stringify(hire.data).slice(0, 80));
const afterHire = await B('GET', `/api/jobs/${jobId}`);
check('hired helper gets exact address', afterHire.data?.address?.includes('123 Fake St'), `got ${afterHire.data?.address}`);
check('precision flips to exact', afterHire.data?.location_precision === 'exact');
check('cannot review before complete', (await A('POST', `/api/jobs/${jobId}/reviews`, { rating: 5, body: 'x' })).status === 409);
check('complete', (await A('POST', `/api/jobs/${jobId}/complete`)).status === 200);
check('rejects rating 0', (await A('POST', `/api/jobs/${jobId}/reviews`, { rating: 0, body: 'x' })).status === 400);
check('rejects rating 9', (await A('POST', `/api/jobs/${jobId}/reviews`, { rating: 9, body: 'x' })).status === 400);
const rev = await A('POST', `/api/jobs/${jobId}/reviews`, { rating: 5, body: 'Great work' });
check('review', rev.status === 201, JSON.stringify(rev.data).slice(0, 80));
const revDupe = await A('POST', `/api/jobs/${jobId}/reviews`, { rating: 4, body: 'again' });
check('duplicate review blocked (unique constraint)', revDupe.status === 409, `got ${revDupe.status}`);
const bStats = await B('GET', '/api/users/me/stats');
check('rating shows on reviewee stats', bStats.data?.avg_rating === 5, `got ${bStats.data?.avg_rating}`);

console.log('\n== notifications + reports ==');
const notifs = await B('GET', '/api/notifications');
check('helper got notifications', (notifs.data || []).length > 0);
check('notification capped at 50', (notifs.data || []).length <= 50);
const foreign = notifs.data?.[0]?.id;
if (foreign) check('cannot read others notification', (await A('POST', `/api/notifications/${foreign}/read`)).status === 404);
check('report needs valid target', (await A('POST', '/api/reports', { target_type: 'NOPE', target_id: 'x', reason: 'y' })).status === 400);
check('report needs reason', (await A('POST', '/api/reports', { target_type: 'USER', target_id: me.data.id, reason: '' })).status === 400);
check('report', (await B('POST', '/api/reports', { target_type: 'USER', target_id: me.data.id, reason: 'qa test' })).status === 201);

console.log('\n== cleanup ==');
const del = await A('DELETE', `/api/jobs/${jobId}`);
check('delete cancels job with history', del.status === 200 && del.data.cancelled === true);
check('cancelled job leaves feed', !(await B('GET', '/api/jobs')).data?.some?.(j => j.id === jobId));

console.log(`\n${pass} passed, ${fail} failed`);
if (failures.length) console.log('FAILURES:\n' + failures.map(f => ' - ' + f).join('\n'));
process.exit(fail ? 1 : 0);
