// ProShop Luxury Marketplace - Flagship Product Detail Page Engine
// Handles dynamic product rendering, interactive galleries, variant selection, price recalculation, bundle math, and client reviews

document.addEventListener('DOMContentLoaded', () => {
    initProductDetailPage();
    window.addEventListener('proshop:catalogready', () => initProductDetailPage());
});

let activeProduct = null;
let selectedFinish = null;
let selectedCapacity = null;
let activeQuantity = 1;

function initProductDetailPage() {
    const urlParams = new URLSearchParams(window.location.search);
    const productId = urlParams.get('id') || 'horizon-x';

    if (typeof PROSHOP_CATALOG === 'undefined') return;

    activeProduct = PROSHOP_CATALOG.find(p => p.id === productId) || PROSHOP_CATALOG[0];

    // Set initial variants
    if (activeProduct.finishes && activeProduct.finishes.length > 0) {
        selectedFinish = activeProduct.finishes.find(f => f.selected) || activeProduct.finishes[0];
    }
    if (activeProduct.capacities && activeProduct.capacities.length > 0) {
        selectedCapacity = activeProduct.capacities.find(c => c.selected) || activeProduct.capacities[0];
    }

    renderProductPage();
}

function renderProductPage() {
    if (!activeProduct) return;

    // Page Title & Breadcrumbs
    document.title = `${activeProduct.title} | ProShop Luxury Marketplace`;

    const breadcrumbDept = document.getElementById('pdp-breadcrumb-dept');
    if (breadcrumbDept) {
        breadcrumbDept.textContent = activeProduct.department;
        breadcrumbDept.href = `shop.html?dept=${encodeURIComponent(activeProduct.department)}`;
    }
    const breadcrumbTitle = document.getElementById('pdp-breadcrumb-title');
    if (breadcrumbTitle) breadcrumbTitle.textContent = activeProduct.title;

    // Header info
    setText('pdp-brand-tag', activeProduct.brand);
    setText('pdp-product-title', activeProduct.title);
    setText('pdp-subtitle', activeProduct.subtitle);
    setText('pdp-reviews-count', `(${activeProduct.reviewsCount} customer reviews)`);
    setText('pdp-badge-tag', activeProduct.badge || 'Verified');
    setText('pdp-description-text', activeProduct.description);

    // Gallery Render
    renderGallery();

    // Variant Selectors
    renderFinishes();
    renderCapacities();

    // Prices and Buy Box
    updatePricingDisplay();

    // Highlights list
    renderHighlights();

    // Specifications Table
    renderSpecifications();

    // In The Box List
    renderInTheBox();

    // Frequently Bought Together Bundle
    renderBundle();

    // Setup Buy Box Quantity & Actions
    setupBuyBoxActions();

    // Similar products
    renderSimilarProducts();
}

function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function renderGallery() {
    const mainImgEl = document.getElementById('pdp-main-image');
    const thumbsContainer = document.getElementById('pdp-gallery-thumbs');
    if (!mainImgEl || !thumbsContainer) return;

    const images = (activeProduct.gallery && activeProduct.gallery.length > 0) ? activeProduct.gallery : [activeProduct.image];
    mainImgEl.src = images[0];
    mainImgEl.alt = activeProduct.title;

    thumbsContainer.innerHTML = images.map((imgSrc, idx) => `
        <div class="gallery-thumb-item ${idx === 0 ? 'active' : ''}" onclick="switchPdpImage('${imgSrc}', this)">
            <img src="${imgSrc}" alt="Thumbnail ${idx + 1}">
        </div>
    `).join('');

    window.switchPdpImage = function(src, thumbEl) {
        mainImgEl.src = src;
        document.querySelectorAll('.gallery-thumb-item').forEach(t => t.classList.remove('active'));
        if (thumbEl) thumbEl.classList.add('active');
    };
}

function renderFinishes() {
    const container = document.getElementById('pdp-finishes-container');
    const labelEl = document.getElementById('pdp-selected-finish-name');
    if (!container) return;

    if (!activeProduct.finishes || activeProduct.finishes.length === 0) {
        container.closest('.variant-section-row')?.remove();
        return;
    }

    if (labelEl && selectedFinish) {
        labelEl.textContent = selectedFinish.name;
    }

    container.innerHTML = activeProduct.finishes.map(f => `
        <div class="variant-swatch ${f.name === selectedFinish?.name ? 'active' : ''}" 
             style="background-color: ${f.colorCode};" 
             title="${f.name}"
             onclick="selectPdpFinish('${f.name}')">
        </div>
    `).join('');

    window.selectPdpFinish = function(finishName) {
        selectedFinish = activeProduct.finishes.find(f => f.name === finishName);
        if (labelEl) labelEl.textContent = selectedFinish.name;
        document.querySelectorAll('.variant-swatch').forEach(swatch => {
            swatch.classList.toggle('active', swatch.title === finishName);
        });
    };
}

