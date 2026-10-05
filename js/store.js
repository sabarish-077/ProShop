// ProShop Luxury Marketplace - Client State Management
// Handles Cart, Wishlist, Saved for Later, Promo Codes, and Toast Notifications via localStorage

const ProShopStore = (function() {
    const STORAGE_KEY_CART = 'proshop_cart_v1';
    const STORAGE_KEY_SAVED = 'proshop_saved_v1';
    const STORAGE_KEY_WISHLIST = 'proshop_wishlist_v1';
    const STORAGE_KEY_PROMO = 'proshop_promo_v1';

    // Default Seed Cart Items (faithful to proshop_shopping_bag_order_summary mockup)
    const DEFAULT_CART_SEED = [
        {
            productId: 'beoplay-h95',
            quantity: 1,
            finish: 'Nordic Ice Edition',
            capacity: 'Standard Atelier Pack',
            hasProtectionPlan: true,
            protectionPlanCost: 120.00
        },
        {
            productId: 'leica-sofort-2',
            quantity: 1,
            finish: 'Matte Noir',
            capacity: 'Instant Pack',
            hasProtectionPlan: false,
            protectionPlanCost: 0
        },
        {
            productId: 'diptyque-baies',
            quantity: 1,
            finish: 'Noir Virebent Earthenware',
            capacity: '1500g Giant Flacon',
            hasProtectionPlan: false,
            protectionPlanCost: 0
        }
    ];

    const DEFAULT_SAVED_SEED = [
        {
            productId: 'rimowa-cabin',
            finish: 'Silver Aluminium',
            savedDate: 'October 2, 2026'
        }
    ];

    function getProductById(id) {
        if (typeof PROSHOP_CATALOG !== 'undefined') {
            return PROSHOP_CATALOG.find(p => p.id === id) || null;
        }
        return null;
    }

    function initDefaults() {
        if (!localStorage.getItem(STORAGE_KEY_CART)) {
            localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(DEFAULT_CART_SEED));
        }
        if (!localStorage.getItem(STORAGE_KEY_SAVED)) {
            localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(DEFAULT_SAVED_SEED));
        }
        if (!localStorage.getItem(STORAGE_KEY_WISHLIST)) {
            localStorage.setItem(STORAGE_KEY_WISHLIST, JSON.stringify(['horizon-x', 'focal-utopia']));
        }
    }

    initDefaults();

    return {
        // --- CART METHODS ---
        getCart() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY_CART)) || [];
            } catch (e) {
                return [];
            }
        },

        getCartWithProducts() {
            const items = this.getCart();
            return items.map(item => {
                const product = getProductById(item.productId);
                return {
                    ...item,
                    product: product || {
                        id: item.productId,
                        title: 'Luxury Item',
                        price: 999.00,
                        brand: 'ProShop Atelier',
                        image: '/static/assets/images/logo.svg'
                    }
                };
            });
        },

        addToCart(productId, quantity = 1, options = {}) {
            let cart = this.getCart();
            const existingIndex = cart.findIndex(item => item.productId === productId && item.finish === (options.finish || ''));

            if (existingIndex > -1) {
                cart[existingIndex].quantity += quantity;
                if (options.hasProtectionPlan !== undefined) {
                    cart[existingIndex].hasProtectionPlan = options.hasProtectionPlan;
                }
            } else {
                cart.push({
                    productId,
                    quantity,
                    finish: options.finish || 'Standard Atelier Edition',
                    capacity: options.capacity || 'Standard',
                    hasProtectionPlan: !!options.hasProtectionPlan,
                    protectionPlanCost: options.hasProtectionPlan ? 120.00 : 0
                });
            }

            localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
            this.broadcastChange();

            const p = getProductById(productId);
            const title = p ? p.title : 'Item';
            this.showToast('Added to your bag', `${quantity}x ${title} was added to your bag.`);
        },

        updateQuantity(productId, quantity) {
            let cart = this.getCart();
            if (quantity <= 0) {
                cart = cart.filter(item => item.productId !== productId);
            } else {
                const item = cart.find(item => item.productId === productId);
                if (item) {
                    item.quantity = quantity;
                }
            }
            localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
            this.broadcastChange();
        },

        removeFromCart(productId) {
            let cart = this.getCart();
            cart = cart.filter(item => item.productId !== productId);
            localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
            this.broadcastChange();
            this.showToast('Item Removed', 'The item was removed from your bag.');
        },

        toggleProtectionPlan(productId, hasPlan) {
            let cart = this.getCart();
            const item = cart.find(i => i.productId === productId);
            if (item) {
                item.hasProtectionPlan = hasPlan;
                item.protectionPlanCost = hasPlan ? 120.00 : 0;
                localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
                this.broadcastChange();
            }
        },

        getCartCount() {
            const cart = this.getCart();
            return cart.reduce((total, item) => total + item.quantity, 0);
        },

        getCartSubtotal() {
            const items = this.getCartWithProducts();
            return items.reduce((sum, item) => {
                const itemPrice = item.product.price * item.quantity;
                const planPrice = item.hasProtectionPlan ? (item.protectionPlanCost || 120) * item.quantity : 0;
                return sum + itemPrice + planPrice;
            }, 0);
        },

        // --- SAVED FOR LATER METHODS ---
        getSavedForLater() {
            try {
                const saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED)) || [];
                return saved.map(item => ({
                    ...item,
                    product: getProductById(item.productId)
                })).filter(item => item.product !== null);
            } catch (e) {
                return [];
            }
        },

        saveForLater(productId) {
            const cartItem = this.getCart().find(i => i.productId === productId);
            this.removeFromCart(productId);

            let saved = [];
            try {
                saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED)) || [];
            } catch (e) {}

            if (!saved.some(i => i.productId === productId)) {
                saved.push({
                    productId,
                    finish: cartItem ? cartItem.finish : 'Standard',
                    savedDate: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                });
                localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(saved));
            }
            this.broadcastChange();
            this.showToast('Saved for Later', 'Item moved to your Saved list.');
        },

        moveToCart(productId) {
            let saved = [];
            try {
                saved = JSON.parse(localStorage.getItem(STORAGE_KEY_SAVED)) || [];
            } catch (e) {}

            const item = saved.find(i => i.productId === productId);
            if (item) {
                saved = saved.filter(i => i.productId !== productId);
                localStorage.setItem(STORAGE_KEY_SAVED, JSON.stringify(saved));
                this.addToCart(productId, 1, { finish: item.finish });
            }
        },

        // --- WISHLIST METHODS ---
        getWishlist() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY_WISHLIST)) || [];
            } catch (e) {
                return [];
            }
        },

        isInWishlist(productId) {
            return this.getWishlist().includes(productId);
        },

        toggleWishlist(productId) {
            let wishlist = this.getWishlist();
            let added = false;
            if (wishlist.includes(productId)) {
                wishlist = wishlist.filter(id => id !== productId);
            } else {
                wishlist.push(productId);
                added = true;
            }
            localStorage.setItem(STORAGE_KEY_WISHLIST, JSON.stringify(wishlist));
            this.broadcastChange();

            const p = getProductById(productId);
            const title = p ? p.title : 'Item';
            if (added) {
                this.showToast('Added to Wishlist', `${title} saved to your list.`);
            } else {
                this.showToast('Removed from Wishlist', `${title} removed from your list.`);
            }
            return added;
        },

        getWishlistCount() {
            return this.getWishlist().length;
        },

        // --- PROMO CODES ---
        getAppliedPromo() {
            try {
                return JSON.parse(localStorage.getItem(STORAGE_KEY_PROMO)) || null;
            } catch (e) {
                return null;
            }
        },

        applyPromo(code) {
            const clean = (code || '').trim().toUpperCase();
            if (clean === 'AUTUMN2025') {
                const promo = { code: 'AUTUMN2025', discountPercent: 10, label: '10% Autumn Reserve Private Discount' };
                localStorage.setItem(STORAGE_KEY_PROMO, JSON.stringify(promo));
                this.broadcastChange();
                this.showToast('Promo Code Applied', '10% discount applied.');
                return { success: true, promo };
            } else if (clean === 'VIPNOIR') {
                const promo = { code: 'VIPNOIR', discountPercent: 15, label: '15% member discount' };
                localStorage.setItem(STORAGE_KEY_PROMO, JSON.stringify(promo));
                this.broadcastChange();
                this.showToast('VIP Noir Code Applied', '15% Noir Guild discount activated.');
                return { success: true, promo };
            } else {
                return { success: false, message: 'This discount code is invalid or has expired.' };
            }
        },

        removePromo() {
            localStorage.removeItem(STORAGE_KEY_PROMO);
            this.broadcastChange();
            this.showToast('Promo Removed', 'Promotional code has been removed.');
        },

        // --- HELPER FORMATTERS ---
        formatMoney(amount) {
            return new Intl.NumberFormat('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
            }).format(amount);
        },

        // --- BROADCAST & TOASTS ---
        broadcastChange() {
            window.dispatchEvent(new CustomEvent('proshop:statechange', {
                detail: {
                    cartCount: this.getCartCount(),
                    cartSubtotal: this.getCartSubtotal(),
                    wishlistCount: this.getWishlistCount()
                }
            }));
            this.updateHeaderBadges();
        },

        updateHeaderBadges() {
            const cartBadges = document.querySelectorAll('.cart-count-badge');
            const cartCount = this.getCartCount();
            cartBadges.forEach(badge => {
                badge.textContent = cartCount;
                badge.style.display = cartCount > 0 ? 'flex' : 'none';
            });

            const wishBadges = document.querySelectorAll('.wishlist-count-badge');
            const wishCount = this.getWishlistCount();
            wishBadges.forEach(badge => {
                badge.textContent = wishCount;
                badge.style.display = wishCount > 0 ? 'flex' : 'none';
            });
        },

        showToast(title, message) {
            let container = document.getElementById('proshop-toast-container');
            if (!container) {
                container = document.createElement('div');
                container.id = 'proshop-toast-container';
                container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
                container.style.zIndex = '9999';
                document.body.appendChild(container);
            }

            const toastId = 'toast-' + Date.now();
            const toastHtml = `
                <div id="${toastId}" class="toast toast-luxury align-items-center" role="alert" aria-live="assertive" aria-atomic="true">
                    <div class="d-flex p-2">
                        <div class="toast-body d-flex align-items-start gap-2">
                            <span class="text-warning fs-5">★</span>
                            <div>
                                <strong class="d-block text-white" style="font-size: 13px;">${title}</strong>
                                <span class="text-secondary-subtle" style="font-size: 12px; color: #CBD5E1;">${message}</span>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
                    </div>
                </div>
            `;
            container.insertAdjacentHTML('beforeend', toastHtml);
            const el = document.getElementById(toastId);
            if (window.bootstrap && bootstrap.Toast) {
                const toast = new bootstrap.Toast(el, { delay: 4000 });
                toast.show();
                el.addEventListener('hidden.bs.toast', () => el.remove());
            }
        }
    };
})();

// Auto-run header update on page load
document.addEventListener('DOMContentLoaded', () => {
    ProShopStore.updateHeaderBadges();
});
