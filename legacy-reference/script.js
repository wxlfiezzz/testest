// public/script.js
if (typeof Storage === 'undefined') {
    console.error('ОШИБКА: storage.js не загружен.');
}

document.addEventListener('DOMContentLoaded', function () {

    const { categories, baseProducts } = window.APP_DATA;

    // ---------- Хелпер: экранирование ----------
    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ---------- Сборка товаров ----------
    function getProducts() {
        const overrides = Storage.getProductOverrides();
        const custom = Storage.getCustomProducts();
        const merged = {};
        for (const cat in baseProducts) {
            merged[cat] = baseProducts[cat]
                .filter(p => !(overrides[p.id] && overrides[p.id].hidden))
                .map(p => overrides[p.id] ? { ...p, ...overrides[p.id] } : p);
        }
        custom.forEach(p => {
            if (!merged[p.category]) merged[p.category] = [];
            merged[p.category].push(p);
        });
        return merged;
    }

    let cart = Storage.getCart();
    let wishlist = Storage.getWishlist();
    let currentUser = Storage.getCurrentUser();

    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');

    function getAllProducts() {
        const products = getProducts();
        let all = [];
        for (const cat in products) all = all.concat(products[cat]);
        return all;
    }
    function findProduct(id) { return getAllProducts().find(p => p.id === id); }
    function getCat(catId) { return categories.find(c => c.id === catId); }

    // ---------- Настройки ----------
    function applySettings() {
        const s = Storage.getSettings();
        const phoneLink = document.getElementById('headerPhone');
        if (phoneLink) phoneLink.innerHTML = `<i class="fas fa-phone"></i> ${esc(s.phone)}`;
        const hours = document.getElementById('headerHours');
        if (hours) hours.textContent = s.workingHours;
        const contactPhone = document.getElementById('contactPhone');
        if (contactPhone) contactPhone.textContent = s.phone;
        const footerPhone = document.getElementById('footerPhone');
        if (footerPhone) footerPhone.textContent = s.phone;
        const heroTitle = document.getElementById('heroTitle');
        if (heroTitle && s.heroTitle) heroTitle.textContent = s.heroTitle;
        const heroSubtitle = document.getElementById('heroSubtitle');
        if (heroSubtitle) heroSubtitle.textContent = s.heroSubtitle;
        const statYears = document.getElementById('statYears');
        if (statYears) statYears.textContent = s.yearsExperience;
        const statStores = document.getElementById('statStores');
        if (statStores) statStores.textContent = s.storesCount;
        const statProducts = document.getElementById('statProducts');
        if (statProducts) statProducts.textContent = s.productsCount;
    }

    // ---------- Категории ----------
    function renderCategoryGrid(container) {
        if (!container) return;
        container.classList.add('categories-grid');
        container.innerHTML = '';
        categories.forEach(cat => {
            const card = document.createElement('a');
            card.href = `catalog.html?category=${cat.id}`;
            card.className = 'category-card';
            card.innerHTML = `
                <div class="category-icon" style="background:${cat.color}20;">
                    <i class="fas ${cat.icon}" style="color:${cat.color};"></i>
                </div>
                <h3>${esc(cat.name)}</h3>
                <span class="category-count">(${cat.count} товаров)</span>`;
            container.appendChild(card);
        });
    }

    // ---------- Товары ----------
    function renderProducts(productList, container) {
        if (!container) return;
        container.classList.add('products-grid');
        container.innerHTML = '';
        productList.forEach(product => {
            const isInWishlist = wishlist.some(item => item.id === product.id);
            const card = document.createElement('div');
            card.className = 'product-card';
            card.setAttribute('data-id', product.id);
            card.innerHTML = `
                <div class="product-image" style="background:${getCat(product.category)?.color || '#999'};">
                    <i class="fas ${getCat(product.category)?.icon || 'fa-box'}"></i>
                    ${product.oldPrice ? '<span class="product-badge">Скидка</span>' : ''}
                    <button class="wishlist-btn ${isInWishlist ? 'active' : ''}" data-id="${product.id}">
                        <i class="fas fa-heart"></i>
                    </button>
                </div>
                <div class="product-info">
                    <h3 class="product-name" data-id="${product.id}">${esc(product.name)}</h3>
                    <p class="product-category">${esc(getCat(product.category)?.name || '')}</p>
                    <div class="product-rating">
                        <i class="fas fa-star"></i>
                        <span>${product.rating} (${product.reviews})</span>
                    </div>
                    <div class="product-footer">
                        <div class="product-price">
                            <span class="current-price">${product.price.toLocaleString()} ₽</span>
                            ${product.oldPrice ? `<span class="old-price">${product.oldPrice.toLocaleString()} ₽</span>` : ''}
                        </div>
                        <button class="add-to-cart" data-id="${product.id}">
                            <i class="fas fa-shopping-cart"></i>
                        </button>
                    </div>
                </div>`;
            container.appendChild(card);
        });
        attachProductEvents(container);
    }

    function attachProductEvents(container) {
        container.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', function(e) {
                if (e.target.closest('.wishlist-btn') || e.target.closest('.add-to-cart')) return;
                openProductModal(parseInt(this.dataset.id));
            });
        });
        container.querySelectorAll('.product-name').forEach(name => {
            name.addEventListener('click', function(e) {
                e.stopPropagation();
                openProductModal(parseInt(this.dataset.id));
            });
        });
        container.querySelectorAll('.add-to-cart').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                addToCart(parseInt(this.dataset.id));
            });
        });
        container.querySelectorAll('.wishlist-btn').forEach(btn => {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                toggleWishlist(parseInt(this.dataset.id));
            });
        });
    }

    // ---------- Модалка товара ----------
    function openProductModal(productId) {
        const product = findProduct(productId);
        if (!product) return;
        const modalTitle = document.getElementById('productModalTitle');
        const modalBody = document.getElementById('productModalBody');
        if (!modalTitle || !modalBody) return;

        modalTitle.textContent = product.name;
        const isInWishlist = wishlist.some(item => item.id === productId);
        const stores = product.stores || ['ул. Ленина, 45'];

        modalBody.innerHTML = `
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:25px;">
                <div style="background:${getCat(product.category)?.color || '#999'};border-radius:12px;display:flex;align-items:center;justify-content:center;min-height:250px;">
                    <i class="fas ${getCat(product.category)?.icon || 'fa-box'}" style="font-size:80px;color:rgba(255,255,255,0.8);"></i>
                </div>
                <div>
                    <p style="color:#999;margin-bottom:5px;">${esc(getCat(product.category)?.name || '')}</p>
                    <p style="margin-bottom:10px;"><strong>Бренд:</strong> ${esc(product.brand || '—')}</p>
                    <p style="margin-bottom:10px;"><strong>Тип:</strong> ${esc(product.type || '—')}</p>
                    <div class="product-rating" style="margin-bottom:10px;">
                        <i class="fas fa-star"></i>
                        <span>${product.rating} (${product.reviews} отзывов)</span>
                    </div>
                    <p style="margin-bottom:15px;line-height:1.6;">${esc(product.description || '')}</p>
                    <div style="display:flex;align-items:center;gap:15px;margin-bottom:20px;">
                        <span style="font-size:28px;font-weight:800;color:var(--primary);">${product.price.toLocaleString()} ₽</span>
                        ${product.oldPrice ? `<span style="text-decoration:line-through;color:#ccc;">${product.oldPrice.toLocaleString()} ₽</span>` : ''}
                    </div>
                    <div style="display:flex;gap:10px;margin-bottom:20px;">
                        <button class="btn-primary" id="modalAddToCart" style="flex:1;justify-content:center;">
                            <i class="fas fa-shopping-cart"></i> В корзину
                        </button>
                        <button id="modalWishlistBtn" style="width:50px;height:50px;border:2px solid #ddd;border-radius:8px;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:20px;background:${isInWishlist ? 'var(--primary)' : '#fff'};color:${isInWishlist ? '#fff' : '#ccc'};">
                            <i class="fas fa-heart"></i>
                        </button>
                    </div>
                </div>
            </div>
            <div style="margin-top:20px;">
                <h4 style="margin-bottom:10px;">В наличии в магазинах:</h4>
                <div style="display:grid;gap:8px;">
                    ${stores.map(store => `
                        <div style="display:flex;align-items:center;gap:10px;padding:10px;background:#f8f9fa;border-radius:8px;">
                            <i class="fas fa-store" style="color:var(--primary);"></i>
                            <span>${esc(store)}</span>
                        </div>`).join('')}
                </div>
            </div>`;
        openModal('productModal');
        document.getElementById('modalAddToCart').addEventListener('click', function() {
            addToCart(productId);
            closeModal(document.getElementById('productModal'));
        });
        document.getElementById('modalWishlistBtn').addEventListener('click', function() {
            toggleWishlist(productId);
            closeModal(document.getElementById('productModal'));
        });
    }

    // ---------- Корзина ----------
    function addToCart(productId) {
        const product = findProduct(productId);
        if (!product) return;
        const existing = cart.find(item => item.id === productId);
        if (existing) existing.quantity++;
        else cart.push({...product, quantity: 1});
        Storage.saveCart(cart);
        updateCartUI();
        showNotification(`${product.name} добавлен в корзину`);
    }

    function updateCartUI() {
        const count = document.querySelector('.cart-count');
        if (count) count.textContent = cart.reduce((s, i) => s + i.quantity, 0);
    }

    function renderCartItems() {
        const container = document.getElementById('cartItems');
        if (!container) return;
        const totalEl = document.querySelector('#cartModal .cart-total .total-price');
        if (cart.length === 0) {
            container.innerHTML = '<p class="empty-cart">Корзина пуста</p>';
            if (totalEl) totalEl.textContent = '0 ₽';
            return;
        }
        container.innerHTML = '';
        cart.forEach(item => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div style="width:50px;height:50px;border-radius:6px;background:${getCat(item.category)?.color || '#999'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${getCat(item.category)?.icon || 'fa-box'}" style="color:#fff;"></i>
                </div>
                <div class="cart-item-info">
                    <h4>${esc(item.name)}</h4>
                    <p>${item.price.toLocaleString()} ₽</p>
                </div>
                <div class="cart-item-controls">
                    <button class="qty-btn" data-id="${item.id}" data-action="minus">−</button>
                    <span>${item.quantity}</span>
                    <button class="qty-btn" data-id="${item.id}" data-action="plus">+</button>
                </div>
                <button class="remove-item" data-id="${item.id}"><i class="fas fa-trash"></i></button>`;
            container.appendChild(div);
        });
        const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        if (totalEl) totalEl.textContent = `${total.toLocaleString()} ₽`;
        container.querySelectorAll('.qty-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const id = parseInt(this.dataset.id);
                const item = cart.find(i => i.id === id);
                if (this.dataset.action === 'plus') item.quantity++;
                else { item.quantity--; if (item.quantity <= 0) cart = cart.filter(i => i.id !== id); }
                Storage.saveCart(cart);
                renderCartItems();
                updateCartUI();
            });
        });
        container.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', function() {
                cart = cart.filter(i => i.id !== parseInt(this.dataset.id));
                Storage.saveCart(cart);
                renderCartItems();
                updateCartUI();
            });
        });
    }

    // ---------- Избранное ----------
    function toggleWishlist(productId) {
        const product = findProduct(productId);
        if (!product) return;
        const index = wishlist.findIndex(i => i.id === productId);
        if (index === -1) {
            wishlist.push(product);
            showNotification('Добавлено в избранное');
        } else {
            wishlist.splice(index, 1);
            showNotification('Удалено из избранного', 'error');
        }
        Storage.saveWishlist(wishlist);
        updateWishlistUI();
        refreshCurrentView();
    }

    function updateWishlistUI() {
        const count = document.querySelector('.wishlist-count');
        if (count) count.textContent = wishlist.length;
    }

    function renderWishlist() {
        const container = document.getElementById('wishlistItems');
        if (!container) return;
        if (wishlist.length === 0) {
            container.innerHTML = '<p class="empty-cart">В избранном пусто</p>';
            return;
        }
        container.innerHTML = '';
        wishlist.forEach(item => {
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div style="width:50px;height:50px;border-radius:6px;background:${getCat(item.category)?.color || '#999'};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                    <i class="fas ${getCat(item.category)?.icon || 'fa-box'}" style="color:#fff;"></i>
                </div>
                <div class="cart-item-info">
                    <h4>${esc(item.name)}</h4>
                    <p>${item.price.toLocaleString()} ₽</p>
                </div>
                <button class="btn-primary" style="padding:8px 15px;font-size:13px;" data-id="${item.id}">В корзину</button>
                <button class="remove-item" data-id="${item.id}"><i class="fas fa-trash"></i></button>`;
            container.appendChild(div);
        });
        container.querySelectorAll('.btn-primary').forEach(btn => {
            btn.addEventListener('click', function() { addToCart(parseInt(this.dataset.id)); });
        });
        container.querySelectorAll('.remove-item').forEach(btn => {
            btn.addEventListener('click', function() {
                wishlist = wishlist.filter(i => i.id !== parseInt(this.dataset.id));
                Storage.saveWishlist(wishlist);
                updateWishlistUI();
                renderWishlist();
                refreshCurrentView();
            });
        });
    }

    function refreshCurrentView() {
        const products = getProducts();
        if (path.includes('catalog')) {
            if (categoryParam && products[categoryParam]) {
                renderProducts(products[categoryParam], document.getElementById('catalogContent'));
            } else {
                renderCategoryGrid(document.getElementById('catalogContent'));
            }
        } else {
            const popProd = document.getElementById('popularProducts');
            if (popProd) renderProducts(getAllProducts().slice(0, 4), popProd);
        }
    }

    // ---------- Модалки ----------
    function openModal(id) {
        const el = document.getElementById(id);
        if (!el) { console.warn('Modal not found:', id); return; }
        el.classList.add('active');
    }
    function closeModal(modal) { modal?.classList.remove('active'); }

    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
    });
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', () => closeModal(overlay.closest('.modal')));
    });

    document.getElementById('cartBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        renderCartItems();
        openModal('cartModal');
    });
    document.getElementById('wishlistBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        renderWishlist();
        openModal('wishlistModal');
    });

    // ---------- Карта ----------
    let deliveryMap = null;
    let deliveryPlacemark = null;
    const CHELYABINSK_BOUNDS = { minLat: 54.98, maxLat: 55.32, minLng: 61.20, maxLng: 61.60 };

    function isInChelyabinsk(coords) {
        const [lat, lng] = coords;
        return lat >= CHELYABINSK_BOUNDS.minLat && lat <= CHELYABINSK_BOUNDS.maxLat &&
               lng >= CHELYABINSK_BOUNDS.minLng && lng <= CHELYABINSK_BOUNDS.maxLng;
    }

    function initDeliveryMap() {
        const mapEl = document.getElementById('deliveryMap');
        if (!mapEl || deliveryMap) return;
        if (typeof ymaps === 'undefined') {
            mapEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#999;font-size:13px;text-align:center;padding:20px;">Карта недоступна. Введите адрес вручную.</div>';
            return;
        }
        ymaps.ready(function() {
            deliveryMap = new ymaps.Map('deliveryMap', {
                center: [55.1644, 61.4028], zoom: 11,
                controls: ['zoomControl', 'fullscreenControl']
            });
            deliveryMap.behaviors.disable('scrollZoom');
            deliveryMap.options.set({
                restrictMapArea: [
                    [CHELYABINSK_BOUNDS.minLat, CHELYABINSK_BOUNDS.minLng],
                    [CHELYABINSK_BOUNDS.maxLat, CHELYABINSK_BOUNDS.maxLng]
                ]
            });
            deliveryMap.events.add('click', function(e) {
                const coords = e.get('coords');
                if (!isInChelyabinsk(coords)) {
                    showNotification('Доставка только по Челябинску', 'error');
                    return;
                }
                setDeliveryPoint(coords);
            });
        });
    }

    function setDeliveryPoint(coords) {
        if (!isInChelyabinsk(coords)) {
            showNotification('Доставка только по Челябинску', 'error');
            return;
        }
        if (deliveryPlacemark) deliveryPlacemark.geometry.setCoordinates(coords);
        else {
            deliveryPlacemark = new ymaps.Placemark(coords, {}, { preset: 'islands#redDotIcon', draggable: true });
            deliveryPlacemark.events.add('dragend', function() {
                const newCoords = deliveryPlacemark.geometry.getCoordinates();
                if (!isInChelyabinsk(newCoords)) {
                    showNotification('Доставка только по Челябинску', 'error');
                    const old = deliveryPlacemark.properties.get('oldCoords') || [55.1644, 61.4028];
                    deliveryPlacemark.geometry.setCoordinates(old);
                    return;
                }
                updateDeliveryCoords(newCoords);
            });
            deliveryMap.geoObjects.add(deliveryPlacemark);
        }
        updateDeliveryCoords(coords);
    }

    function updateDeliveryCoords(coords) {
        const coordsInput = document.getElementById('orderCoords');
        if (!coordsInput) return;
        coordsInput.value = coords.join(',');
        if (deliveryPlacemark) deliveryPlacemark.properties.set('oldCoords', coords);
        ymaps.geocode(coords).then(function(res) {
            const firstGeoObject = res.geoObjects.get(0);
            if (firstGeoObject) {
                const address = firstGeoObject.getAddressLine();
                const areas = firstGeoObject.getAdministrativeAreas();
                const inChelyabinsk = (areas && areas.some(a => a && a.includes('Челябинск'))) || address.includes('Челябинск');
                if (!inChelyabinsk) {
                    showNotification('Доставка только по Челябинску', 'error');
                    document.getElementById('selectedAddressText').textContent = 'Точка вне зоны доставки';
                    document.getElementById('selectedAddress').classList.add('active');
                    coordsInput.value = '';
                    return;
                }
                document.getElementById('orderAddress').value = address;
                document.getElementById('selectedAddressText').textContent = address;
                document.getElementById('selectedAddress').classList.add('active');
            }
        });
    }

    document.getElementById('privateHouse')?.addEventListener('change', function() {
        const apartmentFields = document.getElementById('apartmentFields');
        if (!apartmentFields) return;
        if (this.checked) {
            apartmentFields.classList.add('hidden');
            document.getElementById('orderEntrance').value = '';
            document.getElementById('orderFloor').value = '';
            document.getElementById('orderApartment').value = '';
        } else {
            apartmentFields.classList.remove('hidden');
        }
    });

    const deliveryType = document.getElementById('deliveryType');
    const pickupGroup = document.getElementById('pickupStoreGroup');
    const addressGroup = document.getElementById('deliveryAddressGroup');

    function updateDeliveryFields() {
        if (!deliveryType) return;
        if (deliveryType.value === 'courier') {
            if (pickupGroup) pickupGroup.style.display = 'none';
            if (addressGroup) addressGroup.style.display = 'block';
            setTimeout(initDeliveryMap, 150);
        } else {
            if (pickupGroup) pickupGroup.style.display = 'block';
            if (addressGroup) addressGroup.style.display = 'none';
        }
    }
    deliveryType?.addEventListener('change', updateDeliveryFields);
    updateDeliveryFields();

    // ---------- Оформление заказа ----------
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#checkoutBtn');
        if (!btn) return;
        e.preventDefault();
        if (cart.length === 0) { showNotification('Корзина пуста', 'error'); return; }
        currentUser = Storage.getCurrentUser();
        if (!currentUser) {
            showNotification('Для оформления заказа необходимо войти', 'error');
            closeModal(document.getElementById('cartModal'));
            setTimeout(() => openModal('loginModal'), 300);
            return;
        }
        closeModal(document.getElementById('cartModal'));
        const container = document.getElementById('orderItems');
        if (container) {
            container.innerHTML = '';
            cart.forEach(item => {
                const div = document.createElement('div');
                div.className = 'order-item';
                div.innerHTML = `<span>${esc(item.name)} × ${item.quantity}</span><span>${(item.price * item.quantity).toLocaleString()} ₽</span>`;
                container.appendChild(div);
            });
            const total = cart.reduce((s, i) => s + i.price * i.quantity, 0);
            const orderTotalEl = document.querySelector('#checkoutModal .order-total .total-price');
            if (orderTotalEl) orderTotalEl.textContent = `${total.toLocaleString()} ₽`;
        }
        const nameInput = document.getElementById('orderName');
        const phoneInput = document.getElementById('orderPhone');
        if (nameInput && !nameInput.value) nameInput.value = currentUser.name || '';
        if (phoneInput && !phoneInput.value) phoneInput.value = currentUser.phone || '';
        updateDeliveryFields();
        openModal('checkoutModal');
    });

    document.getElementById('checkoutForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        currentUser = Storage.getCurrentUser();
        if (!currentUser) {
            showNotification('Необходима авторизация', 'error');
            closeModal(document.getElementById('checkoutModal'));
            openModal('loginModal');
            return;
        }
        if (!document.getElementById('ageConfirm').checked) {
            showNotification('Подтвердите, что вам есть 18 лет', 'error');
            return;
        }
        const dt = document.getElementById('deliveryType');
        if (dt && dt.value === 'courier') {
            const coords = document.getElementById('orderCoords').value;
            if (!coords) { showNotification('Укажите точку доставки на карте', 'error'); return; }
        }
        const order = {
            id: Date.now(),
            date: new Date().toLocaleDateString('ru-RU'),
            items: cart,
            total: cart.reduce((s, i) => s + i.price * i.quantity, 0),
            status: 'processing',
            name: document.getElementById('orderName').value,
            phone: document.getElementById('orderPhone').value,
            userPhone: currentUser.phone,
            userEmail: currentUser.email,
            deliveryType: dt ? dt.value : 'pickup',
            pickupStore: document.getElementById('pickupStore')?.value || '',
            address: document.getElementById('orderAddress')?.value || '',
            coords: document.getElementById('orderCoords')?.value || '',
            privateHouse: document.getElementById('privateHouse')?.checked || false,
            entrance: document.getElementById('orderEntrance')?.value || '',
            floor: document.getElementById('orderFloor')?.value || '',
            apartment: document.getElementById('orderApartment')?.value || '',
            paymentType: document.getElementById('paymentType')?.value || 'card'
        };
        Storage.addOrder(order);
        cart = [];
        Storage.saveCart(cart);
        updateCartUI();
        closeModal(document.getElementById('checkoutModal'));
        showNotification('Заказ оформлен! Следите за статусом в личном кабинете.');
    });

    // ---------- Авторизация ----------
    function updateAuthButton() {
        const authBtnText = document.getElementById('authBtnText');
        if (!authBtnText) return;
        currentUser = Storage.getCurrentUser();
        authBtnText.textContent = currentUser ? (currentUser.name || 'Профиль') : 'Войти';
    }

    document.addEventListener('click', function(e) {
        const authBtn = e.target.closest('#authBtn');
        if (authBtn) {
            e.preventDefault();
            const user = Storage.getCurrentUser();
            if (user) window.location.href = 'profile.html';
            else openModal('loginModal');
            return;
        }
        const showReg = e.target.closest('#showRegister');
        if (showReg) {
            e.preventDefault();
            closeModal(document.getElementById('loginModal'));
            openModal('registerModal');
        }
    });

    // ---------- Логин ----------
    document.getElementById('loginForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        const phone = document.getElementById('loginPhone').value;
        const password = document.getElementById('loginPassword').value;
        if (!Storage.isValidPhone(phone)) {
            showNotification('Введите корректный номер телефона', 'error');
            return;
        }
        const users = Storage.getUsers();
        const user = users.find(u => u.phone === phone);
        let ok = false;
        if (user) {
            if (user.passwordHash) {
                ok = await Storage.verifyPassword(password, user.passwordHash);
            } else if (user.password) {
                ok = user.password === password;
                if (ok) {
                    user.passwordHash = await Storage.hashPassword(password);
                    delete user.password;
                    Storage.saveUsers(users);
                }
            }
        }
        if (ok) {
            currentUser = user;
            Storage.setCurrentUser(user);
            closeModal(document.getElementById('loginModal'));
            updateAuthButton();
            document.getElementById('loginForm').reset();
            showNotification(`Добро пожаловать, ${user.name}!`);
        } else {
            showNotification('Неверный телефон или пароль', 'error');
        }
    });

    // ---------- Регистрация ----------
    let pendingRegistration = null;
    let emailResendInterval = null;

    document.getElementById('registerForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const phone = document.getElementById('regPhone').value;
        const email = document.getElementById('regEmail').value.trim().toLowerCase();
        const password = document.getElementById('regPassword').value;
        const password2 = document.getElementById('regPassword2').value;

        if (!Storage.isValidName(name)) return showNotification('Имя минимум 2 символа', 'error');
        if (!Storage.isValidPhone(phone)) return showNotification('Некорректный телефон', 'error');
        if (!Storage.isValidEmail(email)) return showNotification('Некорректный email', 'error');
        if (!Storage.isValidPassword(password)) return showNotification('Пароль минимум 6 символов', 'error');
        if (password !== password2) return showNotification('Пароли не совпадают', 'error');

        const users = Storage.getUsers();
        if (users.find(u => u.phone === phone)) return showNotification('Телефон уже зарегистрирован', 'error');
        if (users.find(u => u.email === email)) return showNotification('Email уже зарегистрирован', 'error');

        pendingRegistration = { name, phone, email, password };

        fetch('/api/send-email-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        })
        .then(r => r.json())
        .then(data => {
            if (!data.ok) {
                showNotification(data.error || 'Ошибка отправки', 'error');
                pendingRegistration = null;
                return;
            }
            document.getElementById('registerForm').style.display = 'none';
            document.getElementById('emailVerifyForm').style.display = 'block';
            document.getElementById('emailDisplay').textContent = email;
            document.getElementById('emailCodeInput').value = '';
            document.getElementById('emailCodeInput').focus();
            startEmailResendTimer();
            showNotification('Код отправлен на ' + email);
        })
        .catch(err => {
            console.error('Email error:', err);
            showNotification('Не удалось отправить письмо', 'error');
            pendingRegistration = null;
        });
    });

    function startEmailResendTimer() {
        let seconds = 60;
        const timerEl = document.getElementById('emailResendTimer');
        const resendBtn = document.getElementById('emailResendBtn');
        if (emailResendInterval) clearInterval(emailResendInterval);
        if (timerEl) timerEl.style.display = 'block';
        if (resendBtn) resendBtn.style.display = 'none';
        emailResendInterval = setInterval(() => {
            seconds--;
            const strong = timerEl?.querySelector('strong');
            if (strong) strong.textContent = seconds;
            if (seconds <= 0) {
                clearInterval(emailResendInterval);
                if (timerEl) timerEl.style.display = 'none';
                if (resendBtn) resendBtn.style.display = 'inline-block';
            }
        }, 1000);
    }

    document.getElementById('emailResendBtn')?.addEventListener('click', function() {
        if (!pendingRegistration) return;
        fetch('/api/send-email-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: pendingRegistration.email })
        })
        .then(r => r.json())
        .then(data => {
            if (!data.ok) { showNotification(data.error, 'error'); return; }
            startEmailResendTimer();
            showNotification('Код отправлен повторно');
        });
    });

    document.getElementById('emailBackBtn')?.addEventListener('click', function() {
        if (emailResendInterval) clearInterval(emailResendInterval);
        document.getElementById('emailVerifyForm').style.display = 'none';
        document.getElementById('registerForm').style.display = 'block';
        pendingRegistration = null;
    });

    document.getElementById('emailVerifyForm')?.addEventListener('submit', async function(e) {
        e.preventDefault();
        if (!pendingRegistration) {
            showNotification('Сессия истекла. Начните заново.', 'error');
            return;
        }
        const inputCode = document.getElementById('emailCodeInput').value.trim();
        if (!/^\d{6}$/.test(inputCode)) { showNotification('Введите 6-значный код', 'error'); return; }

        try {
            const r = await fetch('/api/verify-email-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: pendingRegistration.email, code: inputCode })
            });
            const data = await r.json();
            if (!data.ok) {
                showNotification(data.error || 'Неверный код', 'error');
                document.getElementById('emailCodeInput').value = '';
                document.getElementById('emailCodeInput').focus();
                return;
            }

            const { name, phone, email, password } = pendingRegistration;
            const users = Storage.getUsers();
            if (users.find(u => u.phone === phone)) {
                showNotification('Пользователь уже зарегистрирован', 'error');
                pendingRegistration = null;
                return;
            }

            const passwordHash = await Storage.hashPassword(password);
            const newUser = {
                name, phone, email,
                passwordHash,
                id: Date.now(),
                registeredAt: new Date().toLocaleDateString('ru-RU'),
                provider: 'phone+email',
                emailVerified: true
            };
            users.push(newUser);
            Storage.saveUsers(users);
            Storage.setCurrentUser(newUser);
            currentUser = newUser;

            pendingRegistration = null;
            if (emailResendInterval) clearInterval(emailResendInterval);

            closeModal(document.getElementById('registerModal'));
            updateAuthButton();
            document.getElementById('registerForm').reset();
            document.getElementById('emailVerifyForm').reset();
            document.getElementById('registerForm').style.display = 'block';
            document.getElementById('emailVerifyForm').style.display = 'none';
            showNotification(`Регистрация успешна! Добро пожаловать, ${name}!`);
        } catch (err) {
            console.error(err);
            showNotification('Ошибка проверки кода', 'error');
        }
    });

    document.getElementById('emailCodeInput')?.addEventListener('input', function() {
        this.value = this.value.replace(/\D/g, '').slice(0, 6);
    });

    document.querySelector('#registerModal .modal-close')?.addEventListener('click', function() {
        if (emailResendInterval) clearInterval(emailResendInterval);
        pendingRegistration = null;
        document.getElementById('registerForm').style.display = 'block';
        document.getElementById('emailVerifyForm').style.display = 'none';
    });

    // ---------- Профиль ----------
    if (path.includes('profile')) {
        const container = document.getElementById('profileContent');
        if (container) {
            currentUser = Storage.getCurrentUser();
            if (!currentUser) {
                container.innerHTML = `
                    <div style="text-align:center;padding:60px 20px;">
                        <i class="fas fa-user" style="font-size:60px;color:#ccc;margin-bottom:20px;"></i>
                        <h2 style="margin-bottom:15px;">Вы не авторизованы</h2>
                        <p style="color:#999;margin-bottom:20px;">Войдите или зарегистрируйтесь, чтобы видеть свои заказы</p>
                        <a href="index.html" class="btn-primary">На главную</a>
                    </div>`;
            } else {
                const orders = Storage.getOrders().filter(o =>
                    o.userPhone === currentUser.phone || o.phone === currentUser.phone
                );
                const ordersHtml = orders.length === 0
                    ? '<p style="color:#999;">У вас пока нет заказов</p>'
                    : orders.slice().reverse().map(order => {
                        const statusLabel = Storage.getStatusLabel(order.status);
                        const statusClass = Storage.getStatusClass(order.status);
                        const deliveryLabels = { pickup: 'Самовывоз', courier: 'Доставка' };
                        return `
                            <div class="order-card">
                                <div class="order-card-header">
                                    <div>
                                        <strong>Заказ #${order.id.toString().slice(-6)}</strong>
                                        <span class="order-date">${esc(order.date)}</span>
                                    </div>
                                    <span class="status-badge ${statusClass}">${statusLabel}</span>
                                </div>
                                <p class="order-meta">
                                    <i class="fas fa-truck"></i> ${deliveryLabels[order.deliveryType] || 'Самовывоз'}
                                    ${order.address ? ` • ${esc(order.address)}` : ''}
                                </p>
                                <div class="order-items-list">
                                    ${(order.items || []).map(i => `
                                        <div class="order-item-row">
                                            <span>${esc(i.name)} × ${i.quantity}</span>
                                            <span>${(i.price * i.quantity).toLocaleString()} ₽</span>
                                        </div>`).join('')}
                                </div>
                                <div class="order-card-total">
                                    <span>Итого:</span>
                                    <strong>${(order.total || 0).toLocaleString()} ₽</strong>
                                </div>
                            </div>`;
                    }).join('');

                container.innerHTML = `
                    <div class="profile-header">
                        <div class="profile-avatar">${esc((currentUser.name || '?').charAt(0).toUpperCase())}</div>
                        <div style="flex:1;">
                            <h2>${esc(currentUser.name)}</h2>
                            <p>${esc(currentUser.phone)}</p>
                            ${currentUser.email ? `<p style="font-size:13px;color:#999;"><i class="fas fa-envelope"></i> ${esc(currentUser.email)}</p>` : ''}
                        </div>
                        <button class="logout-btn" id="logoutBtn"><i class="fas fa-sign-out-alt"></i> Выйти</button>
                    </div>
                    <h3 style="margin:30px 0 20px;">История заказов</h3>
                    <div id="ordersList">${ordersHtml}</div>`;
                document.getElementById('logoutBtn').addEventListener('click', function() {
                    Storage.setCurrentUser(null);
                    window.location.reload();
                });
            }
        }
    }

    // ---------- Маска телефона ----------
    document.querySelectorAll('input[type="tel"]').forEach(input => {
        input.addEventListener('input', function() {
            const pos = this.selectionStart;
            const oldLen = this.value.length;
            let v = this.value.replace(/\D/g, '');
            if (v.startsWith('8')) v = '7' + v.slice(1);
            if (v && !v.startsWith('7')) v = '7' + v;
            let f = '';
            if (v.length > 0) f = '+7';
            if (v.length > 1) f += '-' + v.slice(1, 4);
            if (v.length > 4) f += '-' + v.slice(4, 7);
            if (v.length > 7) f += '-' + v.slice(7, 9);
            if (v.length > 9) f += '-' + v.slice(9, 11);
            this.value = f;
            const diff = f.length - oldLen;
            const newPos = Math.max(0, Math.min(f.length, pos + diff));
            this.setSelectionRange(newPos, newPos);
        });
    });

    // ---------- Отзывы ----------
    const defaultReviews = [
        { name: 'Александр', rating: 5, date: '15.06.2024', text: 'Отличный магазин! Большой выбор пиротехники, грамотные консультанты.', link: '#' },
        { name: 'Мария', rating: 5, date: '28.05.2024', text: 'Покупала фейерверк на свадьбу. Очень довольна качеством и обслуживанием.', link: '#' },
        { name: 'Дмитрий', rating: 4, date: '10.05.2024', text: 'Хороший ассортимент, цены приемлемые. Персонал помогает с выбором.', link: '#' },
        { name: 'Елена', rating: 5, date: '01.05.2024', text: 'Лучший магазин пиротехники! Всегда помогают с выбором.', link: '#' }
    ];

    function renderReviews() {
        const container = document.getElementById('reviewsGrid');
        if (!container) return;
        const reviews = Storage.getReviews() || defaultReviews;
        container.innerHTML = '';
        reviews.forEach(review => {
            const card = document.createElement('a');
            card.className = 'review-card';
            card.href = review.link || '#';
            if (review.link && review.link !== '#') card.target = '_blank';
            card.innerHTML = `
                <div class="review-header">
                    <div class="reviewer-avatar">${esc((review.name || '?').charAt(0))}</div>
                    <div>
                        <h4>${esc(review.name)}</h4>
                        <div class="review-rating">
                            ${Array(Math.round(review.rating)).fill('<i class="fas fa-star"></i>').join('')}
                        </div>
                    </div>
                </div>
                <p class="review-text">${esc(review.text)}</p>
                <span class="review-date">${esc(review.date)} • 2GIS</span>`;
            container.appendChild(card);
        });
    }

    // ---------- Формы-заглушки ----------
    document.getElementById('callback-form')?.addEventListener('submit', function(e) {
        e.preventDefault();
        showNotification('Заявка отправлена! Мы перезвоним вам.');
        this.reset();
    });

    document.querySelectorAll('.faq-question').forEach(q => {
        q.addEventListener('click', function() {
            this.parentElement.classList.toggle('open');
        });
    });

    document.getElementById('optomForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        showNotification('Заявка отправлена! Менеджер свяжется с вами.');
        this.reset();
    });

    document.getElementById('sharyOrderForm')?.addEventListener('submit', function(e) {
        e.preventDefault();
        showNotification('Заявка на шары отправлена! Мы перезвоним.');
        this.reset();
    });

    // ---------- Инициализация ----------
    function initPage() {
        applySettings();
        updateCartUI();
        updateWishlistUI();
        updateAuthButton();
        renderReviews();

        const products = getProducts();
        if (path.includes('catalog')) {
            const titleEl = document.getElementById('catalogTitle');
            if (titleEl) {
                titleEl.textContent = categoryParam && categories.find(c => c.id === categoryParam)
                    ? categories.find(c => c.id === categoryParam).name
                    : 'Каталог товаров';
            }
            if (categoryParam && products[categoryParam]) {
                renderProducts(products[categoryParam], document.getElementById('catalogContent'));
            } else {
                renderCategoryGrid(document.getElementById('catalogContent'));
            }
        } else if (document.getElementById('popularProducts')) {
            renderProducts(getAllProducts().slice(0, 4), document.getElementById('popularProducts'));
        }
    }

    initPage();

    // ---------- Плавные переходы ----------
    document.querySelectorAll('a[href]').forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            if (!href || href.startsWith('#') || href.startsWith('tel:') ||
                href.startsWith('mailto:') || href.startsWith('http') || this.target === '_blank') return;
            const current = window.location.pathname.split('/').pop() || 'index.html';
            if (href === current) return;
            e.preventDefault();
            document.body.classList.add('page-leaving');
            setTimeout(() => { window.location.href = href; }, 220);
        });
    });
});

window.addEventListener('pageshow', function(event) {
    document.body.classList.remove('page-leaving');
    document.body.style.opacity = '';
    document.body.style.transform = '';
    if (event.persisted) window.location.reload();
});

function showNotification(message, type = 'success') {
    const n = document.createElement('div');
    n.className = `notification ${type === 'error' ? 'error' : ''}`;
    n.textContent = message;
    document.body.appendChild(n);
    setTimeout(() => n.classList.add('show'), 100);
    setTimeout(() => {
        n.classList.remove('show');
        setTimeout(() => n.remove(), 400);
    }, 3000);
}