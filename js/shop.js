// ProShop Luxury Marketplace - Shop & Search Results Engine
// Real-time Faceted Filtering, Sorting, Dynamic Grid/List View & Pagination

document.addEventListener('DOMContentLoaded', () => {
    initShopCatalog();
    window.addEventListener('proshop:catalogready', () => {
        currentPage = 1;
        applyFiltersAndRender();
    });
});

let currentFilters = {
    search: '',
    department: 'All',
    brands: [],
    minPrice: 0,
    maxPrice: 10000000,
    topologies: [],
    condition: 'All',
    delivery: 'All',
    minRating: 0,
    sortBy: 'curated'
};

let currentViewMode = 'grid-4'; // 'grid-3', 'grid-4', 'list'
let currentPage = 1;
const itemsPerPage = 8;

function initShopCatalog() {
    // Parse URL params for pre-selected filters (e.g. ?dept=Electronics%20&%20Audio&q=headphones)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('q')) {
        currentFilters.search = urlParams.get('q');
        const searchInput = document.getElementById('filter-search-input');
        if (searchInput) searchInput.value = currentFilters.search;
    }
    if (urlParams.has('dept')) {
        currentFilters.department = urlParams.get('dept');
    }
    if (urlParams.has('brand')) {
        currentFilters.brands = [urlParams.get('brand')];
    }

    setupFilterListeners();
    applyFiltersAndRender();
}

function setupFilterListeners() {
    // Text search input within shop
    const searchInput = document.getElementById('filter-search-input');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentFilters.search = e.target.value.trim();
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    // Sort Dropdown
    const sortSelect = document.getElementById('shop-sort-select');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentFilters.sortBy = e.target.value;
            applyFiltersAndRender();
        });
    }

    // View mode switchers (3-col, 4-col, list)
    document.querySelectorAll('.view-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentViewMode = btn.dataset.viewMode;
            renderProductGrid();
        });
    });

    // Checkbox / Radio listeners in filter sidebar
    document.addEventListener('change', (e) => {
        if (e.target.matches('.facet-dept-radio')) {
            currentFilters.department = e.target.value;
            currentPage = 1;
            applyFiltersAndRender();
        } else if (e.target.matches('.facet-brand-check')) {
            const val = e.target.value;
            if (e.target.checked) {
                if (!currentFilters.brands.includes(val)) currentFilters.brands.push(val);
            } else {
                currentFilters.brands = currentFilters.brands.filter(b => b !== val);
            }
            currentPage = 1;
            applyFiltersAndRender();
        } else if (e.target.matches('.facet-topology-check')) {
            const val = e.target.value;
            if (e.target.checked) {
                if (!currentFilters.topologies.includes(val)) currentFilters.topologies.push(val);
            } else {
                currentFilters.topologies = currentFilters.topologies.filter(t => t !== val);
            }
            currentPage = 1;
            applyFiltersAndRender();
        } else if (e.target.matches('.facet-condition-radio')) {
            currentFilters.condition = e.target.value;
            currentPage = 1;
            applyFiltersAndRender();
        } else if (e.target.matches('.facet-delivery-radio')) {
            currentFilters.delivery = e.target.value;
            currentPage = 1;
            applyFiltersAndRender();
        }
    });

    // Price Filter Submit
    const priceForm = document.getElementById('price-filter-form');
    if (priceForm) {
        priceForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const min = parseFloat(document.getElementById('price-min-input').value) || 0;
            const max = parseFloat(document.getElementById('price-max-input').value) || 10000000;
            currentFilters.minPrice = min;
            currentFilters.maxPrice = max;
            currentPage = 1;
            applyFiltersAndRender();
        });
    }

    // Clear all filters button
    const clearBtn = document.getElementById('clear-all-filters-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            resetAllFilters();
        });
    }
}