function renderCapacities() {
    const container = document.getElementById('pdp-capacities-container');
    if (!container) return;

    if (!activeProduct.capacities || activeProduct.capacities.length === 0) {
        container.closest('.variant-section-row')?.remove();
        return;
    }

    container.innerHTML = activeProduct.capacities.map(c => `
        <button type="button" class="capacity-pill-btn ${c.size === selectedCapacity?.size ? 'active' : ''}"
                onclick="selectPdpCapacity('${c.size}')">
            ${c.size}
        </button>
    `).join('');

    window.selectPdpCapacity = function(size) {
        selectedCapacity = activeProduct.capacities.find(c => c.size === size);
        document.querySelectorAll('.capacity-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.textContent.trim() === size);
        });
        updatePricingDisplay();
    };
}

function updatePricingDisplay() {
    let unitPrice = activeProduct.price;
    if (selectedCapacity && selectedCapacity.price) {
        unitPrice = selectedCapacity.price;
    }

    const priceEl = document.getElementById('pdp-display-price');
    if (priceEl) priceEl.textContent = ProShopStore.formatMoney(unitPrice);

    const origPriceEl = document.getElementById('pdp-original-price');
    if (origPriceEl) {
        if (activeProduct.originalPrice) {
            origPriceEl.textContent = ProShopStore.formatMoney(activeProduct.originalPrice);
            origPriceEl.style.display = 'inline';
        } else {
            origPriceEl.style.display = 'none';
        }
    }
}

function renderHighlights() {
    const listEl = document.getElementById('pdp-highlights-list');
    if (!listEl) return;

    const highlights = activeProduct.highlights || [
        "Made with quality materials and carefully tested.",
        "Includes a warranty and certificate of origin.",
        "Free insured delivery"
    ];

    listEl.innerHTML = highlights.map(h => `
        <li class="d-flex align-items-start gap-2 mb-2">
            <span class="text-warning fs-6">✦</span>
            <span class="small text-secondary-emphasis">${h}</span>
        </li>
    `).join('');
}

function renderSpecifications() {
    const tableEl = document.getElementById('pdp-specs-table');
    if (!tableEl) return;

    const specs = activeProduct.specs || {
        "Brand": activeProduct.brand,
        "Department": activeProduct.department,
        "Audio type": activeProduct.topology || "Special design",
        "Condition": activeProduct.condition || "New and sealed",
        "Authenticity": "Checked by ProShop product experts"
    };

    tableEl.innerHTML = Object.entries(specs).map(([key, val]) => `
        <tr>
            <th class="text-muted fw-normal small py-2.5 ps-0" style="width: 35%; border-bottom: 1px solid var(--ps-border-subtle);">${key}</th>
            <td class="fw-semibold small text-dark py-2.5" style="border-bottom: 1px solid var(--ps-border-subtle);">${val}</td>
        </tr>
    `).join('');
}

function renderInTheBox() {
    const listEl = document.getElementById('pdp-in-box-list');
    if (!listEl) return;

    const items = activeProduct.inTheBox || [
        `${activeProduct.title}`,
        "Numbered authenticity certificate",
        "Insured gift packaging",
        "Personal VIP Concierge Direct Contact Token"
    ];

    listEl.innerHTML = items.map(item => `
        <div class="col-md-6 mb-2">
            <div class="d-flex align-items-center gap-2 p-2.5 rounded bg-light border">
                <i class="bi bi-box-seam text-warning"></i>
                <span class="small fw-medium">${item}</span>
            </div>
        </div>
    `).join('');
}

