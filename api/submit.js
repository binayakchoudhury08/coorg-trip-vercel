const { redis, KEY, CODES, paymentInfo, body, canonicalEmail, phoneKey, allRecords, logBlocked } = require('./_store');

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no look-alike characters

async function newTripCode(email) {
  for (let i = 0; i < 20; i++) {
    let code = 'CRG-';
    for (let k = 0; k < 4; k++) code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    if (await redis(['HSETNX', CODES, code, email]) === 1) return code;
  }
  throw new Error('Could not create a trip code');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const b = body(req);

  if (b.website) return res.status(200).json({ ok: true }); // spam bot

  const fullName = clean(b.fullName, 100);
  const email = clean(b.email, 254).toLowerCase();
  const phone = clean(b.phone, 25);
  const cohort = b.cohort === 'UG1' || b.cohort === 'UG2' ? b.cohort : '';
  const digits = phone.replace(/\D/g, '');

  if (fullName.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid Mesa email address.' });
  if (!cohort) return res.status(400).json({ error: 'Please choose your cohort batch (UG1 or UG2).' });
  if (digits.length < 8 || digits.length > 15) return res.status(400).json({ error: 'Please enter a valid phone number.' });

  const domain = (process.env.ALLOWED_EMAIL_DOMAIN || '').toLowerCase().replace(/^@/, '');
  if (domain && !email.endsWith('@' + domain)) {
    return res.status(400).json({ error: `Please use your Mesa email (ending in @${domain}).` });
  }

  try {
    // One registration per email (and per phone number). Repeats are refused and logged for audit.
    const rows = await allRecords();
    const canon = canonicalEmail(email);
    const sameEmail = rows.find(r => canonicalEmail(r.email) === canon);
    if (sameEmail) {
      await logBlocked({ reason: 'email', fullName, email, phone, cohort, existingEmail: sameEmail.email, existingName: sameEmail.fullName });
      return res.status(409).json({
        code: 'DUPLICATE_EMAIL',
        error: 'This email has already been used to register. Each email can be used only once.',
      });
    }
    const samePhone = rows.find(r => phoneKey(r.phone) === phoneKey(phone));
    if (samePhone) {
      await logBlocked({ reason: 'phone', fullName, email, phone, cohort, existingEmail: samePhone.email, existingName: samePhone.fullName });
      return res.status(409).json({
        code: 'DUPLICATE_PHONE',
        error: 'This phone number is already registered with another email. Each person can register only once.',
      });
    }

    const now = new Date().toISOString();
    const tripCode = await newTripCode(email);
    const record = {
      fullName, email, cohort, phone, tripCode,
      paymentStatus: 'unpaid',   // unpaid → submitted → paid (or issue)
      utr: '', paymentReportedAt: '', verifiedAt: '',
      submittedAt: now, updatedAt: now,
    };
    // HSETNX: even two taps at the same instant can't create two registrations.
    if (await redis(['HSETNX', KEY, email, JSON.stringify(record)]) !== 1) {
      return res.status(409).json({ code: 'DUPLICATE_EMAIL', error: 'This email has already been used to register. Each email can be used only once.' });
    }
    return res.status(200).json({
      ok: true, tripCode, email, fullName, paymentStatus: 'unpaid', utr: '',
      payment: paymentInfo(tripCode),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Your details could not be saved. Please try again in a minute.' });
  }
};
