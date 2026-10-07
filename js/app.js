// ProShop Luxury Marketplace - Core Application Engine
// Manages Global UI Components: Cart Drawer, Quick View Modal, Concierge Modal, Global Search

document.addEventListener('DOMContentLoaded', () => {
    initCartDrawer();
    initQuickViewModal();
    initConciergeModal();
    initGlobalSearch();
    initNewsletterForms();
    initProductCardListeners();
    initAccountLinks();
    updateCatalogCount();
    if (window.PROSHOP_CATALOG_API_ERROR) showCatalogUnavailableNotice();

    window.addEventListener('proshop:catalogready', updateCatalogCount);
    window.addEventListener('proshop:catalogunavailable', showCatalogUnavailableNotice);

    // Listen for state changes
    window.addEventListener('proshop:statechange', () => {
        renderCartDrawer();
    });
});

function updateCatalogCount() {
    const count = document.getElementById('catalog-total-count');
    if (count && typeof PROSHOP_CATALOG !== 'undefined' && Array.isArray(PROSHOP_CATALOG)) {
        const total = PROSHOP_CATALOG.length;
        count.textContent = `${total.toLocaleString('en-IN')} ${total === 1 ? 'product' : 'products'}`;
    }
}

function showCatalogUnavailableNotice() {
    if (!/\/(?:index\.html|shop\.html|product\.html)?$/.test(window.location.pathname)) return;
    if (document.getElementById('catalog-unavailable-notice')) return;

    const notice = document.createElement('div');
    notice.id = 'catalog-unavailable-notice';
    notice.className = 'alert alert-warning text-center rounded-0 mb-0';
    notice.setAttribute('role', 'alert');
    notice.textContent = 'Live product data is unavailable. Showing sample products; stock and prices may be out of date.';
    const main = document.querySelector('main');
    if (main?.parentNode) main.parentNode.insertBefore(notice, main);
    else document.body.prepend(notice);
}

function initAccountLinks() {
    const label = document.querySelector('.account-link-label');
    if (!label) return;
    fetch('/api/auth/status/', { credentials: 'same-origin' })
        .then(response => response.ok ? response.json() : Promise.reject())
        .then(result => {
            label.textContent = result.authenticated ? (result.user.name || 'My account') : 'Sign in';
        })
        .catch(() => { label.textContent = 'Account'; });
}

/* ==========================================================================
   OFFCANVAS CART DRAWER
   ========================================================================== */

