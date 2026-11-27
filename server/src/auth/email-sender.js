function createConsoleSender(logger = console) {
  return { async sendOtp(email, code) { logger.log(`[student OTP] ${email}: ${code}`); } };
}
function createSmtpSender(env = process.env) {
  const nodemailer = require('nodemailer');
  const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT || 587),
    secure: Number(env.SMTP_PORT) === 465, auth: { user: env.SMTP_USER, pass: env.SMTP_PASS } });
  return { async sendOtp(email, code) {
    await transport.sendMail({ from: env.MAIL_FROM, to: email, subject: 'Your CampusTriage sign-in code',
      text: `Your CampusTriage sign-in code is ${code}. It expires in 10 minutes.` });
  } };
}
function createEmailSender(env = process.env, logger = console) {
  if (env.OTP_EMAIL_SENDER !== 'smtp') return createConsoleSender(logger);
  for (const name of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'MAIL_FROM']) {
    if (!env[name]) throw new Error(`Missing ${name} for SMTP email sender.`);
  }
  if (!env.SMTP_PORT || !/^\d+$/.test(env.SMTP_PORT)) throw new Error('SMTP_PORT must be a port number.');
  return createSmtpSender(env);
}
module.exports = { createConsoleSender, createSmtpSender, createEmailSender };