function resetAllFilters() {
    currentFilters = {
        search: '',
        department: 'All',
        brands: [],
        minPrice: 0,
        maxPrice: 10000000,
        topologies: [],
        condition: 'All',
        delivery: 'All',
        minRating: 0,
        sortBy: 'curated'
    };

    // Reset inputs
    const searchInput = document.getElementById('filter-search-input');
    if (searchInput) searchInput.value = '';
    const minInput = document.getElementById('price-min-input');
    if (minInput) minInput.value = '';
    const maxInput = document.getElementById('price-max-input');
    if (maxInput) maxInput.value = '';

    document.querySelectorAll('.facet-brand-check, .facet-topology-check').forEach(cb => cb.checked = false);
    const defaultDept = document.querySelector('.facet-dept-radio[value="All"]');
    if (defaultDept) defaultDept.checked = true;
    const defaultCond = document.querySelector('.facet-condition-radio[value="All"]');
    if (defaultCond) defaultCond.checked = true;
    const defaultDeliv = document.querySelector('.facet-delivery-radio[value="All"]');
    if (defaultDeliv) defaultDeliv.checked = true;

    currentPage = 1;
    applyFiltersAndRender();
}

let filteredProducts = [];

function applyFiltersAndRender() {
    if (typeof PROSHOP_CATALOG === 'undefined') return;

    filteredProducts = PROSHOP_CATALOG.filter(p => {
        // Search Term
        if (currentFilters.search) {
            const s = currentFilters.search.toLowerCase();
            const matchTitle = (p.title || '').toLowerCase().includes(s);
            const matchBrand = (p.brand || '').toLowerCase().includes(s);
            const matchDesc = (p.description || '').toLowerCase().includes(s);
            const matchDept = (p.department || '').toLowerCase().includes(s);
            if (!matchTitle && !matchBrand && !matchDesc && !matchDept) return false;
        }

        // Department
        if (currentFilters.department !== 'All') {
            if (p.department !== currentFilters.department) return false;
        }

        // Brands
        if (currentFilters.brands.length > 0) {
            if (!currentFilters.brands.includes(p.brand)) return false;
        }

        // Topologies
        if (currentFilters.topologies.length > 0) {
            if (!p.topology || !currentFilters.topologies.some(t => p.topology.toLowerCase().includes(t.toLowerCase()))) {
                return false;
            }
        }

        // Condition
        if (currentFilters.condition !== 'All') {
            if (!p.condition || !p.condition.includes(currentFilters.condition)) return false;
        }

        // Delivery
        if (currentFilters.delivery !== 'All') {
            if (!p.deliverySpeed || !p.deliverySpeed.includes(currentFilters.delivery)) return false;
        }

        // Price Range
        if (p.price < currentFilters.minPrice || p.price > currentFilters.maxPrice) {
            return false;
        }

        return true;
    });

    // Sorting
    switch (currentFilters.sortBy) {
        case 'price-asc':
            filteredProducts.sort((a, b) => a.price - b.price);
            break;
        case 'price-desc':
            filteredProducts.sort((a, b) => b.price - a.price);
            break;
        case 'rating':
            filteredProducts.sort((a, b) => b.rating - a.rating);
            break;
        case 'reviews':
            filteredProducts.sort((a, b) => b.reviewsCount - a.reviewsCount);
            break;
        case 'curated':
        default:
            filteredProducts.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
            break;
    }

    renderActiveBadges();
    renderProductGrid();
    renderPagination();
}

