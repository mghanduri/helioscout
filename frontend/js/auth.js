/**
 * HelioScout authentication (real backend accounts).
 *
 * Sign-in is OPTIONAL — the platform is fully usable anonymously. Signing in
 * only enables *personalization*: per-user data saved on the HelioScout backend
 * (points of interest, heat-rate overrides, pinned comparisons, financial
 * defaults). Feature code reacts to sign-in via the 'helioscout:auth-change'
 * event and the HelioScout.Auth API below.
 *
 * Auth model: email/password against the Express backend (/api/auth/*), which
 * issues a JWT. The token is stored in localStorage and sent as a Bearer header
 * on every /api/me/* request via HelioScout.Auth.api(). Credentials are verified
 * server-side (bcrypt) — this is a real boundary for the personalization data,
 * not a cosmetic gate.
 */
(function () {
    'use strict';

    var TOKEN_KEY = 'helioscout.token';

    var token = null;   // JWT string
    var user = null;    // { id, email, name, role }
    var mode = 'login'; // 'login' | 'register'

    function backendUrl() {
        return (window.HELIOSCOUT_CONFIG && window.HELIOSCOUT_CONFIG.BACKEND_URL) || '';
    }

    /* ───────── token storage ───────── */

    function readToken() {
        try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
    }
    function writeToken(t) {
        try { localStorage.setItem(TOKEN_KEY, t); } catch (e) { /* blocked */ }
    }
    function clearToken() {
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    }

    function emitChange() {
        document.dispatchEvent(new CustomEvent('helioscout:auth-change', {
            detail: { signedIn: !!user, user: user }
        }));
    }

    /* ───────── HTTP helper ───────── */

    // fetch wrapper: prefixes the backend URL, attaches the Bearer token, parses
    // JSON, and throws an Error with the server's message on a non-2xx response.
    function api(path, options) {
        options = options || {};
        var headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
        if (token) headers.Authorization = 'Bearer ' + token;
        return fetch(backendUrl() + path, {
            method: options.method || 'GET',
            headers: headers,
            body: options.body != null ? JSON.stringify(options.body) : undefined
        }).then(function (res) {
            return res.text().then(function (text) {
                var data = {};
                if (text) {
                    try {
                        data = JSON.parse(text);
                    } catch (parseErr) {
                        data = { error: text };
                    }
                }
                if (!res.ok) {
                    var err = new Error(data.error || ('Request failed (' + res.status + ')'));
                    err.status = res.status;
                    throw err;
                }
                return data;
            });
        });
    }

    /* ───────── identity helpers ───────── */

    function initialsFor(name, email) {
        var src = (name && name.trim()) || (email || '');
        var parts = src.trim().split(/[\s._@-]+/).filter(Boolean);
        if (!parts.length) return '–';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    function displayName(u) {
        if (u.name && u.name.trim()) return u.name.trim();
        var local = (u.email || '').split('@')[0];
        var words = local.split(/[._-]+/).filter(Boolean);
        return words.map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ') || u.email;
    }

    /* ───────── UI sync ───────── */

    function renderProfile() {
        var signinBtn = document.getElementById('signin-btn');
        var profile = document.getElementById('user-profile');
        var avatar = document.getElementById('user-avatar');
        var nameEl = document.getElementById('user-name');
        var roleEl = document.getElementById('user-role');

        if (user) {
            if (avatar) avatar.textContent = initialsFor(user.name, user.email);
            if (nameEl) nameEl.textContent = displayName(user);
            if (roleEl) roleEl.textContent = user.role || 'Signed in';
            if (profile) profile.classList.remove('hidden');
            if (signinBtn) signinBtn.classList.add('hidden');
        } else {
            if (profile) profile.classList.add('hidden');
            if (signinBtn) signinBtn.classList.remove('hidden');
        }
    }

    function setMode(next) {
        mode = next;
        var isRegister = mode === 'register';
        var heading = document.getElementById('login-heading');
        var submit = document.getElementById('login-submit');
        var nameField = document.getElementById('login-name-field');
        var roleField = document.getElementById('login-role-field');
        var toggleText = document.getElementById('login-toggle-text');
        var toggle = document.getElementById('login-toggle');
        var pass = document.getElementById('login-password');
        var errorEl = document.getElementById('login-error');

        if (heading) heading.textContent = isRegister ? 'Create account' : 'Sign in';
        if (submit) submit.textContent = isRegister ? 'Create account' : 'Sign in';
        if (nameField) nameField.classList.toggle('hidden', !isRegister);
        if (roleField) roleField.classList.toggle('hidden', !isRegister);
        if (toggleText) toggleText.textContent = isRegister ? 'Already have an account?' : 'Don’t have an account?';
        if (toggle) toggle.textContent = isRegister ? 'Sign in' : 'Create one';
        if (pass) pass.setAttribute('autocomplete', isRegister ? 'new-password' : 'current-password');
        if (errorEl) errorEl.textContent = '';
    }

    function openModal() {
        var screen = document.getElementById('login-screen');
        var email = document.getElementById('login-email');
        if (screen) screen.classList.remove('hidden', 'fade-out');
        if (email) email.focus();
    }
    function closeModal() {
        var screen = document.getElementById('login-screen');
        if (!screen) return;
        screen.classList.add('fade-out');
        setTimeout(function () { screen.classList.add('hidden'); screen.classList.remove('fade-out'); }, 300);
    }

    /* ───────── auth actions ───────── */

    function onAuthSuccess(data) {
        token = data.token;
        user = data.user;
        writeToken(token);
        renderProfile();
        emitChange();
    }

    function signOut() {
        token = null;
        user = null;
        clearToken();
        renderProfile();
        emitChange();
    }

    /* ───────── wire-up ───────── */

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('login-form');
        var nameInput = document.getElementById('login-name');
        var emailInput = document.getElementById('login-email');
        var passInput = document.getElementById('login-password');
        var roleSelect = document.getElementById('login-role');
        var errorEl = document.getElementById('login-error');
        var submitBtn = document.getElementById('login-submit');
        var signinBtn = document.getElementById('signin-btn');
        var signoutBtn = document.getElementById('signout-btn');
        var closeBtn = document.getElementById('login-close');
        var toggleBtn = document.getElementById('login-toggle');
        var screen = document.getElementById('login-screen');

        setMode('login');

        // Restore a stored session by validating the token with the backend.
        token = readToken();
        if (token) {
            api('/api/auth/me').then(function (data) {
                user = data.user;
                renderProfile();
                emitChange();
            }).catch(function () {
                // Expired/invalid — drop it silently and stay anonymous.
                signOut();
            });
        } else {
            renderProfile();
        }

        if (signinBtn) signinBtn.addEventListener('click', openModal);
        if (closeBtn) closeBtn.addEventListener('click', closeModal);
        if (toggleBtn) toggleBtn.addEventListener('click', function () {
            setMode(mode === 'login' ? 'register' : 'login');
        });
        if (signoutBtn) signoutBtn.addEventListener('click', function () {
            if (passInput) passInput.value = '';
            signOut();
        });

        if (screen) screen.addEventListener('click', function (e) {
            if (e.target === screen) closeModal();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && screen && !screen.classList.contains('hidden')) closeModal();
        });

        if (form) form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (errorEl) errorEl.textContent = '';

            var email = (emailInput.value || '').trim();
            var pass = passInput.value || '';

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                if (errorEl) errorEl.textContent = 'Enter a valid work email address.';
                emailInput.focus();
                return;
            }
            if (pass.length < 6) {
                if (errorEl) errorEl.textContent = 'Password must be at least 6 characters.';
                passInput.focus();
                return;
            }

            var path = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
            var body = { email: email, password: pass };
            if (mode === 'register') {
                body.name = (nameInput.value || '').trim() || undefined;
                body.role = roleSelect ? roleSelect.value : undefined;
            }

            if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Working…'; }
            api(path, { method: 'POST', body: body })
                .then(function (data) {
                    onAuthSuccess(data);
                    if (passInput) passInput.value = '';
                    closeModal();
                })
                .catch(function (err) {
                    if (errorEl) errorEl.textContent = err.message || 'Sign-in failed. Please try again.';
                })
                .finally(function () {
                    if (submitBtn) submitBtn.disabled = false;
                    setMode(mode); // restore the button label
                });
        });
    });

    /* ───────── public API ───────── */

    window.HelioScout = window.HelioScout || {};
    window.HelioScout.Auth = {
        isSignedIn: function () { return !!user; },
        getUser: function () { return user ? Object.assign({}, user) : null; },
        getToken: function () { return token; },
        api: api,
        signOut: signOut,
        openSignIn: openModal
    };
})();
