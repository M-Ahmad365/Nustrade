/**
 * signup.js — plain JS signup integration.
 */

console.log('[signup] JS loaded');

const SIGNUP_API_URL = 'http://localhost:4000/api/v1/auth/signup';
const NUST_EMAIL_RE = /^[a-zA-Z0-9._%+-]+@(nust\.edu\.pk|seecs\.nust\.edu\.pk|s3h\.nust\.edu\.pk|smme\.nust\.edu\.pk|scee\.nust\.edu\.pk|scme\.nust\.edu\.pk|sns\.nust\.edu\.pk|asab\.nust\.edu\.pk|iese\.nust\.edu\.pk|nice\.nust\.edu\.pk|nit\.nust\.edu\.pk|mcs\.nust\.edu\.pk|eme\.nust\.edu\.pk|nbs\.nust\.edu\.pk|seecs\.edu\.pk|nice\.edu\.pk|pnec\.edu\.pk)$/i;

document.addEventListener('DOMContentLoaded', () => {
  console.log('[signup] DOM ready');

  if (typeof initRouter === 'function') {
    initRouter();
  }

  const form = document.getElementById('signupForm');
  const signupBtn = document.getElementById('signupBtn');
  const hostelGroup = document.getElementById('hostelGroup');
  const residenceRadios = document.querySelectorAll('input[name="residenceType"]');

  if (!form) {
    console.error('[signup] #signupForm not found');
    return;
  }

  residenceRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      const isHostellite = document.getElementById('residenceHostellite')?.checked;
      if (hostelGroup) hostelGroup.style.display = isHostellite ? '' : 'none';
      if (!isHostellite) {
        const hostelSelect = document.getElementById('hostelName');
        if (hostelSelect) hostelSelect.value = '';
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    console.log('[signup] submit intercepted');

    clearErrors();

    const payload = getSignupPayload();
    if (!validateSignup(payload)) return;

    setLoading(true);

    try {
      console.log('[signup] sending POST request', {
        url: SIGNUP_API_URL,
        email: payload.email,
      });

      const response = await fetch(SIGNUP_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await response.json().catch(() => null);
      console.log('[signup] response received', response.status, json);

      if (!response.ok || !json?.success) {
        const apiError = json?.error || {};
        throw new Error(apiError.message || 'Signup failed. Please try again.');
      }

      const { token, user } = json.data || {};
      if (token) {
        localStorage.setItem('nm_token', token);
        if (user) localStorage.setItem('nm_user', JSON.stringify(user));
        window.location.href = '/index.html';
        return;
      }

      const devOtp = json.data?.dev_otp ? `&dev_otp=${json.data.dev_otp}` : '';
      window.location.href = `/pages/verify-otp.html?email=${encodeURIComponent(payload.email)}${devOtp}`;
    } catch (err) {
      console.error('[signup] failed', err);
      showFormError(err.message || 'Signup failed. Please try again.');
      setLoading(false);
    }
  });

  function setLoading(loading) {
    if (!signupBtn) return;
    signupBtn.disabled = loading;
    signupBtn.textContent = loading ? 'Creating account...' : 'Create account';
  }
});

function getSignupPayload() {
  const residenceType = document.querySelector('input[name="residenceType"]:checked')?.value || '';
  const hostelName = document.getElementById('hostelName')?.value || undefined;
  const phone = document.getElementById('phone')?.value.trim() || undefined;

  return {
    full_name: document.getElementById('fullName')?.value.trim() || '',
    email: document.getElementById('email')?.value.trim().toLowerCase() || '',
    password: document.getElementById('password')?.value || '',
    confirm_password: document.getElementById('confirmPassword')?.value || '',
    department: document.getElementById('department')?.value || '',
    semester: Number(document.getElementById('semester')?.value || 0),
    residence_type: residenceType,
    hostel_name: hostelName,
    phone_number: phone,
  };
}

function validateSignup(payload) {
  let ok = true;

  if (!payload.full_name) {
    showFieldError('fullNameError', 'Full name is required.');
    ok = false;
  } else if (payload.full_name.length < 3) {
    showFieldError('fullNameError', 'Name must be at least 3 characters.');
    ok = false;
  }

  if (!payload.email) {
    showFieldError('emailError', 'Email is required.');
    ok = false;
  }

  if (!payload.password) {
    showFieldError('passwordError', 'Password is required.');
    ok = false;
  } else if (!/^(?=.*[A-Z])(?=.*\d).{8,}$/.test(payload.password)) {
    showFieldError('passwordError', 'Password must be at least 8 characters with 1 uppercase letter and 1 digit.');
    ok = false;
  }

  if (!payload.confirm_password) {
    showFieldError('confirmPasswordError', 'Please confirm your password.');
    ok = false;
  } else if (payload.password !== payload.confirm_password) {
    showFieldError('confirmPasswordError', 'Passwords do not match.');
    ok = false;
  }

  if (!payload.department) {
    showFieldError('departmentError', 'Please select your department.');
    ok = false;
  }

  if (!payload.semester) {
    showFieldError('semesterError', 'Please select your semester.');
    ok = false;
  }

  if (!payload.residence_type) {
    showFieldError('residenceTypeError', 'Please select your residence type.');
    ok = false;
  }

  if (payload.residence_type === 'hostellite' && !payload.hostel_name) {
    showFieldError('hostelNameError', 'Please select your hostel.');
    ok = false;
  }

  if (payload.phone_number && !/^(\+92|0)\d{10}$/.test(payload.phone_number)) {
    showFieldError('phoneError', 'Enter a valid Pakistani phone number.');
    ok = false;
  }

  delete payload.confirm_password;
  if (payload.residence_type === 'day_scholar') delete payload.hostel_name;
  if (!payload.phone_number) delete payload.phone_number;

  return ok;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent    = msg;
  el.style.display  = '';
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
