const { randomBytes } = require('node:crypto');
const { createSession, requireStudent } = require('./session');

const EMAIL_PATTERN = /^([a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*)@iiitl\.ac\.in$/i;
function normalizeStudentEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  const match = EMAIL_PATTERN.exec(email);
  if (!match || match[1].length > 64 || email.length > 254) return null;
  return email;
}

function mountStudentAuth(app, { db, now = () => new Date(), sessionSecret = process.env.SESSION_SECRET || randomBytes(32).toString('hex') }) {
  const session = createSession(sessionSecret, now);
  const requireStudentSession = requireStudent(session);
  const loginAttempts = new Map();
  const limit = 10;
  const windowMs = 60_000;

  app.post('/api/auth/student/login', (req, res) => {
    const currentTime = now().getTime();
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    let bucket = loginAttempts.get(ip);
    if (!bucket || bucket.resetAt <= currentTime) {
      if (!bucket && loginAttempts.size >= 10_000) {
        for (const [address, entry] of loginAttempts) if (entry.resetAt <= currentTime) loginAttempts.delete(address);
        if (loginAttempts.size >= 10_000) loginAttempts.delete(loginAttempts.keys().next().value);
      }
      bucket = { count: 0, resetAt: currentTime + windowMs };
      loginAttempts.set(ip, bucket);
    }
    if (bucket.count >= limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Too many login attempts. Please try again in a minute.' });
    }
    bucket.count++;

    const email = normalizeStudentEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Enter a valid college email ending in @iiitl.ac.in.' });
    const student = db.prepare(`INSERT INTO students (email, created_at) VALUES (?, ?)
      ON CONFLICT(email) DO UPDATE SET email = excluded.email RETURNING id, email`).get(email, now().toISOString());
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

module.exports = { mountStudentAuth, normalizeStudentEmail };