function renderActiveBadges() {
    const container = document.getElementById('active-filter-badges-container');
    if (!container) return;

    let badges = [];

    if (currentFilters.search) {
        badges.push({ label: `Search: "${currentFilters.search}"`, onRemove: () => {
            currentFilters.search = '';
            const el = document.getElementById('filter-search-input');
            if (el) el.value = '';
        }});
    }
    if (currentFilters.department !== 'All') {
        badges.push({ label: currentFilters.department, onRemove: () => {
            currentFilters.department = 'All';
            const el = document.querySelector('.facet-dept-radio[value="All"]');
            if (el) el.checked = true;
        }});
    }
    currentFilters.brands.forEach(b => {
        badges.push({ label: `Brand: ${b}`, onRemove: () => {
            currentFilters.brands = currentFilters.brands.filter(x => x !== b);
            const el = document.querySelector(`.facet-brand-check[value="${b}"]`);
            if (el) el.checked = false;
        }});
    });
    if (currentFilters.minPrice > 0 || currentFilters.maxPrice < 10000000) {
        badges.push({ label: `₹${currentFilters.minPrice.toLocaleString("en-IN")} - ₹${currentFilters.maxPrice.toLocaleString("en-IN")}`, onRemove: () => {
            currentFilters.minPrice = 0;
            currentFilters.maxPrice = 10000000;
        }});
    }

    if (badges.length === 0) {
        container.innerHTML = '';
        container.style.display = 'none';
        return;
    }

    container.style.display = 'flex';
    container.innerHTML = `
        <div class="d-flex flex-wrap align-items-center gap-2 mb-3">
            <span class="text-muted small fw-semibold">Active Criteria:</span>
            ${badges.map((b, i) => `
                <span class="badge bg-white text-dark border px-2.5 py-1.5 rounded-pill d-inline-flex align-items-center gap-1.5 shadow-sm" style="font-size: 11.5px;">
                    ${b.label}
                    <button type="button" class="btn-close ms-1" style="font-size: 9px;" onclick="removeFilterBadge(${i})" aria-label="Remove"></button>
                </span>
            `).join('')}
            <button type="button" class="btn btn-link btn-sm text-danger text-decoration-none p-0 ms-2 small" onclick="resetAllFilters()">Clear All</button>
        </div>
    `;

    window.removeFilterBadge = function(idx) {
        badges[idx].onRemove();
        applyFiltersAndRender();
    };
}

