/**
 * login.js — plain JS login integration.
 */

console.log('[login] JS loaded');

const LOGIN_API_URL = 'http://localhost:4000/api/v1/auth/login';

document.addEventListener('DOMContentLoaded', () => {
  console.log('[login] DOM ready');

  if (typeof initRouter === 'function') {
    initRouter();
  }

  const form = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const params = new URLSearchParams(window.location.search);

  if (!form || !emailInput || !passwordInput) {
    console.error('[login] required form elements missing', { form, emailInput, passwordInput });
    return;
  }

  const prefillEmail = params.get('email');
  if (prefillEmail) emailInput.value = prefillEmail;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;
    console.log('[login] form submitted', email, password.length);

    clearErrors();

    if (!validateLogin(email, password)) return;

    setLoading(true);

    try {
      console.log('[login] calling API...');

      const response = await fetch(LOGIN_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const json = await response.json().catch(() => null);
      console.log('[login] API response:', json);

      if (!response.ok || !json?.success) {
        const apiError = json?.error || {};
        const err = new Error(apiError.message || 'Login failed. Please try again.');
        err.code = apiError.code;
        throw err;
      }

      const { token, user } = json.data || {};
      if (!token) throw new Error('Login succeeded but no token was returned.');

      localStorage.setItem('nm_token', token);
      if (user) localStorage.setItem('nm_user', JSON.stringify(user));

      const next = params.get('next');
      window.location.href = next && next.startsWith('/') ? next : '/index.html';
    } catch (err) {
      console.error('[login] failed', err);

      if (err.code === 'EMAIL_NOT_VERIFIED') {
        window.location.href = `/pages/verify-otp.html?email=${encodeURIComponent(email)}`;
        return;
      }

      showFormError(err.message || 'Login failed. Please try again.');
      setLoading(false);
    }
  });

  function setLoading(loading) {
    if (!loginBtn) return;
    loginBtn.disabled = loading;
    loginBtn.textContent = loading ? 'Signing in...' : 'Sign in';
  }
});

function validateLogin(email, password) {
  let ok = true;

  if (!email) {
    showFieldError('emailError', 'Email is required.');
    ok = false;
  }

  if (!password) {
    showFieldError('passwordError', 'Password is required.');
    ok = false;
  }

  return ok;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent   = msg;
  el.style.display = '';
}

function showFormError(msg) {
  const el = document.getElementById('formError');
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
