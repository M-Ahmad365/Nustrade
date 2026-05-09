/**
 * forgot-password.js — Two-step password reset controller.
 * Step 1: user enters email → api.auth.forgotPassword() → show step 2.
 * Step 2: user enters OTP + new password → api.auth.resetPassword() → redirect login.
 */

const NUST_EMAIL_RE_FP = /^[a-zA-Z0-9._%+-]+@(nust\.edu\.pk|seecs\.nust\.edu\.pk|s3h\.nust\.edu\.pk|smme\.nust\.edu\.pk|scee\.nust\.edu\.pk|scme\.nust\.edu\.pk|sns\.nust\.edu\.pk|asab\.nust\.edu\.pk|iese\.nust\.edu\.pk|nice\.nust\.edu\.pk|nit\.nust\.edu\.pk|mcs\.nust\.edu\.pk|eme\.nust\.edu\.pk|nbs\.nust\.edu\.pk|seecs\.edu\.pk|nice\.edu\.pk|pnec\.edu\.pk)$/i;

document.addEventListener('DOMContentLoaded', () => {
  initRouter();

  if (auth.redirectIfLoggedIn()) return;

  let savedEmail = '';

  // ── Step 1: Request reset OTP ─────────────────────────────────────

  const forgotForm = document.getElementById('forgotForm');
  const sendOtpBtn = document.getElementById('sendOtpBtn');

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const email = document.getElementById('email').value.trim().toLowerCase();

    if (!email) {
      showFieldError('emailError', 'Email is required.'); return;
    }
    if (!NUST_EMAIL_RE_FP.test(email)) {
      showFieldError('emailError', 'Must be a valid NUST email address'); return;
    }

    sendOtpBtn.disabled    = true;
    sendOtpBtn.textContent = 'Sending…';

    try {
      const result = await api.auth.forgotPassword({ email });

      savedEmail = email;
      document.getElementById('stepEmail').style.display  = 'none';
      document.getElementById('stepReset').style.display  = '';

      // Dev mode: autofill OTP field and show banner
      const devOtp = result?.dev_otp;
      if (devOtp) {
        const otpField = document.getElementById('resetOtp');
        if (otpField) otpField.value = devOtp;
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fffbcc;border:1px solid #e6c200;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#7a6200;text-align:center;';
        banner.textContent = `Dev mode: OTP auto-filled — ${devOtp}`;
        document.getElementById('resetForm').prepend(banner);
      }
    } catch (err) {
      sendOtpBtn.disabled    = false;
      sendOtpBtn.textContent = 'Send reset code';
      showFieldError('formError', err.message || 'Failed to send code. Please try again.');
    }
  });

  // ── Step 2: Submit OTP + new password ────────────────────────────

  const resetForm = document.getElementById('resetForm');
  const resetBtn  = document.getElementById('resetBtn');

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();

    const otp             = document.getElementById('resetOtp').value.trim();
    const newPassword     = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmNewPassword').value;

    let ok = true;

    if (!otp || otp.length !== 6 || !/^\d{6}$/.test(otp)) {
      showFieldError('resetOtpError', 'Enter the 6-digit code from your email.'); ok = false;
    }

    if (!newPassword) {
      showFieldError('newPasswordError', 'New password is required.'); ok = false;
    } else if (newPassword.length < 8) {
      showFieldError('newPasswordError', 'Password must be at least 8 characters.'); ok = false;
    }

    if (!confirmPassword) {
      showFieldError('confirmNewPasswordError', 'Please confirm your new password.'); ok = false;
    } else if (newPassword !== confirmPassword) {
      showFieldError('confirmNewPasswordError', 'Passwords do not match.'); ok = false;
    }

    if (!ok) return;

    resetBtn.disabled    = true;
    resetBtn.textContent = 'Resetting…';

    try {
      await api.auth.resetPassword({
        email:        savedEmail,
        otp,
        new_password: newPassword,
      });

      toast.success('Password reset!', 'You can now sign in with your new password.');
      setTimeout(() => navigate('login', { email: savedEmail }), 1000);
    } catch (err) {
      resetBtn.disabled    = false;
      resetBtn.textContent = 'Reset password';
      showFieldError('resetFormError', err.message || 'Reset failed. Check your code and try again.');
    }
  });
});

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = '';
}

function clearErrors() {
  document.querySelectorAll('.form-error').forEach(el => {
    el.textContent   = '';
    el.style.display = 'none';
  });
}
