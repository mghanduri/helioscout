/**
 * HelioScout authentication gate.
 *
 * Presents a login screen before the application and personalizes the top-bar
 * profile from the signed-in identity. A returning user with a stored session
 * skips straight to the app; signing out clears the session and returns here.
 *
 * SCOPE / SECURITY: this build has no user directory, so credentials are
 * validated for *shape* only (valid email + minimum-length password) and the
 * session is held in localStorage. This is a UI gate, NOT a security boundary —
 * real credential verification must happen server-side (the backend, or a
 * Supabase/identity provider) before any production use. The app's data still
 * loads behind this gate; harden the backend if access must actually be locked.
 */
(function () {
    'use strict';

    var SESSION_KEY = 'helioscout.session';

    function readSession() {
        try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); }
        catch (e) { return null; }
    }
    function writeSession(s) {
        try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) { /* storage full / blocked */ }
    }
    function clearSession() {
        try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    }

    // Two-letter avatar initials from a display name (falls back to the email).
    function initialsFor(name) {
        var parts = (name || '').trim().split(/[\s._@-]+/).filter(Boolean);
        if (!parts.length) return '–';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    // "rana.almasi@noc.ly" -> "Rana Almasi"
    function displayNameFromEmail(email) {
        var local = (email || '').split('@')[0];
        var words = local.split(/[._-]+/).filter(Boolean);
        if (!words.length) return email;
        return words.map(function (w) {
            return w.charAt(0).toUpperCase() + w.slice(1);
        }).join(' ');
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function applySession(s) {
        var avatar = document.getElementById('user-avatar');
        var nameEl = document.getElementById('user-name');
        var roleEl = document.getElementById('user-role');
        var profile = document.getElementById('user-profile');
        if (avatar) avatar.textContent = s.initials;
        if (nameEl) nameEl.textContent = s.name;
        if (roleEl) roleEl.textContent = s.role;
        if (profile) profile.classList.remove('hidden');
    }

    function showLogin() {
        var screen = document.getElementById('login-screen');
        var profile = document.getElementById('user-profile');
        if (screen) screen.classList.remove('hidden', 'fade-out');
        if (profile) profile.classList.add('hidden');
        var email = document.getElementById('login-email');
        if (email) email.focus();
    }

    function hideLogin(animate) {
        var screen = document.getElementById('login-screen');
        if (!screen) return;
        if (animate) {
            screen.classList.add('fade-out');
            setTimeout(function () { screen.classList.add('hidden'); }, 350);
        } else {
            screen.classList.add('hidden');
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        var form = document.getElementById('login-form');
        var emailInput = document.getElementById('login-email');
        var passInput = document.getElementById('login-password');
        var roleSelect = document.getElementById('login-role');
        var errorEl = document.getElementById('login-error');
        var signoutBtn = document.getElementById('signout-btn');

        // Returning user: restore session and skip the gate.
        var existing = readSession();
        if (existing && existing.email) {
            applySession(existing);
            hideLogin(false);
        } else {
            showLogin();
        }

        if (form) {
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                if (errorEl) errorEl.textContent = '';

                var email = (emailInput.value || '').trim();
                var pass = passInput.value || '';

                if (!isValidEmail(email)) {
                    if (errorEl) errorEl.textContent = 'Enter a valid work email address.';
                    emailInput.focus();
                    return;
                }
                if (pass.length < 6) {
                    if (errorEl) errorEl.textContent = 'Password must be at least 6 characters.';
                    passInput.focus();
                    return;
                }

                var name = displayNameFromEmail(email);
                var session = {
                    email: email,
                    name: name,
                    role: roleSelect ? roleSelect.value : 'Analyst',
                    initials: initialsFor(name),
                    signedInAt: new Date().toISOString()
                };

                writeSession(session);
                applySession(session);
                if (passInput) passInput.value = '';
                hideLogin(true);
            });
        }

        if (signoutBtn) {
            signoutBtn.addEventListener('click', function () {
                clearSession();
                if (passInput) passInput.value = '';
                showLogin();
            });
        }
    });

    // Expose a tiny surface for other modules / console use.
    window.HelioScoutAuth = {
        getSession: readSession,
        signOut: function () { clearSession(); showLogin(); }
    };
})();