function initCartDrawer() {
    // Check if drawer exists in DOM, if not inject it
    if (!document.getElementById('proshopCartDrawer')) {
        const drawerHtml = `
            <div class="offcanvas offcanvas-end offcanvas-luxury" tabindex="-1" id="proshopCartDrawer" aria-labelledby="cartDrawerLabel">
                <div class="offcanvas-header d-flex justify-content-between align-items-center px-4 py-3">
                    <div class="d-flex align-items-center gap-2">
                        <i class="bi bi-bag-check text-warning fs-5"></i>
                        <h5 class="offcanvas-title text-white mb-0" id="cartDrawerLabel" style="font-family: var(--ps-font-serif); font-size: 18px;">Your Shopping Bag</h5>
                    </div>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
                </div>
                <div class="offcanvas-body d-flex flex-column p-4">
                    <div id="cartDrawerItemsList" class="flex-grow-1 overflow-auto pe-1">
                        <!-- Rendered dynamically -->
                    </div>
                    <div id="cartDrawerFooter" class="border-top pt-3 mt-3">
                        <!-- Subtotal and buttons -->
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', drawerHtml);
    }

    renderCartDrawer();

    // Attach click triggers to open bag drawer
    document.querySelectorAll('.open-cart-drawer').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const drawerEl = document.getElementById('proshopCartDrawer');
            if (drawerEl && window.bootstrap) {
                const bsOffcanvas = bootstrap.Offcanvas.getOrCreateInstance(drawerEl);
                renderCartDrawer();
                bsOffcanvas.show();
            }
        });
    });
}

function renderCartDrawer() {
    const listEl = document.getElementById('cartDrawerItemsList');
    const footerEl = document.getElementById('cartDrawerFooter');
    if (!listEl || !footerEl) return;

    const items = ProShopStore.getCartWithProducts();
    const count = ProShopStore.getCartCount();
    const subtotal = ProShopStore.getCartSubtotal();

    if (items.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-5">
                <div class="mb-3 text-secondary" style="font-size: 48px;">
                    <i class="bi bi-bag-x"></i>
                </div>
                <h5 style="font-family: var(--ps-font-serif);">Your Bag is Empty</h5>
                <p class="text-muted small mb-4">Browse watches, audio, and designer goods.</p>
                <a href="shop.html" class="btn btn-gold w-100">Browse products</a>
            </div>
        `;
        footerEl.innerHTML = '';
        return;
    }

    let itemsHtml = '';
    items.forEach(item => {
        const itemTotal = item.product.price * item.quantity;
        itemsHtml += `
            <div class="d-flex gap-3 mb-3 pb-3 border-bottom align-items-center">
                <div style="width: 70px; height: 70px; border-radius: 8px; overflow: hidden; background: #f8fafc; flex-shrink: 0; border: 1px solid #e2e8f0;">
                    <img src="${item.product.image}" alt="${item.product.title}" style="width: 100%; height: 100%; object-fit: cover;">
                </div>
                <div class="flex-grow-1 min-w-0">
                    <span class="text-uppercase text-muted" style="font-size: 10px; font-weight: 600; letter-spacing: 0.05em;">${item.product.brand}</span>
                    <a href="product.html?id=${item.product.id}" class="d-block text-dark fw-semibold text-truncate text-decoration-none" style="font-size: 13px;">${item.product.title}</a>
                    <span class="text-muted" style="font-size: 11px;">${item.finish}</span>
                    <div class="d-flex justify-content-between align-items-center mt-2">
                        <div class="d-flex align-items-center border rounded bg-light" style="height: 28px;">
                            <button type="button" class="btn btn-sm btn-link text-dark p-0 px-2 text-decoration-none" onclick="ProShopStore.updateQuantity('${item.productId}', ${item.quantity - 1})">−</button>
                            <span class="px-2 small fw-semibold">${item.quantity}</span>
                            <button type="button" class="btn btn-sm btn-link text-dark p-0 px-2 text-decoration-none" onclick="ProShopStore.updateQuantity('${item.productId}', ${item.quantity + 1})">+</button>
                        </div>
                        <span class="fw-bold" style="font-size: 13px;">${ProShopStore.formatMoney(itemTotal)}</span>
                    </div>
                </div>
                <button type="button" class="btn btn-link text-danger p-0 ms-1" title="Remove" onclick="ProShopStore.removeFromCart('${item.productId}')">
                    <i class="bi bi-trash3" style="font-size: 14px;"></i>
                </button>
            </div>
        `;
    });

    listEl.innerHTML = itemsHtml;

    footerEl.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="text-muted" style="font-size: 13px;">Subtotal (${count} items):</span>
            <span class="fw-bold text-dark fs-5">${ProShopStore.formatMoney(subtotal)}</span>
        </div>
        <div class="d-flex align-items-center gap-2 mb-3 py-1 px-2 rounded" style="background: rgba(212, 175, 55, 0.1); border: 1px solid rgba(212, 175, 55, 0.25);">
            <i class="bi bi-shield-check text-warning"></i>
            <span style="font-size: 11px; color: #78350F; font-weight: 500;">Free insured delivery</span>
        </div>
        <div class="d-grid gap-2">
            <a href="cart.html" class="btn btn-gold py-2">Proceed to Bag & Checkout</a>
            <a href="shop.html" class="btn btn-outline-luxury py-2 text-center" data-bs-dismiss="offcanvas">Continue shopping</a>
        </div>
    `;
}

/* ==========================================================================
   QUICK VIEW MODAL
   ========================================================================== */

function initQuickViewModal() {
    if (!document.getElementById('proshopQuickViewModal')) {
        const modalHtml = `
            <div class="modal fade" id="proshopQuickViewModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden">
                        <div class="modal-body p-0" id="quickViewModalContent">
                            <!-- Injected dynamically -->
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
}

