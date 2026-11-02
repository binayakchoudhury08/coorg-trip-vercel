const { body, canonicalEmail, phoneKey, allRecords, paymentInfo, logBlocked } = require('./_store');

// Lets someone who already registered get back to their payment screen
// (e.g. on a new phone). Needs the same email AND phone. Changes nothing.
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = body(req);
  try {
    const rows = await allRecords();
    const rec = rows.find(r => canonicalEmail(r.email) === canonicalEmail(b.email || ''));
    if (!rec || phoneKey(rec.phone) !== phoneKey(b.phone)) {
      await new Promise(r => setTimeout(r, 600));
      if (rec) await logBlocked({ reason: 'resume-mismatch', fullName: String(b.fullName || '').slice(0, 100), email: String(b.email || '').slice(0, 254), phone: String(b.phone || '').slice(0, 25), existingEmail: rec.email, existingName: rec.fullName });
      return res.status(403).json({ error: 'These details don’t match the original registration. Please contact the organisers.' });
    }
    return res.status(200).json({
      ok: true, tripCode: rec.tripCode, email: rec.email, fullName: rec.fullName,
      paymentStatus: rec.paymentStatus || 'unpaid', utr: rec.utr || '',
      payment: paymentInfo(rec.tripCode),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Could not check your registration. Please try again.' });
  }
};
