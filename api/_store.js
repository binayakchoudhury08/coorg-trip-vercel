// Tiny wrapper around Upstash Redis (Vercel → Storage → "Upstash for Redis").
// Vercel adds these environment variables automatically when you connect the database.
const URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const KEY = 'coorg:responses';   // email  -> registration JSON
const CODES = 'coorg:codes';     // trip code -> email
const UTRS = 'coorg:utrs';       // UTR -> email (stops one payment being claimed twice)
const BLOCKED = 'coorg:blocked'; // audit log of repeat / suspicious attempts

async function redis(command) {
  if (!URL || !TOKEN) throw new Error('Database is not connected. Add Upstash Redis in Vercel → Storage.');
  const r = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json();
  if (!r.ok || data.error) throw new Error(data.error || 'Database error');
  return data.result;
}

// Payment settings come from Vercel environment variables.
function paymentInfo(tripCode) {
  const upiId = (process.env.UPI_ID || '').trim();
  if (!upiId) return null;
  return {
    upiId,
    payeeName: (process.env.UPI_NAME || 'Coorg Trip').trim(),
    amount: Number(process.env.TRIP_PRICE || 8499),
    note: `Coorg trip ${tripCode}`,
  };
}

// Same inbox, written differently, counts as the same email:
// upper/lower case, "+anything" aliases, and dots in Gmail addresses.
function canonicalEmail(email) {
  let [local = '', domain = ''] = String(email).trim().toLowerCase().split('@');
  local = local.split('+')[0];
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return local + '@' + domain;
}
const phoneKey = p => String(p || '').replace(/\D/g, '').slice(-10);

async function allRecords() {
  const flat = (await redis(['HGETALL', KEY])) || [];
  const rows = [];
  for (let i = 1; i < flat.length; i += 2) { try { rows.push(JSON.parse(flat[i])); } catch {} }
  return rows;
}

async function logBlocked(entry) {
  await redis(['LPUSH', BLOCKED, JSON.stringify({ ...entry, at: new Date().toISOString() })]);
  await redis(['LTRIM', BLOCKED, 0, 999]);
}

function body(req) {
  if (typeof req.body === 'string') { try { return JSON.parse(req.body || '{}'); } catch { return {}; } }
  return req.body || {};
}

module.exports = { redis, KEY, CODES, UTRS, BLOCKED, paymentInfo, body, canonicalEmail, phoneKey, allRecords, logBlocked };
