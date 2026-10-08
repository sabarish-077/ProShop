// ProShop Luxury Marketplace - Shopping bag and checkout Engine
// Handles Cart Table, Quantity Controls, Protection Plans, Saved For Later, Promo Code Logic, and Step-by-Step Checkout Modal

document.addEventListener('DOMContentLoaded', () => {
    initCartPage();
    window.addEventListener('proshop:catalogready', () => renderCartPage());
    window.addEventListener('proshop:statechange', () => {
        renderCartPage();
    });
});

let giftPackagingSelected = false;
let checkoutAddress = null;

function initCartPage() {
    renderCartPage();
    setupCartListeners();
}

function renderCartPage() {
    renderBagItems();
    renderSavedForLater();
    renderOrderSummary();
    renderUpsellItems();
}

function renderBagItems() {
    const container = document.getElementById('cart-items-container');
    const countBadge = document.getElementById('cart-items-count-header');
    if (!container) return;

    const items = ProShopStore.getCartWithProducts();
    const count = ProShopStore.getCartCount();

    if (countBadge) {
        countBadge.textContent = `${count} ${count === 1 ? 'Item' : 'Items'}`;
    }

    if (items.length === 0) {
        container.innerHTML = `
            <div class="card border rounded-4 p-5 text-center bg-white shadow-sm">
                <div class="mb-3 text-secondary" style="font-size: 54px;">
                    <i class="bi bi-bag"></i>
                </div>
                <h4 style="font-family: var(--ps-font-serif);">Your Shopping Bag is Currently Empty</h4>
                <p class="text-muted small mb-4">Browse watches, audio, and designer goods.</p>
                <div>
                    <a href="shop.html" class="btn btn-gold px-4 py-2">Browse products</a>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = items.map(item => {
        const lineTotal = item.product.price * item.quantity;
        return `
            <article class="cart-item-row" id="cart-item-${item.productId}">
                <div class="cart-item-thumb">
                    <img src="${item.product.image}" alt="${item.product.title}">
                </div>
                <div class="flex-grow-1 min-w-0">
                    <div class="d-flex justify-content-between align-items-start gap-2 mb-1">
                        <div>
                            <span class="text-uppercase text-muted" style="font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em;">${item.product.brand}</span>
                            <h3 class="fs-5 fw-bold mb-1" style="font-family: var(--ps-font-serif);">
                                <a href="product.html?id=${item.product.id}" class="text-dark text-decoration-none">${item.product.title}</a>
                            </h3>
                            <div class="text-muted small mb-2">
                                <span class="me-2">Finish: <strong>${item.finish}</strong></span>
                                ${item.capacity ? `<span>Capacity: <strong>${item.capacity}</strong></span>` : ''}
                            </div>
                        </div>
                        <div class="text-end shrink-0">
                            <div class="fs-5 fw-bold text-dark">${ProShopStore.formatMoney(lineTotal)}</div>
                            <span class="text-muted small">(${ProShopStore.formatMoney(item.product.price)} each)</span>
                        </div>
                    </div>

                    <!-- Protection Plan Option -->
                    <div class="p-2.5 rounded bg-light border my-2.5 d-flex align-items-center justify-content-between">
                        <div class="form-check mb-0">
                            <input class="form-check-input" type="checkbox" id="plan-${item.productId}" 
                                   ${item.hasProtectionPlan ? 'checked' : ''} 
                                   onchange="toggleItemPlan('${item.productId}', this.checked)">
                            <label class="form-check-label small" for="plan-${item.productId}">
                                <strong class="text-dark">ProShop 3-year protection plan</strong>
                                <span class="d-block text-muted" style="font-size: 11px;">Covers accidental drops, spills, and comprehensive horological mechanical servicing.</span>
                            </label>
                        </div>
                        <span class="fw-semibold small text-dark ms-3">+${ProShopStore.formatMoney(item.protectionPlanCost || 120.00)}</span>
                    </div>

                    <!-- Quantity and Action Buttons -->
                    <div class="d-flex justify-content-between align-items-center pt-2 mt-2 border-top">
                        <div class="d-flex align-items-center gap-3">
                            <div class="qty-counter-group" style="height: 32px; width: 104px;">
                                <button type="button" class="qty-counter-btn" onclick="ProShopStore.updateQuantity('${item.productId}', ${item.quantity - 1})">−</button>
                                <input type="text" class="qty-counter-input" value="${item.quantity}" readonly>
                                <button type="button" class="qty-counter-btn" onclick="ProShopStore.updateQuantity('${item.productId}', ${item.quantity + 1})">+</button>
                            </div>
                            <button type="button" class="btn btn-link btn-sm text-muted text-decoration-none p-0 small" onclick="ProShopStore.saveForLater('${item.productId}')">
                                <i class="bi bi-bookmark"></i> Save for Later
                            </button>
                        </div>
                        <button type="button" class="btn btn-link btn-sm text-danger text-decoration-none p-0 small" onclick="ProShopStore.removeFromCart('${item.productId}')">
                            <i class="bi bi-trash3"></i> Remove
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');

    window.toggleItemPlan = function(productId, checked) {
        ProShopStore.toggleProtectionPlan(productId, checked);
    };
}

function renderSavedForLater() {
    const container = document.getElementById('saved-items-container');
    const section = document.getElementById('saved-for-later-section');
    if (!container || !section) return;

    const saved = ProShopStore.getSavedForLater();
    if (saved.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    container.innerHTML = saved.map(item => `
        <div class="col-md-6 mb-3">
            <div class="card border rounded-4 p-3 d-flex flex-row gap-3 align-items-center bg-white shadow-sm">
                <div style="width: 80px; height: 80px; border-radius: 8px; overflow: hidden; background: #f8fafc; flex-shrink: 0; border: 1px solid #e2e8f0;">
                    <img src="${item.product.image}" alt="${item.product.title}" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div class="flex-grow-1 min-w-0">
                    <span class="text-uppercase text-muted" style="font-size: 10px; font-weight: 600;">${item.product.brand}</span>
                    <h5 class="card-product-title fs-6 mb-1 text-truncate">${item.product.title}</h5>
                    <div class="fw-bold text-dark small mb-2">${ProShopStore.formatMoney(item.product.price)}</div>
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-gold btn-sm py-1 px-2.5" style="font-size: 11.5px;" onclick="ProShopStore.moveToCart('${item.product.id}')">
                            <i class="bi bi-bag-plus"></i> Move to Bag
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function renderOrderSummary() {
    const subtotal = ProShopStore.getCartSubtotal();
    const count = ProShopStore.getCartCount();
    const promo = ProShopStore.getAppliedPromo();

    const subtotalEl = document.getElementById('summary-subtotal');
    const shippingEl = document.getElementById('summary-shipping');
    const taxEl = document.getElementById('summary-tax');
    const discountRow = document.getElementById('summary-discount-row');
    const discountEl = document.getElementById('summary-discount');
    const totalEl = document.getElementById('summary-total');
    const promoMsgEl = document.getElementById('promo-status-msg');

    if (!subtotalEl) return;

    subtotalEl.textContent = ProShopStore.formatMoney(subtotal);
    shippingEl.innerHTML = `<span class="text-success fw-semibold">Free</span>`;

    let discountAmount = 0;
    if (promo && subtotal > 0) {
        discountAmount = subtotal * (promo.discountPercent / 100);
        if (discountRow && discountEl) {
            discountRow.style.display = 'flex';
            discountEl.textContent = `-${ProShopStore.formatMoney(discountAmount)} (${promo.code})`;
        }
        if (promoMsgEl) {
            promoMsgEl.innerHTML = `
                <div class="alert alert-success py-1.5 px-2.5 small d-flex justify-content-between align-items-center mb-2">
                    <span><strong>${promo.code}</strong> applied (${promo.discountPercent}% off)</span>
                    <button type="button" class="btn-close" style="font-size: 8px;" onclick="ProShopStore.removePromo()"></button>
                </div>
            `;
        }
    } else {
        if (discountRow) discountRow.style.display = 'none';
        if (promoMsgEl) promoMsgEl.innerHTML = '';
    }

    const giftWrapCost = giftPackagingSelected ? (subtotal > 96150 ? 0 : 25.00) : 0;
    const taxableSubtotal = Math.max(0, subtotal - discountAmount);
    const estimatedTax = taxableSubtotal * 0.0825; // 8.25% NY standard
    const grandTotal = taxableSubtotal + giftWrapCost + estimatedTax;

    if (taxEl) taxEl.textContent = ProShopStore.formatMoney(estimatedTax);
    if (totalEl) totalEl.textContent = ProShopStore.formatMoney(grandTotal);

    // Disable checkout button if empty
    const checkoutBtn = document.getElementById('btn-proceed-checkout');
    if (checkoutBtn) {
        checkoutBtn.disabled = count === 0;
    }
}

function setupCartListeners() {
    // Promo Code form
    const promoForm = document.getElementById('promo-code-form');
    if (promoForm) {
        promoForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = document.getElementById('promo-code-input');
            const code = input ? input.value : '';
            const res = ProShopStore.applyPromo(code);
            if (!res.success) {
                const msg = document.getElementById('promo-status-msg');
                if (msg) {
                    msg.innerHTML = `<div class="alert alert-danger py-1.5 px-2.5 small mb-2">${res.message}</div>`;
                }
            } else {
                if (input) input.value = '';
            }
        });
    }

    // Gift packaging checkbox
    const giftCheck = document.getElementById('gift-packaging-checkbox');
    if (giftCheck) {
        giftCheck.addEventListener('change', (e) => {
            giftPackagingSelected = e.target.checked;
            renderOrderSummary();
        });
    }

    // Checkout modal trigger
    const checkoutBtn = document.getElementById('btn-proceed-checkout');
    if (checkoutBtn) {
        checkoutBtn.addEventListener('click', () => {
            openCheckoutModal();
        });
    }
}

function renderUpsellItems() {
    const container = document.getElementById('cart-upsell-items');
    if (!container || typeof PROSHOP_CATALOG === 'undefined') return;

    const upsells = [
        { id: "u-stand", title: "Beoplay H95 Machined Aluminum Headphone Stand", brand: "Bang & Olufsen", price: 149.00, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuBwDwbGUozAyA_jeGYAEvh3kc8wREmMqK43IVqW0-O-aY0iW-JStWEED5bLQiecWJxiWRWiHMnVa6KQmT0zsIpJbrbdYfcuDSV7oXkyMbCQBNfvNB6gEiufDf6K8FGSPdM0eIjY2oi0URt39MeM0Ltg055p9Y3Fq5roHoKUSEe_9rgQt0u_XruHejw_OfH3IdZQXe2intcKujJuLgnJ1Jf6650QZpuGRRZMkaHHFefRY-hv8y4dQT5OdA" },
        { id: "u-film", title: "Leica Color Instant Film (Twin Pack — 20 Exposures)", brand: "Leica", price: 34.00, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuABoHQRCzxLyKzf2jaIUixmAvpiRolvIGH8MJZOI0ECw6LU4gOCAD7ouNQS8IGDqHMmZPSGwV1TpW2kqWBs8oad74s1O40F3t4P7a5TnhsIUXBZtGQ0_YOhHeSIWyHCD-3U6MLh_L29xpu5ae78pt4TKZWdPmFh-xR-W_WkG5jb1ZxEiV8LZXuJT_qLYKR343riueFmtfso__3MXChwTi85thU_ZLl_pt_GKnGXv23Fz5JWb30KIF4QVg" },
        { id: "u-trimmer", title: "Artisan Solid Brass Candle Wick Trimmer Set", brand: "Diptyque Paris", price: 72.00, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuABoHQRCzxLyKzf2jaIUixmAvpiRolvIGH8MJZOI0ECw6LU4gOCAD7ouNQS8IGDqHMmZPSGwV1TpW2kqWBs8oad74s1O40F3t4P7a5TnhsIUXBZtGQ0_YOhHeSIWyHCD-3U6MLh_L29xpu5ae78pt4TKZWdPmFh-xR-W_WkG5jb1ZxEiV8LZXuJT_qLYKR343riueFmtfso__3MXChwTi85thU_ZLl_pt_GKnGXv23Fz5JWb30KIF4QVg" },
        { id: "u-roll", title: "Full-Grain Italian Saddle Leather Travel Cable Roll", brand: "Bespoke Leather", price: 98.00, image: "https://lh3.googleusercontent.com/aida-public/AB6AXuABoHQRCzxLyKzf2jaIUixmAvpiRolvIGH8MJZOI0ECw6LU4gOCAD7ouNQS8IGDqHMmZPSGwV1TpW2kqWBs8oad74s1O40F3t4P7a5TnhsIUXBZtGQ0_YOhHeSIWyHCD-3U6MLh_L29xpu5ae78pt4TKZWdPmFh-xR-W_WkG5jb1ZxEiV8LZXuJT_qLYKR343riueFmtfso__3MXChwTi85thU_ZLl_pt_GKnGXv23Fz5JWb30KIF4QVg" }
    ];

    container.innerHTML = upsells.map(u => `
        <div class="col-sm-6 col-lg-3 mb-3">
            <div class="card border rounded-4 p-3 bg-white h-100 shadow-sm d-flex flex-column justify-content-between">
                <div>
                    <div style="width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; background: #f8fafc; margin-bottom: 10px; border: 1px solid #e2e8f0;">
                        <img src="${u.image}" alt="${u.title}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                    <span class="text-uppercase text-muted" style="font-size: 10px; font-weight: 600;">${u.brand}</span>
                    <h6 class="fw-bold mb-1 text-truncate" style="font-size: 13px;" title="${u.title}">${u.title}</h6>
                    <div class="fw-bold text-dark small mb-2">${ProShopStore.formatMoney(u.price)}</div>
                </div>
                <button type="button" class="btn btn-outline-luxury btn-sm w-100" onclick="ProShopStore.addToCart('${u.id}', 1, { finish: 'Companion Edition' })">
                    <i class="bi bi-bag-plus"></i> Quick Add
                </button>
            </div>
        </div>
    `).join('');
}

/* ==========================================================================
   CHECKOUT MODAL
   ========================================================================== */

async function openCheckoutModal() {
    try {
        const response = await fetch('/api/auth/status/', { credentials: 'same-origin' });
        const status = await response.json();
        if (!response.ok) throw new Error();
        if (!status.authenticated) {
            window.location.assign('account.html?next=cart.html');
            return;
        }
    } catch {
        const message = document.getElementById('promo-status-msg');
        if (message) message.textContent = 'Account service is unavailable. Please try again.';
        return;
    }

    let modalEl = document.getElementById('proshopCheckoutModal');
    if (!modalEl) {
        const modalHtml = `
            <div class="modal fade" id="proshopCheckoutModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                        <div class="modal-header border-bottom px-4 py-3" style="background: var(--ps-midnight); color: #fff;">
                            <div class="d-flex align-items-center gap-2">
                                <span class="text-warning">✦</span>
                                <h5 class="modal-title mb-0" style="font-family: var(--ps-font-serif);">Secure checkout</h5>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body p-4" id="checkout-modal-body">
                            <!-- Stepper and form -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('proshopCheckoutModal');
    }

    checkoutAddress = null;
    renderCheckoutForm(1);
    const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
    bsModal.show();
}

function renderCheckoutForm(step) {
    const body = document.getElementById('checkout-modal-body');
    if (!body) return;

    const total = document.getElementById('summary-total')?.textContent || '₹0';

    if (step === 1) {
        body.innerHTML = `
            <div class="mb-4">
                <div class="d-flex justify-content-between text-muted small fw-semibold text-uppercase mb-2" style="font-size: 11px; letter-spacing: 0.05em;">
                    <span class="text-warning fw-bold">1. Delivery address</span>
                    <span>2. Delivery</span>
                    <span>3. Payment</span>
                </div>
                <div class="progress" style="height: 4px;">
                    <div class="progress-bar bg-warning" style="width: 33%;"></div>
                </div>
            </div>

            <form onsubmit="event.preventDefault(); saveCheckoutAddress(this); renderCheckoutForm(2);">
                <div class="row g-3">
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">First name</label>
                        <input type="text" class="form-control" name="first_name" required autocomplete="given-name" maxlength="75">
                    </div>
                    <div class="col-md-6">
                        <label class="form-label small fw-semibold">Last name</label>
                        <input type="text" class="form-control" name="last_name" required autocomplete="family-name" maxlength="75">
                    </div>
                    <div class="col-12">
                        <label class="form-label small fw-semibold">Delivery Address (Residence or Private Suite)</label>
                        <input type="text" class="form-control" name="address" required autocomplete="street-address" maxlength="300">
                    </div>
                    <div class="col-md-5">
                        <label class="form-label small fw-semibold">City</label>
                        <input type="text" class="form-control" name="city" required autocomplete="address-level2" maxlength="120">
                    </div>
                    <div class="col-md-4">
                        <label class="form-label small fw-semibold">State</label>
                        <input type="text" class="form-control" name="region" required autocomplete="address-level1" maxlength="120">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label small fw-semibold">Postal Code</label>
                        <input type="text" class="form-control" name="postal_code" required autocomplete="postal-code" maxlength="24">
                    </div>
                </div>

                <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                    <span class="fw-bold">Total: ${total}</span>
                    <button type="submit" class="btn btn-gold px-4 py-2">Continue »</button>
                </div>
            </form>
        `;
    } else if (step === 2) {
        body.innerHTML = `
            <div class="mb-4">
                <div class="d-flex justify-content-between text-muted small fw-semibold text-uppercase mb-2" style="font-size: 11px; letter-spacing: 0.05em;">
                    <span class="text-success">✓ 1. Address</span>
                    <span class="text-warning fw-bold">2. Delivery</span>
                    <span>3. Payment</span>
                </div>
                <div class="progress" style="height: 4px;">
                    <div class="progress-bar bg-warning" style="width: 66%;"></div>
                </div>
            </div>

            <div class="mb-4">
                <label class="form-check p-3 border rounded-3 mb-2 d-flex align-items-center justify-content-between cursor-pointer">
                    <div class="d-flex align-items-center gap-3">
                        <input class="form-check-input mt-0" type="radio" name="transit" checked>
                        <div>
                            <strong class="d-block small">Secure delivery</strong>
                            <span class="text-muted small">Delivered in secure packaging by an insured courier.</span>
                        </div>
                    </div>
                    <span class="badge bg-success-subtle text-success">Free</span>
                </label>
                <label class="form-check p-3 border rounded-3 mb-2 d-flex align-items-center justify-content-between cursor-pointer">
                    <div class="d-flex align-items-center gap-3">
                        <input class="form-check-input mt-0" type="radio" name="transit">
                        <div>
                            <strong class="d-block small">Fast delivery</strong>
                            <span class="text-muted small">We will confirm the delivery time after you place the order.</span>
                        </div>
                    </div>
                    <span class="badge bg-secondary-subtle text-secondary">Availability varies</span>
                </label>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                <button type="button" class="btn btn-outline-luxury" onclick="renderCheckoutForm(1)">« Back to Address</button>
                <button type="button" class="btn btn-gold px-4 py-2" onclick="renderCheckoutForm(3)">Continue to payment »</button>
            </div>
        `;
    } else if (step === 3) {
        body.innerHTML = `
            <div class="mb-4">
                <div class="d-flex justify-content-between text-muted small fw-semibold text-uppercase mb-2" style="font-size: 11px; letter-spacing: 0.05em;">
                    <span class="text-success">✓ 1. Address</span>
                    <span class="text-success">✓ 2. Transit</span>
                    <span class="text-warning fw-bold">3. Payment</span>
                </div>
                <div class="progress" style="height: 4px;">
                    <div class="progress-bar bg-warning" style="width: 100%;"></div>
                </div>
            </div>

            <form onsubmit="event.preventDefault(); completeOrder(this.querySelector('button[type=submit]'))">
                <div class="mb-3">
                    <label class="form-check p-3 border rounded-3 mb-2 d-flex align-items-center gap-3">
                        <input class="form-check-input mt-0" type="radio" name="payment_method" value="razorpay" checked>
                        <span><strong class="d-block small">Pay online with Razorpay</strong><span class="text-muted small">Secure payment by UPI, card, or net banking.</span></span>
                    </label>
                    <label class="form-check p-3 border rounded-3 mb-2 d-flex align-items-center gap-3">
                        <input class="form-check-input mt-0" type="radio" name="payment_method" value="cod">
                        <span><strong class="d-block small">Cash on delivery</strong><span class="text-muted small">Pay the courier in cash when your order arrives.</span></span>
                    </label>
                </div>

                <div class="d-flex justify-content-between align-items-center mt-4 pt-3 border-top">
                    <button type="button" class="btn btn-outline-luxury" onclick="renderCheckoutForm(2)">« Back to delivery</button>
                    <button type="submit" class="btn btn-gold px-4 py-2.5">
                        <i class="bi bi-bag-check-fill"></i> Place order · ${total}
                    </button>
                </div>
            </form>
        `;
    }
}

function saveCheckoutAddress(form) {
    checkoutAddress = Object.fromEntries(new FormData(form).entries());
}

async function completeOrder(button) {
    const body = document.getElementById('checkout-modal-body');
    if (!body) return;
    if (!checkoutAddress) {
        renderCheckoutForm(1);
        return;
    }
    if (button) button.disabled = true;
    try {
        const csrf = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
        const response = await fetch('/api/orders/', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf ? decodeURIComponent(csrf[1]) : '' },
            body: JSON.stringify({
                address: checkoutAddress,
                items: ProShopStore.getCart().map(item => ({
                    product_id: item.productId,
                    quantity: item.quantity,
                    has_protection_plan: Boolean(item.hasProtectionPlan)
                })),
                promo_code: ProShopStore.getAppliedPromo()?.code || '',
                gift_packaging: Boolean(document.getElementById('gift-packaging-checkbox')?.checked),
                payment_method: body.querySelector('input[name="payment_method"]:checked')?.value || 'razorpay'
            })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'We could not place your order. Please try again.');
        if (result.payment_method === 'cod') {
            showOrderConfirmation(body, result.order);
            return;
        }
        if (typeof Razorpay === 'undefined') throw new Error('Secure checkout did not load. Please refresh and try again.');
        const payment = new Razorpay({
            key: result.key_id,
            amount: result.amount,
            currency: result.currency,
            name: 'ProShop',
            description: `Order ${result.order.reference}`,
            order_id: result.order.razorpay_order_id,
            prefill: { name: checkoutAddress.first_name + ' ' + checkoutAddress.last_name },
            theme: { color: '#c9a45c' },
            handler: async response => {
                try {
                    const csrf = document.cookie.match(/(?:^|; )csrftoken=([^;]*)/);
                    const verification = await fetch('/api/payments/razorpay/verify/', {
                        method: 'POST', credentials: 'same-origin',
                        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf ? decodeURIComponent(csrf[1]) : '' },
                        body: JSON.stringify({ reference: result.order.reference, ...response })
                    });
                    const confirmed = await verification.json().catch(() => ({}));
                    if (!verification.ok) throw new Error(confirmed.error || 'Payment was received but could not be confirmed yet. Please contact support.');
                    showOrderConfirmation(body, confirmed.order);
                } catch (error) {
                    body.innerHTML = `<div class="alert alert-warning" role="status"></div>`;
                    body.querySelector('.alert').textContent = error.message;
                }
            },
            modal: { ondismiss: () => { if (button) button.disabled = false; } }
        });
        payment.open();
    } catch (error) {
        const alert = document.createElement('div');
        alert.className = 'alert alert-danger';
        alert.textContent = error.message || 'We could not start secure checkout. Please try again.';
        body.prepend(alert);
        if (button) button.disabled = false;
    }
}

function showOrderConfirmation(body, order) {
        const isCashOnDelivery = order.payment_method === 'cod';
        body.innerHTML = `
            <div class="text-center py-5">
                <div class="mb-3 text-warning fs-1">✓</div>
                <h3 class="fw-bold mb-2">${isCashOnDelivery ? 'Order placed' : 'Payment confirmed'}</h3>
                <p class="text-muted small mb-2">Order number: <strong>${order.reference}</strong></p>
                <p class="text-muted small max-w-md mx-auto mb-4">${isCashOnDelivery ? 'Pay cash to the courier when your order is delivered.' : 'Your payment is confirmed and your order is being prepared.'}</p>
                <div class="d-flex justify-content-center gap-3">
                    <a href="index.html" class="btn btn-gold px-4" data-bs-dismiss="modal">Back to home</a>
                    <a href="account.html" class="btn btn-outline-luxury px-4" data-bs-dismiss="modal">View your orders</a>
                </div>
            </div>`;
        localStorage.removeItem('proshop_cart_v1');
        localStorage.removeItem('proshop_promo_v1');
        ProShopStore.broadcastChange();
}
