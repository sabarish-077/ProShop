(() => {
    const message = document.getElementById('account-message');
    const authPanel = document.getElementById('auth-panel');
    const accountPanel = document.getElementById('account-panel');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const verifyPanel = document.getElementById('verify-panel');
    const resendPanel = document.getElementById('resend-panel');
    const verifyParams = new URLSearchParams(window.location.search);

    function csrfToken() {
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
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
        return ['cart.html', 'shop.html', 'index.html'].includes(next) ? next : 'index.html';
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
                row.append(title, detail);
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

    if (verifyParams.has('verify') && verifyParams.has('token')) {
        authPanel.classList.add('d-none');
        verifyPanel.classList.remove('d-none');
        showMessage('Confirm that you want to verify this email address.');
    }
    api('/api/auth/status/').then(result => {
        if (result.authenticated) return showAccount(result.user);
    }).catch(() => showMessage('Account service is temporarily unavailable.', true));
})();
