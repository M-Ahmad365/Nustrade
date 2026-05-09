/**
 * verify-otp.js — OTP verification page controller.
 * 6 separate digit boxes with auto-advance, paste support.
 * Resend button with 60s cooldown.
 * On success: stores session, redirects to home.
 */

const RESEND_COOLDOWN = 60;

document.addEventListener('DOMContentLoaded', () => {
  initRouter();

  const params    = new URLSearchParams(window.location.search);
  const email     = params.get('email') || '';
  const verifyBtn = document.getElementById('verifyBtn');
  const resendBtn = document.getElementById('resendBtn');
  const otpBoxes  = [...document.querySelectorAll('.otp-box')];

  if (email) {
    const subtitle = document.getElementById('otpSubtitle');
    if (subtitle) subtitle.textContent = `We sent a 6-digit code to ${email}`;
  }

  // Dev mode: if signup returned dev_otp, autofill boxes and show banner
  const devOtp = params.get('dev_otp') || '';
  if (devOtp && devOtp.length === 6) {
    devOtp.split('').forEach((char, i) => { if (otpBoxes[i]) otpBoxes[i].value = char; });
    const banner = document.createElement('div');
    banner.style.cssText = 'background:#fffbcc;border:1px solid #e6c200;border-radius:6px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:#7a6200;text-align:center;';
    banner.textContent = `Dev mode: OTP auto-filled — ${devOtp}`;
    document.getElementById('otpForm').prepend(banner);
  }

  // ── OTP box behaviour ─────────────────────────────────────────────

  otpBoxes.forEach((box, i) => {
    box.addEventListener('input', (e) => {
      // Only allow digits
      const val = e.target.value.replace(/\D/g, '');
      e.target.value = val ? val[val.length - 1] : '';

      if (val && i < otpBoxes.length - 1) {
        otpBoxes[i + 1].focus();
      }
    });

    box.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !box.value && i > 0) {
        otpBoxes[i - 1].focus();
        otpBoxes[i - 1].value = '';
      }
      // Submit on Enter when last box filled
      if (e.key === 'Enter') {
        document.getElementById('otpForm').dispatchEvent(new Event('submit'));
      }
    });

    box.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
      pasted.split('').slice(0, 6).forEach((char, j) => {
        if (otpBoxes[j]) otpBoxes[j].value = char;
      });
      const nextEmpty = otpBoxes.findIndex(b => !b.value);
      (otpBoxes[nextEmpty] || otpBoxes[5]).focus();
    });
  });

  // ── Form submit ───────────────────────────────────────────────────

  document.getElementById('otpForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const otp = otpBoxes.map(b => b.value).join('');
    if (otp.length !== 6) {
      showError('Please enter all 6 digits.');
      return;
    }

    if (!email) {
      showError('No email found. Please sign up again.');
      return;
    }

    setLoading(true);

    try {
      const data = await api.auth.verifyOtp({ email, otp });

      auth.setSession(data.token, data.user);
      toast.success('Email verified!', 'Welcome to NusTrade.');

      setTimeout(() => navigate('home'), 800);
    } catch (err) {
      setLoading(false);
      showError(err.message || 'Invalid or expired code.');
    }
  });

  // ── Resend cooldown ───────────────────────────────────────────────

  let cooldownInterval = null;

  function startResendCooldown() {
    let remaining = RESEND_COOLDOWN;
    resendBtn.disabled = true;

    const timerEl    = document.getElementById('resendTimer');
    const countEl    = document.getElementById('resendCountdown');
    if (timerEl) timerEl.style.display = '';
    if (countEl) countEl.textContent = remaining;

    cooldownInterval = setInterval(() => {
      remaining--;
      if (countEl) countEl.textContent = remaining;

      if (remaining <= 0) {
        clearInterval(cooldownInterval);
        resendBtn.disabled = false;
        if (timerEl) timerEl.style.display = 'none';
      }
    }, 1000);
  }

  // Start cooldown immediately — code was just sent
  startResendCooldown();

  resendBtn.addEventListener('click', async () => {
    if (!email) return;

    try {
      await api.auth.resendOtp({ email });
      toast.success('Code resent', 'Check your inbox.');
      startResendCooldown();
      otpBoxes.forEach(b => { b.value = ''; });
      otpBoxes[0].focus();
      clearError();
    } catch (err) {
      toast.fromError(err);
    }
  });

  // ── Helpers ───────────────────────────────────────────────────────

  function setLoading(loading) {
    verifyBtn.disabled    = loading;
    verifyBtn.textContent = loading ? 'Verifying…' : 'Verify email';
  }

  function showError(msg) {
    const otpErr  = document.getElementById('otpError');
    const formErr = document.getElementById('formError');
    if (otpErr)  { otpErr.textContent  = msg; otpErr.style.display  = ''; }
    if (formErr) { formErr.textContent = msg; formErr.style.display = ''; }
  }

  function clearError() {
    ['otpError', 'formError'].forEach(id => {
      const el = document.getElementById(id);
      if (el) { el.textContent = ''; el.style.display = 'none'; }
    });
  }
});
