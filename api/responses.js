const { redis, KEY, CODES, UTRS, BLOCKED, body } = require('./_store');

const STATUSES = ['unpaid', 'submitted', 'paid', 'issue'];

// Only the admin page calls this, with the secret ADMIN_KEY.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const adminKey = process.env.ADMIN_KEY;
  const sent = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!adminKey || adminKey.length < 12) return res.status(500).json({ error: 'ADMIN_KEY is not set on Vercel (use 12+ characters).' });
  if (sent !== adminKey) {
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ error: 'Wrong admin key.' });
  }

  try {
    // Mark paid / not paid / issue
    if (req.method === 'POST') {
      const b = body(req);
      const email = String(b.email || '').toLowerCase();
      if (!STATUSES.includes(b.status)) return res.status(400).json({ error: 'Unknown status.' });
      const raw = await redis(['HGET', KEY, email]);
      if (!raw) return res.status(404).json({ error: 'Response not found.' });
      const rec = JSON.parse(raw);
      rec.paymentStatus = b.status;
      rec.verifiedAt = b.status === 'paid' ? new Date().toISOString() : '';
      if (typeof b.note === 'string') rec.adminNote = b.note.slice(0, 300);
      await redis(['HSET', KEY, email, JSON.stringify(rec)]);
      return res.status(200).json({ ok: true, row: rec });
    }

    if (req.method === 'DELETE') {
      const email = String(req.query.email || '').toLowerCase();
      if (!email) return res.status(400).json({ error: 'Missing email.' });
      const raw = await redis(['HGET', KEY, email]);
      if (raw) {
        const rec = JSON.parse(raw);
        if (rec.tripCode) await redis(['HDEL', CODES, rec.tripCode]);
        if (rec.utr) await redis(['HDEL', UTRS, rec.utr]);
      }
      await redis(['HDEL', KEY, email]);
      return res.status(200).json({ ok: true });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    const flat = (await redis(['HGETALL', KEY])) || [];
    const rows = [];
    for (let i = 1; i < flat.length; i += 2) { try { rows.push(JSON.parse(flat[i])); } catch {} }
    rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
    const blocked = ((await redis(['LRANGE', BLOCKED, 0, 299])) || []).map(x => { try { return JSON.parse(x); } catch { return null; } }).filter(Boolean);
    return res.status(200).json({
      rows, blocked, total: rows.length, price: Number(process.env.TRIP_PRICE || 8499),
      upiId: process.env.UPI_ID || '', fetchedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || 'Could not read responses.' });
  }
};