function renderProductGrid() {
    const gridEl = document.getElementById('shop-product-grid');
    const countEl = document.getElementById('results-count-display');
    if (!gridEl) return;

    if (countEl) {
        countEl.textContent = `${filteredProducts.length} products`;
    }

    if (filteredProducts.length === 0) {
        gridEl.innerHTML = `
            <div class="col-12 text-center py-5">
                <div class="mb-3 text-warning fs-1">✧</div>
                <h4 style="font-family: var(--ps-font-serif);">No products found</h4>
                <p class="text-muted small mb-4">Try changing the price or brand filters, or contact us for help.</p>
                <button type="button" class="btn btn-gold" onclick="resetAllFilters()">Reset All Filters</button>
            </div>
        `;
        return;
    }

    // Pagination slice
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

    // Grid column class
    let colClass = 'col-sm-6 col-lg-4 col-xl-3';
    if (currentViewMode === 'grid-3') {
        colClass = 'col-sm-6 col-lg-4';
    } else if (currentViewMode === 'list') {
        colClass = 'col-12';
    }

    let html = '';
    pageItems.forEach(p => {
        const isWish = ProShopStore.isInWishlist(p.id);

        if (currentViewMode === 'list') {
            // List View Layout
            html += `
                <div class="${colClass} mb-3">
                    <div class="product-card flex-row gap-4 p-3 align-items-center">
                        <div style="width: 140px; height: 140px; flex-shrink: 0;" class="position-relative rounded-3 overflow-hidden bg-light border">
                            <img src="${p.image}" alt="${p.title}" style="width: 100%; height: 100%; object-fit: cover;">
                            <button type="button" class="wishlist-btn wishlist-toggle-btn ${isWish ? 'active' : ''}" data-product-id="${p.id}" title="Save to Wishlist">
                                <i class="${isWish ? 'bi bi-heart-fill' : 'bi bi-heart'}"></i>
                            </button>
                        </div>
                        <div class="flex-grow-1 min-w-0">
                            <span class="card-brand-tag">${p.brand}</span>
                            <h3 class="card-product-title fs-5 mb-1">
                                <a href="product.html?id=${p.id}">${p.title}</a>
                            </h3>
                            <div class="rating-cluster mb-2">
                                <span class="stars-gold">★★★★★</span>
                                <span class="rating-count">(${p.reviewsCount})</span>
                                <span class="badge badge-atelier ms-2">${p.badge || 'Verified'}</span>
                            </div>
                            <p class="text-muted small mb-0 d-none d-md-block" style="line-height: 1.5;">${p.subtitle || p.description.substring(0, 110) + '...'}</p>
                        </div>
                        <div class="text-end ps-3 border-start shrink-0" style="min-width: 160px;">
                            <div class="fs-4 fw-bold text-dark mb-1">${ProShopStore.formatMoney(p.price)}</div>
                            ${p.originalPrice ? `<div class="price-original small mb-2">${ProShopStore.formatMoney(p.originalPrice)}</div>` : ''}
                            <div class="d-grid gap-2">
                                <button type="button" class="btn btn-gold btn-sm quick-add-to-bag" data-product-id="${p.id}">
                                    <i class="bi bi-bag-plus"></i> Add to Bag
                                </button>
                                <button type="button" class="btn btn-outline-luxury btn-sm quick-view-trigger" data-product-id="${p.id}">
                                    Quick View
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            // Grid View Layout
            html += `
                <div class="${colClass} mb-4">
                    <article class="product-card">
                        <div class="card-media-wrapper">
                            <img src="${p.image}" alt="${p.title}" loading="lazy">
                            <div class="card-badge-container">
                                <span class="badge ${p.isFlash ? 'badge-flash' : 'badge-atelier'}">${p.badge || 'Verified'}</span>
                            </div>
                            <button type="button" class="wishlist-btn wishlist-toggle-btn ${isWish ? 'active' : ''}" data-product-id="${p.id}" title="Save to Wishlist">
                                <i class="${isWish ? 'bi bi-heart-fill' : 'bi bi-heart'}"></i>
                            </button>
                            <div class="card-quick-actions">
                                <button type="button" class="btn btn-gold btn-sm flex-grow-1 quick-add-to-bag" data-product-id="${p.id}">
                                    <i class="bi bi-bag-plus"></i> Quick Add
                                </button>
                                <button type="button" class="btn btn-navy btn-sm quick-view-trigger" data-product-id="${p.id}" title="Quick View">
                                    <i class="bi bi-eye"></i>
                                </button>
                            </div>
                        </div>

                        <span class="card-brand-tag">${p.brand}</span>
                        <h3 class="card-product-title">
                            <a href="product.html?id=${p.id}">${p.title}</a>
                        </h3>

                        <div class="rating-cluster">
                            <span class="stars-gold">★★★★★</span>
                            <span class="rating-count">(${p.reviewsCount})</span>
                        </div>

                        <div class="card-price-cluster">
                            <span class="price-current">${ProShopStore.formatMoney(p.price)}</span>
                            ${p.originalPrice ? `<span class="price-original">${ProShopStore.formatMoney(p.originalPrice)}</span>` : ''}
                            ${p.originalPrice ? `<span class="price-discount-pill">-${Math.round((1 - p.price / p.originalPrice) * 100)}%</span>` : ''}
                        </div>
                        ${p.stockBadge ? `<div class="stock-indicator-note"><i class="bi bi-lightning-charge-fill"></i> ${p.stockBadge}</div>` : ''}
                    </article>
                </div>
            `;
        }
    });

    gridEl.innerHTML = html;
}

function renderPagination() {
    const paginationEl = document.getElementById('shop-pagination-container');
    if (!paginationEl) return;

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }

    let pagesHtml = `
        <li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
            <button class="page-link" onclick="goToShopPage(${currentPage - 1})" aria-label="Previous">« Previous</button>
        </li>
    `;

    for (let i = 1; i <= totalPages; i++) {
        pagesHtml += `
            <li class="page-item ${currentPage === i ? 'active' : ''}">
                <button class="page-link" onclick="goToShopPage(${i})">${i}</button>
            </li>
        `;
    }

    pagesHtml += `
        <li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
            <button class="page-link" onclick="goToShopPage(${currentPage + 1})" aria-label="Next">Next »</button>
        </li>
    `;

    paginationEl.innerHTML = pagesHtml;

    window.goToShopPage = function(page) {
        if (page < 1 || page > totalPages) return;
        currentPage = page;
        renderProductGrid();
        renderPagination();
        window.scrollTo({ top: 300, behavior: 'smooth' });
    };
}
