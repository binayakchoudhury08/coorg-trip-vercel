const { redis, KEY, UTRS, body, logBlocked } = require('./_store');

// A student reports their UPI transaction ID (UTR) after paying.
// It is marked "submitted" until an organiser checks it in the admin page.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = body(req);
  const email = String(b.email || '').trim().toLowerCase();
  const tripCode = String(b.tripCode || '').trim().toUpperCase();
  const utr = String(b.utr || '').replace(/\s/g, '');

  if (!/^\d{12}$/.test(utr)) return res.status(400).json({ error: 'The UPI transaction ID (UTR) is 12 digits. Please check and try again.' });

  try {
    const raw = await redis(['HGET', KEY, email]);
    if (!raw) return res.status(404).json({ error: 'We couldn’t find your registration. Please fill the form again.' });
    const rec = JSON.parse(raw);
    if (rec.tripCode !== tripCode) return res.status(403).json({ error: 'Trip code does not match. Please fill the form again.' });
    if (rec.paymentStatus === 'paid') return res.status(200).json({ ok: true, paymentStatus: 'paid', utr: rec.utr });

    const owner = await redis(['HGET', UTRS, utr]);
    if (owner && owner !== email) { await logBlocked({ reason: 'utr-reused', fullName: rec.fullName, email, phone: rec.phone, utr, existingEmail: owner }); return res.status(409).json({ error: 'This transaction ID has already been used by someone else. Please check the number.' }); }

    if (rec.utr && rec.utr !== utr) await redis(['HDEL', UTRS, rec.utr]);
    await redis(['HSET', UTRS, utr, email]);

    const now = new Date().toISOString();
    Object.assign(rec, { utr, paymentStatus: 'submitted', paymentReportedAt: now, updatedAt: now });
    await redis(['HSET', KEY, email, JSON.stringify(rec)]);
    return res.status(200).json({ ok: true, paymentStatus: 'submitted', utr });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not save your payment details. Please try again.' });
  }
};
