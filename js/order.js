(() => {
    const query = new URLSearchParams(window.location.search);
    const reference = query.get('reference');
    const message = document.getElementById('order-message');
    const content = document.getElementById('order-content');
    const form = document.getElementById('delivery-form');

    function showMessage(text, isError = false) {
        message.textContent = text;
        message.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
    }

    function csrfToken() {
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
        return match ? decodeURIComponent(match[1]) : '';
    }

    async function api(path, method = 'GET', payload = null) {
        const headers = { Accept: 'application/json' };
        if (payload) {
            headers['Content-Type'] = 'application/json';
            headers['X-CSRFToken'] = csrfToken();
        }
        const response = await fetch(path, {
            method,
            credentials: 'same-origin',
            headers,
            body: payload ? JSON.stringify(payload) : undefined
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'This request could not be completed.');
        return result;
    }

    function addCell(row, value, className = '') {
        const cell = document.createElement('td');
        cell.textContent = value;
        if (className) cell.className = className;
        row.append(cell);
    }

    function render(order) {
        document.getElementById('order-reference').textContent = order.reference;
        const status = document.getElementById('order-status');
        status.textContent = order.status.replaceAll('_', ' ');
        status.className = `badge ${order.status === 'confirmed' ? 'text-bg-success' : order.status === 'cancelled' ? 'text-bg-danger' : 'text-bg-warning'}`;
        document.getElementById('payment-info').textContent = `${order.payment_method === 'cod' ? 'Cash on delivery · Pay the courier' : 'Razorpay · Online payment'} · ${order.status}`;
        const delivery = order.delivery;
        document.getElementById('delivery-summary').textContent = `${delivery.recipient_name}, ${delivery.address}, ${delivery.city}, ${delivery.region} ${delivery.postal_code}`;
        const items = document.getElementById('order-items');
        items.replaceChildren();
        for (const item of order.items) {
            const row = document.createElement('tr');
            addCell(row, item.title);
            addCell(row, String(item.quantity));
            addCell(row, `₹${Number(item.unit_price).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 'text-end');
            items.append(row);
        }
        document.getElementById('order-subtotal').textContent = `₹${Number(order.subtotal).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        const discount = Number(order.discount);
        document.getElementById('order-discount-row').classList.toggle('d-none', discount <= 0);
        document.getElementById('order-discount').textContent = `−₹${discount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}${order.promo_code ? ` (${order.promo_code})` : ''}`;
        const giftWrap = Number(order.gift_wrap_cost);
        document.getElementById('order-gift-row').classList.toggle('d-none', giftWrap <= 0);
        document.getElementById('order-gift').textContent = `₹${giftWrap.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('order-tax').textContent = `₹${Number(order.tax).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
        document.getElementById('order-total').textContent = `₹${Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

        const canManageCod = order.payment_method === 'cod' && order.status === 'cod_pending';
        document.getElementById('order-actions').classList.toggle('d-none', !canManageCod);
        if (canManageCod) {
            for (const [field, value] of Object.entries(delivery)) {
                if (form.elements[field]) form.elements[field].value = value;
            }
        }
        content.classList.remove('d-none');
    }

    async function loadOrder() {
        if (!reference || reference.length > 20) {
            showMessage('This order link is invalid.', true);
            return;
        }
        try {
            const result = await api(`/api/orders/${encodeURIComponent(reference)}/`);
            render(result.order);
        } catch (error) {
            if (error.message.includes('sign in')) {
                window.location.assign('/account.html?next=order.html');
                return;
            }
            showMessage(error.message || 'Order details are unavailable.', true);
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;
        const button = form.querySelector('button[type="submit"]');
        button.disabled = true;
        try {
            const result = await api(`/api/orders/${encodeURIComponent(reference)}/delivery/`, 'POST', Object.fromEntries(new FormData(form)));
            render(result.order);
            showMessage('Your delivery details have been updated.');
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    document.getElementById('cancel-order-button').addEventListener('click', async event => {
        if (!window.confirm('Cancel this unpaid COD order? The reserved stock will be returned.')) return;
        const button = event.currentTarget;
        button.disabled = true;
        try {
            const result = await api(`/api/orders/${encodeURIComponent(reference)}/cancel/`, 'POST', {});
            render(result.order);
            showMessage('Your order has been cancelled.');
        } catch (error) {
            showMessage(error.message, true);
        } finally {
            button.disabled = false;
        }
    });

    loadOrder();
})();
