const { createHmac, timingSafeEqual } = require('node:crypto');

const COOKIE = 'campustriage_session';
const MAX_AGE_SECONDS = 60 * 60 * 12;
function sign(value, secret) { return createHmac('sha256', secret).update(value).digest('base64url'); }
function cookieOptions(maxAge = MAX_AGE_SECONDS) {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}
function createSession(secret, now = () => new Date()) {
  function issue(res, payload) {
    const value = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(now().getTime() / 1000) + MAX_AGE_SECONDS })).toString('base64url');
    res.setHeader('Set-Cookie', `${COOKIE}=${value}.${sign(value, secret)}; ${cookieOptions()}`);
  }
  function clear(res) { res.setHeader('Set-Cookie', `${COOKIE}=; ${cookieOptions(0)}`); }
  function read(req) {
    const raw = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
    if (!raw) return null;
    const [value, signature] = raw.split('.');
    if (!value || !signature) return null;
    const expected = Buffer.from(sign(value, secret)); const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    try {
      const session = JSON.parse(Buffer.from(value, 'base64url').toString());
      return session.exp > Math.floor(now().getTime() / 1000) ? session : null;
    } catch { return null; }
  }
  return { issue, clear, read };
}
function requireStudent(session) {
  return (req, res, next) => {
    const current = session.read(req);
    if (!current || current.role !== 'student' || !Number.isSafeInteger(current.studentId)) {
      return res.status(401).json({ error: 'Please log in with your student email to continue.' });
    }
    req.student = current;
    next();
  };
}
module.exports = { createSession, requireStudent };
