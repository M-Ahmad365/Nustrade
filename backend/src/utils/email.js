'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
  tls: { rejectUnauthorized: false },
});

transporter.verify(function(error) {
  if (error) {
    console.error('[email] SMTP FAILED:', error.message);
  } else {
    console.log('[email] SMTP ready — real emails will send');
  }
});

async function sendOtpEmail(to, otp) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: to,
    subject: 'Your NusTrade verification code',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px;background:#FEFDF9">
        <div style="text-align:center;margin-bottom:32px">
          <div style="background:#0F6E56;color:white;width:52px;height:52px;border-radius:14px;display:inline-block;line-height:52px;font-size:22px;font-weight:600">M</div>
          <h2 style="color:#2C2C2A;margin:12px 0 0">NusTrade</h2>
        </div>
        <h1 style="color:#2C2C2A;font-size:22px;text-align:center;margin:0 0 12px">Verify your email</h1>
        <p style="color:#5F5E5A;font-size:15px;text-align:center;margin:0 0 32px">Enter this code to verify your account. Valid for 10 minutes.</p>
        <div style="background:#0F6E56;color:white;font-size:36px;font-weight:700;text-align:center;padding:24px;border-radius:16px;letter-spacing:12px;margin-bottom:32px">${otp}</div>
        <p style="color:#888780;font-size:13px;text-align:center">If you did not create a NusTrade account, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #F1EFE8;margin:24px 0">
        <p style="color:#888780;font-size:12px;text-align:center">NusTrade — Student marketplace for NUST Islamabad</p>
      </div>
    `,
  });
  console.log('[email] OTP sent to:', to);
}

async function sendPasswordResetEmail(to, otp) {
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: to,
    subject: 'Reset your NusTrade password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px;background:#FEFDF9">
        <div style="text-align:center;margin-bottom:32px">
          <div style="background:#0F6E56;color:white;width:52px;height:52px;border-radius:14px;display:inline-block;line-height:52px;font-size:22px;font-weight:600">M</div>
          <h2 style="color:#2C2C2A;margin:12px 0 0">NusTrade</h2>
        </div>
        <h1 style="color:#2C2C2A;font-size:22px;text-align:center;margin:0 0 12px">Reset your password</h1>
        <p style="color:#5F5E5A;font-size:15px;text-align:center;margin:0 0 32px">Enter this code to reset your password. Valid for 10 minutes.</p>
        <div style="background:#A32D2D;color:white;font-size:36px;font-weight:700;text-align:center;padding:24px;border-radius:16px;letter-spacing:12px;margin-bottom:32px">${otp}</div>
        <p style="color:#888780;font-size:13px;text-align:center">If you did not request this, ignore this email.</p>
        <hr style="border:none;border-top:1px solid #F1EFE8;margin:24px 0">
        <p style="color:#888780;font-size:12px;text-align:center">NusTrade — Student marketplace for NUST Islamabad</p>
      </div>
    `,
  });
  console.log('[email] Reset OTP sent to:', to);
}

module.exports = { sendOtpEmail, sendPasswordResetEmail };
