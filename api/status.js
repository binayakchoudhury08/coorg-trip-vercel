const { redis, KEY, body, paymentInfo } = require('./_store');

// Returns the latest payment status + payment details for a saved registration.
// Used when someone reopens the page, so they always see current UPI details
// and get "Confirmed" once an organiser marks them paid.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  res.setHeader('Cache-Control', 'no-store');
  const b = body(req);
  const email = String(b.email || '').trim().toLowerCase();
  const tripCode = String(b.tripCode || '').trim().toUpperCase();
  try {
    const raw = await redis(['HGET', KEY, email]);
    if (!raw) return res.status(404).json({ error: 'Registration not found.' });
    const rec = JSON.parse(raw);
    if (rec.tripCode !== tripCode) return res.status(403).json({ error: 'Trip code does not match.' });
    return res.status(200).json({
      ok: true, tripCode: rec.tripCode, email: rec.email, fullName: rec.fullName,
      paymentStatus: rec.paymentStatus || 'unpaid', utr: rec.utr || '',
      payment: paymentInfo(rec.tripCode),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not check status.' });
  }
};
