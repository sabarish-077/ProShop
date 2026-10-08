(() => {
    const message = document.getElementById('account-message');
    const authPanel = document.getElementById('auth-panel');
    const accountPanel = document.getElementById('account-panel');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const verifyPanel = document.getElementById('verify-panel');
    const resendPanel = document.getElementById('resend-panel');
    const passwordResetRequestPanel = document.getElementById('password-reset-request-panel');
    const passwordResetPanel = document.getElementById('password-reset-panel');
    const passwordResetRequestForm = document.getElementById('password-reset-request-form');
    const passwordResetForm = document.getElementById('password-reset-form');
    const verifyParams = new URLSearchParams(window.location.search);

    function csrfToken() {
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
    }

    function setAdminLoginVisibility(isAuthenticated) {
        document.querySelectorAll('.admin-login-button').forEach(link => {
            link.hidden = isAuthenticated;
            link.classList.toggle('d-none', isAuthenticated);
        });
    }

    async function api(path, payload) {
        const response = await fetch(path, {
            method: payload ? 'POST' : 'GET',
            credentials: 'same-origin',
            headers: payload ? { 'Content-Type': 'application/json', 'X-CSRFToken': csrfToken() } : { Accept: 'application/json' },
            body: payload ? JSON.stringify(payload) : undefined
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Something went wrong. Please try again.');
        return result;
    }

    function nextPage() {
        const next = new URLSearchParams(window.location.search).get('next');
        return ['cart.html', 'shop.html', 'index.html', 'order.html'].includes(next) ? next : 'index.html';
    }

    async function loadOrders() {
        const list = document.getElementById('orders-list');
        try {
            const result = await api('/api/orders/');
            list.replaceChildren();
            if (result.orders.length === 0) {
                const empty = document.createElement('p');
                empty.className = 'text-muted';
                empty.textContent = 'You have not placed any orders yet.';
                list.append(empty);
                return;
            }
            for (const order of result.orders) {
                const row = document.createElement('div');
                row.className = 'border rounded-3 p-3 mb-2';
                const title = document.createElement('strong');
                title.textContent = `${order.reference} · ${order.status}`;
                const detail = document.createElement('div');
                detail.className = 'small text-muted mt-1';
                detail.textContent = `${order.items.map(item => `${item.quantity} × ${item.title}`).join(', ')} · ₹${Number(order.total).toLocaleString('en-IN')}`;
                const viewLink = document.createElement('a');
                viewLink.className = 'btn btn-sm btn-outline-secondary mt-2';
                viewLink.href = `/order.html?reference=${encodeURIComponent(order.reference)}`;
                viewLink.textContent = 'View order';
                row.append(title, detail, viewLink);
                list.append(row);
            }
        } catch {
            list.textContent = 'Your orders are temporarily unavailable.';
        }
    }

    async function showAccount(user) {
        authPanel.classList.add('d-none');
        accountPanel.classList.remove('d-none');
        document.getElementById('account-name').textContent = user.name;
        document.getElementById('account-email').textContent = user.email;
        document.getElementById('staff-dashboard-link').classList.toggle('d-none', !user.is_staff);
        await loadOrders();
    }

    document.querySelectorAll('[data-form]').forEach(button => button.addEventListener('click', () => {
        const register = button.dataset.form === 'register';
        loginForm.classList.toggle('d-none', register);
        registerForm.classList.toggle('d-none', !register);
        document.getElementById('login-tab').classList.toggle('active', !register);
        document.getElementById('register-tab').classList.toggle('active', register);
        message.className = 'alert d-none';
    }));

    loginForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!loginForm.reportValidity()) return;
        try {
            const user = await api('/api/auth/login/', Object.fromEntries(new FormData(loginForm)));
            window.location.assign(nextPage());
        } catch (error) { showMessage(error.message, true); }
    });

    document.getElementById('forgot-password-link').addEventListener('click', () => {
        passwordResetRequestForm.elements.email.value = loginForm.elements.email.value;
        authPanel.classList.add('d-none');
        passwordResetRequestPanel.classList.remove('d-none');
        message.className = 'alert d-none';
    });

    document.getElementById('back-to-signin-button').addEventListener('click', () => {
        passwordResetRequestPanel.classList.add('d-none');
        authPanel.classList.remove('d-none');
        message.className = 'alert d-none';
    });

    passwordResetRequestForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!passwordResetRequestForm.reportValidity()) return;
        try {
            const result = await api('/api/auth/password-reset/request/', Object.fromEntries(new FormData(passwordResetRequestForm)));
            showMessage(result.message);
        } catch (error) {
            showMessage(error.message || 'Password reset is temporarily unavailable. Please try again.', true);
        }
    });

    passwordResetForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!passwordResetForm.reportValidity()) return;
        const formData = new FormData(passwordResetForm);
        if (formData.get('password') !== formData.get('confirm_password')) {
            showMessage('The passwords do not match.', true);
            return;
        }
        try {
            const result = await api('/api/auth/password-reset/confirm/', {
                uid: verifyParams.get('reset_uid'),
                token: verifyParams.get('reset_token'),
                password: formData.get('password')
            });
            passwordResetPanel.classList.add('d-none');
            authPanel.classList.remove('d-none');
            passwordResetForm.reset();
            window.history.replaceState({}, '', window.location.pathname);
            showMessage(result.message);
        } catch (error) {
            showMessage(error.message, true);
        }
    });

    registerForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (!registerForm.reportValidity()) return;
        try {
            const result = await api('/api/auth/register/', Object.fromEntries(new FormData(registerForm)));
            authPanel.classList.add('d-none');
            resendPanel.classList.remove('d-none');
            document.getElementById('resend-email').value = registerForm.elements.email.value;
            showMessage(result.verification_sent
                ? 'Account created. Check your email for a verification link before signing in.'
                : 'Account created, but the email could not be sent. Request a new verification link below.', !result.verification_sent);
            registerForm.reset();
        } catch (error) { showMessage(error.message, true); }
    });

    document.getElementById('verify-button').addEventListener('click', async () => {
        try {
            await api('/api/auth/verify/', { uid: verifyParams.get('verify'), token: verifyParams.get('token') });
            window.history.replaceState({}, '', window.location.pathname);
            verifyPanel.classList.add('d-none');
            showMessage('Your email is verified. You can now sign in.');
        } catch (error) {
            if (error.message === 'This verification link is invalid or has expired.') {
                verifyPanel.classList.add('d-none');
                resendPanel.classList.remove('d-none');
                showMessage('This verification link is invalid or has expired. Request a new link below.', true);
            } else {
                showMessage(error.message, true);
            }
        }
    });

    document.getElementById('resend-form').addEventListener('submit', async event => {
        event.preventDefault();
        if (!event.currentTarget.reportValidity()) return;
        try {
            await api('/api/auth/resend-verification/', Object.fromEntries(new FormData(event.currentTarget)));
            showMessage('If that address needs verification, a new link will be sent shortly.');
        } catch { showMessage('We could not send a new link right now. Please try again later.', true); }
    });

    document.getElementById('logout-button').addEventListener('click', async () => {
        try {
            await api('/api/auth/logout/', {});
            window.location.reload();
        } catch (error) { showMessage(error.message, true); }
    });

    const hasPasswordResetLink = verifyParams.has('reset_uid') && verifyParams.has('reset_token');
    const hasEmailVerificationLink = verifyParams.has('verify') && verifyParams.has('token');
    if (hasPasswordResetLink) {
        authPanel.classList.add('d-none');
        passwordResetPanel.classList.remove('d-none');
        showMessage('Choose a new password. This link expires after one hour.');
    } else if (hasEmailVerificationLink) {
        authPanel.classList.add('d-none');
        verifyPanel.classList.remove('d-none');
        showMessage('Confirm that you want to verify this email address.');
    }
    if (!hasPasswordResetLink && !hasEmailVerificationLink) {
        api('/api/auth/status/').then(result => {
            setAdminLoginVisibility(result.authenticated);
            if (result.authenticated) return showAccount(result.user);
        }).catch(() => showMessage('Account service is temporarily unavailable.', true));
    }
})();
