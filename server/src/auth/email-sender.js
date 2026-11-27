function createConsoleSender(logger = console) {
  return { mode: 'console', async sendOtp(email, code) { logger.log(`[student OTP] ${email}: ${code}`); } };
}
function redact(value, env, otp = '') {
  let message = String(value ?? 'Unknown SMTP error.');
  for (const secret of [env.SMTP_PASS, env.SMTP_USER, otp].filter(Boolean)) message = message.split(String(secret)).join('[redacted]');
  if (otp) message = message.replace(/\b\d{6}\b/g, '[redacted]');
  return message;
}
function createSmtpSender(env = process.env, { logger = console, nodemailerImpl } = {}) {
  const nodemailer = nodemailerImpl || require('nodemailer');
  const port = Number(env.SMTP_PORT || 587);
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port,
    secure: port === 465, requireTLS: port === 587, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  async function sendMail(message, otp = '') {
    try { await transport.sendMail({ from: env.MAIL_FROM, ...message }); }
    catch (error) {
      const details = [redact(error.code, env, otp), error.responseCode && `SMTP ${error.responseCode}`, redact(error.command, env, otp),
        redact(error.message, env, otp)].filter(Boolean).join(' · ');
      const safeMessage = `[student SMTP] Send failed: ${details}`;
      logger.error(safeMessage);
      throw new Error(safeMessage);
    }
  }
  return { mode: 'smtp',
    async sendOtp(email, code) {
      await sendMail({ to: email, subject: 'Your CampusTriage sign-in code',
        text: `Your CampusTriage sign-in code is ${code}. It expires in 10 minutes.` }, code);
    },
    async sendTestEmail(email) {
      await sendMail({ to: email, subject: 'CampusTriage SMTP verification',
        text: 'This is a test message confirming CampusTriage SMTP delivery is configured.' });
    },
  };
}
function createEmailSender(env = process.env, logger = console) {
  if (env.OTP_EMAIL_SENDER !== 'smtp') return createConsoleSender(logger);
  for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) {
    if (!env[name]) throw new Error(`Missing ${name} for SMTP email sender.`);
  }
  if (!env.SMTP_PORT || !/^\d+$/.test(env.SMTP_PORT)) throw new Error('SMTP_PORT must be a port number.');
  return createSmtpSender(env, { logger });
}
module.exports = { createConsoleSender, createSmtpSender, createEmailSender };