window.openQuickView = function(productId) {
    const product = typeof PROSHOP_CATALOG !== 'undefined' ? PROSHOP_CATALOG.find(p => p.id === productId) : null;
    if (!product) return;

    const modalContent = document.getElementById('quickViewModalContent');
    if (!modalContent) return;

    const finishesHtml = (product.finishes || []).map((f, idx) => `
        <label class="d-inline-flex align-items-center gap-1 me-2 cursor-pointer">
            <input type="radio" name="qv-finish" value="${f.name}" ${idx === 0 ? 'checked' : ''} class="form-check-input visually-hidden">
            <span class="d-inline-block rounded-circle" style="width: 20px; height: 20px; background-color: ${f.colorCode}; border: 2px solid #fff; box-shadow: 0 0 0 1px #cbd5e1;" title="${f.name}"></span>
            <span class="small text-muted" style="font-size: 11px;">${f.name}</span>
        </label>
    `).join('');

    modalContent.innerHTML = `
        <div class="row g-0">
            <div class="col-md-6 bg-light d-flex align-items-center justify-content-center p-4 position-relative">
                <img id="qv-main-image" src="${product.image}" alt="${product.title}" class="img-fluid rounded-3" style="max-height: 380px; object-fit: cover;">
                <button type="button" class="btn-close position-absolute top-0 start-0 m-3 d-md-none" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="col-md-6 p-4 d-flex flex-column justify-content-between">
                <div>
                    <div class="d-flex justify-content-between align-items-start mb-2">
                        <span class="text-uppercase text-muted" style="font-size: 11px; font-weight: 600; letter-spacing: 0.08em;">${product.brand}</span>
                        <button type="button" class="btn-close d-none d-md-block" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <h4 class="fw-bold mb-2" style="font-family: var(--ps-font-serif); font-size: 20px;">${product.title}</h4>
                    <div class="d-flex align-items-center gap-2 mb-3">
                        <span class="text-warning">★★★★★</span>
                        <span class="text-muted small">(${product.reviewsCount} reviews)</span>
                        <span class="badge bg-dark text-warning rounded-pill px-2 py-1 ms-auto" style="font-size: 10px;">${product.badge || 'Atelier Certified'}</span>
                    </div>
                    <div class="d-flex align-items-baseline gap-2 mb-3">
                        <span class="fs-4 fw-bold text-dark">${ProShopStore.formatMoney(product.price)}</span>
                        ${product.originalPrice ? `<span class="text-muted text-decoration-line-through small">${ProShopStore.formatMoney(product.originalPrice)}</span>` : ''}
                    </div>
                    <p class="text-muted small mb-3" style="line-height: 1.6;">${product.description ? product.description.substring(0, 160) + '...' : ''}</p>
                    
                    ${finishesHtml ? `
                    <div class="mb-3">
                        <label class="d-block small text-muted mb-1 fw-semibold">Select Finish:</label>
                        <div class="d-flex flex-wrap gap-1">${finishesHtml}</div>
                    </div>` : ''}
                </div>

                <div class="pt-3 border-top mt-3">
                    <div class="d-flex gap-2">
                        <button type="button" class="btn btn-gold flex-grow-1 py-2" onclick="handleQuickAdd('${product.id}')">
                            <i class="bi bi-bag-plus"></i> Add to Shopping Bag
                        </button>
                        <a href="product.html?id=${product.id}" class="btn btn-outline-luxury py-2">
                            View Full Details
                        </a>
                    </div>
                </div>
            </div>
        </div>
    `;

    const modalEl = document.getElementById('proshopQuickViewModal');
    if (modalEl && window.bootstrap) {
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();
    }
};

window.handleQuickAdd = function(productId) {
    const selectedFinish = document.querySelector('input[name="qv-finish"]:checked');
    const finish = selectedFinish ? selectedFinish.value : 'Standard Atelier Edition';
    ProShopStore.addToCart(productId, 1, { finish });

    const modalEl = document.getElementById('proshopQuickViewModal');
    if (modalEl && window.bootstrap) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
    }
};

/* ==========================================================================
   CONCIERGE INQUIRY MODAL
   ========================================================================== */

