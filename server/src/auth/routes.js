const { randomInt, randomBytes, createHash } = require('node:crypto');
const { createSession, requireStudent } = require('./session');

const DOMAIN = '@iiitl.ac.in';
const hashCode = (salt, code) => createHash('sha256').update(`${salt}:${code}`).digest('hex');
const cleanEmail = email => typeof email === 'string' ? email.trim().toLowerCase() : '';
function mountStudentAuth(app, { db, sender, now = () => new Date(), sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex') }) {
  const session = createSession(sessionSecret, now);
  const requireStudentSession = requireStudent(session);
  app.post('/api/auth/student/request-otp', async (req, res) => {
    const email = cleanEmail(req.body?.email);
    if (!/^[^\s@]+@iiitl\.ac\.in$/.test(email)) return res.status(400).json({ error: 'Use a valid @iiitl.ac.in college email address.' });
    const timestamp = now(); const createdAt = timestamp.toISOString();
    const latest = db.prepare('SELECT last_sent_at FROM otp_codes WHERE email = ? ORDER BY id DESC LIMIT 1').get(email);
    if (latest && timestamp - new Date(latest.last_sent_at) < 60_000) {
      const waitSeconds = Math.ceil((60_000 - (timestamp - new Date(latest.last_sent_at))) / 1000);
      return res.status(429).json({ error: `Please wait ${waitSeconds} seconds before requesting another code.`, retryAfter: waitSeconds });
    }
    const count = db.prepare("SELECT COUNT(*) AS n FROM otp_codes WHERE email = ? AND created_at > ?").get(email, new Date(timestamp.getTime() - 60 * 60_000).toISOString()).n;
    if (count >= 5) return res.status(429).json({ error: 'You have reached the 5 code requests per hour limit. Try again later.' });
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    db.prepare('UPDATE otp_codes SET consumed = 1 WHERE email = ? AND consumed = 0').run(email);
    db.prepare('INSERT INTO otp_codes (email, code_hash, expires_at, attempts, consumed, created_at, last_sent_at) VALUES (?, ?, ?, 0, 0, ?, ?)')
      .run(email, `${salt}:${hashCode(salt, code)}`, new Date(timestamp.getTime() + 10 * 60_000).toISOString(), createdAt, createdAt);
    try { await sender.sendOtp(email, code); }
    catch (error) { db.prepare('UPDATE otp_codes SET consumed = 1 WHERE email = ? AND created_at = ?').run(email, createdAt); return res.status(503).json({ error: 'Could not send the code. Please try again later.' }); }
    res.json({ message: 'A sign-in code was sent if the address is eligible.', cooldownSeconds: 60 });
  });
  app.post('/api/auth/student/verify-otp', (req, res) => {
    const email = cleanEmail(req.body?.email); const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    if (!/^[^\s@]+@iiitl\.ac\.in$/.test(email)) return res.status(400).json({ error: 'Use a valid @iiitl.ac.in college email address.' });
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'Enter the 6-digit code.' });
    const otp = db.prepare('SELECT * FROM otp_codes WHERE email = ? ORDER BY id DESC LIMIT 1').get(email);
    if (!otp || otp.consumed || otp.attempts >= 5) return res.status(401).json({ error: 'That code is invalid or has already been used. Request a new code.' });
    if (new Date(otp.expires_at) <= now()) { db.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(otp.id); return res.status(401).json({ error: 'That code has expired. Request a new code.' }); }
    const [salt, expected] = otp.code_hash.split(':');
    if (hashCode(salt, code) !== expected) {
      const attempts = otp.attempts + 1; db.prepare('UPDATE otp_codes SET attempts = ?, consumed = ? WHERE id = ?').run(attempts, attempts >= 5 ? 1 : 0, otp.id);
      return res.status(401).json({ error: attempts >= 5 ? 'Too many incorrect attempts. Request a new code.' : `Incorrect code. ${5 - attempts} attempts remaining.` });
    }
    db.prepare('UPDATE otp_codes SET consumed = 1 WHERE id = ?').run(otp.id);
    const student = db.prepare('INSERT INTO students (email, created_at) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id, email').get(email, now().toISOString());
    session.issue(res, { role: 'student', studentId: student.id });
    res.json({ student: { email: student.email } });
  });
  app.get('/api/auth/student/me', requireStudentSession, (req, res) => {
    const student = db.prepare('SELECT email FROM students WHERE id = ?').get(req.student.studentId);
    if (!student) { session.clear(res); return res.status(401).json({ error: 'Please log in again.' }); }
    res.json({ student });
  });
  app.post('/api/auth/student/logout', (req, res) => { session.clear(res); res.json({ message: 'Logged out.' }); });
  return { session, requireStudent: requireStudentSession };
}
module.exports = { mountStudentAuth, cleanEmail };
