const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createConsoleSender, createEmailSender, createSmtpSender } = require('../src/auth/email-sender');

const credentials = { SMTP_HOST: 'smtp.example.test', SMTP_PORT: '587', SMTP_USER: 'account@example.test',
  SMTP_PASS: 'secret-app-password', MAIL_FROM: 'CampusTriage <sender@example.test>' };

test('console is the default sender and is the only sender that logs an OTP', async () => {
  const messages = []; const logger = { log: message => messages.push(message), error: message => messages.push(message) };
  const sender = createEmailSender({}, logger);
  assert.equal(sender.mode, 'console');
  await sender.sendOtp('student@iiitl.ac.in', '123456');
  assert.deepEqual(messages, ['[student OTP] student@iiitl.ac.in: 123456']);
});

test('SMTP uses STARTTLS on 587 and SSL on 465 and sends a test message without OTP', async () => {
  for (const [port, secure, requireTLS] of [[587, false, true], [465, true, false]]) {
    let options; let sent;
    const sender = createSmtpSender({ ...credentials, SMTP_PORT: String(port) }, {
      logger: { error() {} }, nodemailerImpl: { createTransport(config) { options = config; return { async sendMail(message) { sent = message; } }; } },
    });
    await sender.sendTestEmail('test-recipient@example.com');
    assert.equal(options.port, port); assert.equal(options.secure, secure); assert.equal(options.requireTLS, requireTLS);
    assert.equal(options.auth.user, credentials.SMTP_USER); assert.equal(options.auth.pass, credentials.SMTP_PASS);
    assert.equal(sent.to, 'test-recipient@example.com'); assert.match(sent.subject, /verification/);
    assert.equal(JSON.stringify(sent).includes('123456'), false);
  }
});

test('SMTP failures log a useful error while redacting password, username and OTP', async () => {
  const output = [];
  const otp = '987321';
  const sender = createSmtpSender(credentials, {
    logger: { error: message => output.push(message) },
    nodemailerImpl: { createTransport() { return { async sendMail() {
      const error = new Error(`Connection rejected for ${credentials.SMTP_USER}; ${credentials.SMTP_PASS}; code ${otp}`);
      error.code = `EAUTH-${credentials.SMTP_PASS}`; error.responseCode = 535;
      error.command = `AUTH ${credentials.SMTP_PASS} ${otp}`; throw error;
    } }; } },
  });
  await assert.rejects(sender.sendOtp('student@iiitl.ac.in', otp), /EAUTH.*535/);
  assert.equal(output.length, 1);
  for (const secret of [credentials.SMTP_USER, credentials.SMTP_PASS, otp]) {
    assert.equal(output[0].includes(secret), false);
  }
  assert.match(output[0], /AUTH \[redacted\]/);
});