function initConciergeModal() {
    if (!document.getElementById('proshopConciergeModal')) {
        const modalHtml = `
            <div class="modal fade" id="proshopConciergeModal" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 rounded-4 overflow-hidden" style="background: var(--ps-midnight); color: #fff;">
                        <div class="modal-header border-bottom border-secondary border-opacity-25 px-4 py-3">
                            <div class="d-flex align-items-center gap-2">
                                <span class="text-warning fs-5">✦</span>
                                <h5 class="modal-title mb-0" style="font-family: var(--ps-font-serif);">Contact support Desk</h5>
                            </div>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                        </div>
                        <div class="modal-body p-4">
                            <p class="text-secondary small mb-4" style="color: #94A3B8 !important;">Contact our watch and audio experts in Mayfair or Manhattan for help finding a product.</p>
                            <form id="conciergeForm" onsubmit="handleConciergeSubmit(event)">
                                <div class="mb-3">
                                    <label class="form-label small text-uppercase" style="letter-spacing: 0.05em; font-size: 11px; color: #CBD5E1;">Your Full Name</label>
                                    <input type="text" class="form-control bg-dark text-white border-secondary border-opacity-50" required placeholder="Your name">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small text-uppercase" style="letter-spacing: 0.05em; font-size: 11px; color: #CBD5E1;">Direct Contact (Email or Telephone)</label>
                                    <input type="text" class="form-control bg-dark text-white border-secondary border-opacity-50" required placeholder="eleanor.vance@atelier.com">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small text-uppercase" style="letter-spacing: 0.05em; font-size: 11px; color: #CBD5E1;">Department / Piece of Interest</label>
                                    <select class="form-select bg-dark text-white border-secondary border-opacity-50">
                                        <option>Watches</option>
                                        <option>Custom audio</option>
                                        <option>Designer fashion & Heritage Leather</option>
                                        <option>Special offers</option>
                                    </select>
                                </div>
                                <div class="mb-4">
                                    <label class="form-label small text-uppercase" style="letter-spacing: 0.05em; font-size: 11px; color: #CBD5E1;">How can we help?</label>
                                    <textarea class="form-control bg-dark text-white border-secondary border-opacity-50" rows="3" placeholder="Inquiring on immediate insured courier delivery to Manhattan residence..."></textarea>
                                </div>
                                <button type="submit" class="btn btn-gold w-100 py-2.5">
                                    <i class="bi bi-send"></i> Send message
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }
}

window.handleConciergeSubmit = function(e) {
    e.preventDefault();
    const modalEl = document.getElementById('proshopConciergeModal');
    if (modalEl && window.bootstrap) {
        const bsModal = bootstrap.Modal.getInstance(modalEl);
        if (bsModal) bsModal.hide();
    }
    ProShopStore.showToast('Inquiry Transmitted', 'A private advisor will initiate contact within 15 minutes.');
};

/* ==========================================================================
   GLOBAL SEARCH HANDLER
   ========================================================================== */

function initGlobalSearch() {
    const searchForm = document.getElementById('global-search-form');
    if (searchForm) {
        searchForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const input = searchForm.querySelector('.search-input');
            const dept = searchForm.querySelector('.dept-select');
            const query = input ? input.value.trim() : '';
            const deptVal = dept ? dept.value : 'All';

            const params = new URLSearchParams();
            if (query) params.set('q', query);
            if (deptVal && deptVal !== 'All') params.set('dept', deptVal);

            window.location.href = `shop.html?${params.toString()}`;
        });
    }
}

/* ==========================================================================
   NEWSLETTER FORMS
   ========================================================================== */

function initNewsletterForms() {
    document.querySelectorAll('.proshop-newsletter-form').forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const emailInput = form.querySelector('input[type="email"]');
            if (emailInput && emailInput.value) {
                emailInput.value = '';
                ProShopStore.showToast('Thanks for signing up', 'You will receive updates about new products and offers.');
            }
        });
    });
}

/* ==========================================================================
   PRODUCT CARD LISTENERS (Wishlist, Quick Add)
   ========================================================================== */

function initProductCardListeners() {
    document.addEventListener('click', (e) => {
        // Wishlist button
        const wishBtn = e.target.closest('.wishlist-toggle-btn');
        if (wishBtn) {
            e.preventDefault();
            e.stopPropagation();
            const pid = wishBtn.dataset.productId;
            if (pid) {
                const isSaved = ProShopStore.toggleWishlist(pid);
                wishBtn.classList.toggle('active', isSaved);
                const icon = wishBtn.querySelector('i');
                if (icon) {
                    icon.className = isSaved ? 'bi bi-heart-fill' : 'bi bi-heart';
                }
            }
            return;
        }

        // Quick View trigger
        const qvBtn = e.target.closest('.quick-view-trigger');
        if (qvBtn) {
            e.preventDefault();
            e.stopPropagation();
            const pid = qvBtn.dataset.productId;
            if (pid) {
                window.openQuickView(pid);
            }
            return;
        }

        // Direct Quick Add trigger
        const addBtn = e.target.closest('.quick-add-to-bag');
        if (addBtn) {
            e.preventDefault();
            e.stopPropagation();
            const pid = addBtn.dataset.productId;
            if (pid) {
                ProShopStore.addToCart(pid, 1);
            }
            return;
        }
    });
}
