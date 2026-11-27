const { createEmailSender } = require('../src/auth/email-sender');

async function main() {
  const recipient = process.argv[2];
  if (!recipient || process.argv.length > 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
    throw new Error('Usage: npm run verify:email -- recipient@example.com');
  }
  if (process.env.OTP_EMAIL_SENDER !== 'smtp') {
    throw new Error('SMTP is not selected. Set OTP_EMAIL_SENDER=smtp in server/.env, then restart this command.');
  }
  const sender = createEmailSender(process.env);
  await sender.sendTestEmail(recipient);
  console.log(`SMTP verification email sent to ${recipient}. Check the inbox and spam folder.`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