function renderBundle() {
    const bundleContainer = document.getElementById('pdp-bundle-container');
    if (!bundleContainer) return;

    const bundleItems = activeProduct.bundle || [
        { id: "b1", title: "Handmade protective case", price: 149.00, checked: true },
        { id: "b2", title: "Solid Brass & Obsidian Magnetic Docking Station", price: 220.00, checked: true }
    ];

    const currentPrice = selectedCapacity?.price || activeProduct.price;

    let bundleHtml = `
        <div class="card border rounded-4 p-4 shadow-sm" style="background: #FFFFFF;">
            <div class="d-flex align-items-center gap-2 mb-3">
                <span class="text-warning">✦</span>
                <h5 class="mb-0 fw-bold" style="font-family: var(--ps-font-serif);">Items often bought together</h5>
            </div>
            <div class="row align-items-center g-4">
                <div class="col-lg-8">
                    <div class="form-check mb-2">
                        <input class="form-check-input bundle-check" type="checkbox" checked disabled id="bundle-main">
                        <label class="form-check-label small fw-semibold" for="bundle-main">
                            <strong>This Item:</strong> ${activeProduct.title} (<span class="text-dark fw-bold">${ProShopStore.formatMoney(currentPrice)}</span>)
                        </label>
                    </div>
                    ${bundleItems.map((item, idx) => `
                        <div class="form-check mb-2">
                            <input class="form-check-input bundle-check bundle-addon" type="checkbox" ${item.checked ? 'checked' : ''} id="bundle-${item.id}" data-price="${item.price}" data-id="${item.id}" data-title="${item.title}" onchange="recalculateBundleTotal()">
                            <label class="form-check-label small" for="bundle-${item.id}">
                                <strong>Add:</strong> ${item.title} (<span class="text-secondary fw-semibold">+${ProShopStore.formatMoney(item.price)}</span>)
                            </label>
                        </div>
                    `).join('')}
                </div>
                <div class="col-lg-4 text-lg-end border-start-lg ps-lg-4">
                    <div class="small text-muted mb-1">Ensemble Total:</div>
                    <div class="fs-4 fw-bold text-dark mb-3" id="bundle-total-display">₹0</div>
                    <button type="button" class="btn btn-gold w-100 py-2" onclick="addBundleToBag()">
                        <i class="bi bi-bag-plus"></i> Add Entire Ensemble
                    </button>
                </div>
            </div>
        </div>
    `;

    bundleContainer.innerHTML = bundleHtml;
    recalculateBundleTotal();

    window.recalculateBundleTotal = function() {
        const base = selectedCapacity?.price || activeProduct.price;
        let total = base;
        document.querySelectorAll('.bundle-addon:checked').forEach(cb => {
            total += parseFloat(cb.dataset.price || 0);
        });
        const displayEl = document.getElementById('bundle-total-display');
        if (displayEl) displayEl.textContent = ProShopStore.formatMoney(total);
    };

    window.addBundleToBag = function() {
        ProShopStore.addToCart(activeProduct.id, 1, {
            finish: selectedFinish?.name,
            capacity: selectedCapacity?.size
        });
        document.querySelectorAll('.bundle-addon:checked').forEach(cb => {
            ProShopStore.addToCart(cb.dataset.id, 1, { finish: 'Companion Atelier Edition' });
        });
        ProShopStore.showToast('Items added', 'The items were added to your bag.');
    };
}

function setupBuyBoxActions() {
    const qtyInput = document.getElementById('pdp-qty-input');
    const btnMinus = document.getElementById('pdp-qty-minus');
    const btnPlus = document.getElementById('pdp-qty-plus');

    if (btnMinus && qtyInput) {
        btnMinus.onclick = () => {
            let val = parseInt(qtyInput.value) || 1;
            if (val > 1) {
                val--;
                qtyInput.value = val;
                activeQuantity = val;
            }
        };
    }

    if (btnPlus && qtyInput) {
        btnPlus.onclick = () => {
            let val = parseInt(qtyInput.value) || 1;
            val++;
            qtyInput.value = val;
            activeQuantity = val;
        };
    }

    // Add to bag button
    const btnAdd = document.getElementById('pdp-add-to-bag-btn');
    if (btnAdd) {
        btnAdd.onclick = () => {
            ProShopStore.addToCart(activeProduct.id, activeQuantity, {
                finish: selectedFinish ? selectedFinish.name : 'Standard Edition',
                capacity: selectedCapacity ? selectedCapacity.size : 'Standard'
            });
        };
    }

    // Wishlist button on PDP
    const wishBtn = document.getElementById('pdp-wishlist-toggle');
    if (wishBtn) {
        const isWish = ProShopStore.isInWishlist(activeProduct.id);
        wishBtn.classList.toggle('active', isWish);
        wishBtn.onclick = () => {
            const added = ProShopStore.toggleWishlist(activeProduct.id);
            wishBtn.classList.toggle('active', added);
            const icon = wishBtn.querySelector('i');
            if (icon) icon.className = added ? 'bi bi-heart-fill' : 'bi bi-heart';
        };
    }
}

function renderSimilarProducts() {
    const container = document.getElementById('pdp-similar-products');
    if (!container || typeof PROSHOP_CATALOG === 'undefined') return;

    const similar = PROSHOP_CATALOG.filter(p => p.id !== activeProduct.id && (p.department === activeProduct.department || p.featured)).slice(0, 4);

    container.innerHTML = similar.map(p => `
        <div class="col-sm-6 col-lg-3 mb-4">
            <article class="product-card">
                <div class="card-media-wrapper">
                    <img src="${p.image}" alt="${p.title}" loading="lazy">
                    <button type="button" class="wishlist-btn wishlist-toggle-btn ${ProShopStore.isInWishlist(p.id) ? 'active' : ''}" data-product-id="${p.id}" title="Save to Wishlist">
                        <i class="${ProShopStore.isInWishlist(p.id) ? 'bi bi-heart-fill' : 'bi bi-heart'}"></i>
                    </button>
                    <div class="card-quick-actions">
                        <button type="button" class="btn btn-gold btn-sm flex-grow-1 quick-add-to-bag" data-product-id="${p.id}">
                            <i class="bi bi-bag-plus"></i> Quick Add
                        </button>
                    </div>
                </div>
                <span class="card-brand-tag">${p.brand}</span>
                <h3 class="card-product-title">
                    <a href="product.html?id=${p.id}">${p.title}</a>
                </h3>
                <div class="card-price-cluster">
                    <span class="price-current">${ProShopStore.formatMoney(p.price)}</span>
                </div>
            </article>
        </div>
    `).join('');
}
