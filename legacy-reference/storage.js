/* =====================================================================
   СЛОЙ ДАННЫХ — браузерная версия
   ===================================================================== */

(function () {
    // ---------- SHA-256 ----------
    async function sha256(text) {
        const buf = new TextEncoder().encode(String(text));
        const hash = await crypto.subtle.digest('SHA-256', buf);
        return Array.from(new Uint8Array(hash))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    }

    const S = {
        // ---------- ЗАКАЗЫ ----------
        getOrders() {
            try { return JSON.parse(localStorage.getItem('orders')) || []; }
            catch (e) { return []; }
        },
        saveOrders(orders) { localStorage.setItem('orders', JSON.stringify(orders)); },
        addOrder(order) {
            const orders = this.getOrders();
            orders.push(order);
            this.saveOrders(orders);
        },
        updateOrder(id, patch) {
            const orders = this.getOrders();
            const idx = orders.findIndex(o => o.id === id);
            if (idx !== -1) {
                orders[idx] = { ...orders[idx], ...patch };
                this.saveOrders(orders);
            }
        },
        deleteOrder(id) {
            this.saveOrders(this.getOrders().filter(o => o.id !== id));
        },

        // ---------- ПОЛЬЗОВАТЕЛИ ----------
        getUsers() {
            try { return JSON.parse(localStorage.getItem('users')) || []; }
            catch (e) { return []; }
        },
        saveUsers(users) { localStorage.setItem('users', JSON.stringify(users)); },
        deleteUser(phone) {
            this.saveUsers(this.getUsers().filter(u => u.phone !== phone));
        },
        getCurrentUser() {
            try { return JSON.parse(localStorage.getItem('currentUser')) || null; }
            catch (e) { return null; }
        },
        setCurrentUser(user) {
            if (user) localStorage.setItem('currentUser', JSON.stringify(user));
            else localStorage.removeItem('currentUser');
        },

        // ---------- КОРЗИНА / ИЗБРАННОЕ ----------
        getCart() {
            try { return JSON.parse(localStorage.getItem('cart')) || []; }
            catch (e) { return []; }
        },
        saveCart(cart) { localStorage.setItem('cart', JSON.stringify(cart)); },
        getWishlist() {
            try { return JSON.parse(localStorage.getItem('wishlist')) || []; }
            catch (e) { return []; }
        },
        saveWishlist(list) { localStorage.setItem('wishlist', JSON.stringify(list)); },

        // ---------- ТОВАРЫ ----------
        getProductOverrides() {
            try { return JSON.parse(localStorage.getItem('productOverrides')) || {}; }
            catch (e) { return {}; }
        },
        saveProductOverrides(o) { localStorage.setItem('productOverrides', JSON.stringify(o)); },
        getCustomProducts() {
            try { return JSON.parse(localStorage.getItem('customProducts')) || []; }
            catch (e) { return []; }
        },
        saveCustomProducts(list) { localStorage.setItem('customProducts', JSON.stringify(list)); },

        // ---------- ОТЗЫВЫ ----------
        getReviews() {
            try { return JSON.parse(localStorage.getItem('reviewsData')); }
            catch (e) { return null; }
        },
        saveReviews(r) { localStorage.setItem('reviewsData', JSON.stringify(r)); },

        // ---------- НАСТРОЙКИ ----------
        getSettings() {
            try {
                const s = JSON.parse(localStorage.getItem('siteSettings'));
                if (s) return s;
            } catch (e) {}
            return {
                phone: '8 (908) 045-80-30',
                workingHours: 'Ежедневно 9:00 - 21:00',
                heroTitle: 'Создайте яркий праздник вместе с нами',
                heroSubtitle: 'Более 5000 наименований пиротехники от ведущих производителей',
                yearsExperience: 'более 15',
                storesCount: '5',
                productsCount: '5000+'
            };
        },
        saveSettings(s) { localStorage.setItem('siteSettings', JSON.stringify(s)); },

        // ---------- АДМИН ----------
        // Пароль НЕ хранится в localStorage. Проверка на сервере.
        isAdminLoggedIn() {
            // синхронная заглушка — реальная проверка через /api/admin-check
            return sessionStorage.getItem('adminLoggedIn') === '1';
        },
        adminLogin() { sessionStorage.setItem('adminLoggedIn', '1'); },
        async adminLogout() {
            sessionStorage.removeItem('adminLoggedIn');
            try {
                await fetch('/api/admin-logout', { method: 'POST', credentials: 'same-origin' });
            } catch (e) {}
        },
        async checkAdminSession() {
            try {
                const r = await fetch('/api/admin-check', { credentials: 'same-origin' });
                const data = await r.json();
                if (data.ok) {
                    sessionStorage.setItem('adminLoggedIn', '1');
                    return true;
                }
            } catch (e) {}
            sessionStorage.removeItem('adminLoggedIn');
            return false;
        },

        // ---------- ХЕШИРОВАНИЕ ПАРОЛЕЙ ----------
        hashPassword(password) { return sha256(password); },
        async verifyPassword(password, hash) {
            return (await sha256(password)) === hash;
        },

        // ---------- ВАЛИДАЦИЯ ----------
        isValidPhone(phone) {
            const digits = String(phone).replace(/\D/g, '');
            return digits.length === 11 && (digits[0] === '7' || digits[0] === '8');
        },
        isValidEmail(email) {
            return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email));
        },
        isValidPassword(pass) {
            return pass && pass.length >= 6;
        },
        isValidName(name) {
            return name && name.trim().length >= 2;
        },

        // ---------- ПОИСК ----------
        findUserByPhone(phone) {
            return this.getUsers().find(u => u.phone === phone) || null;
        },
        findUserByEmail(email) {
            return this.getUsers().find(u => u.email === email) || null;
        },

        // ---------- СТАТУСЫ ----------
        getStatusLabel(status) {
            const map = {
                processing: 'В обработке',
                confirmed: 'Подтверждён',
                delivering: 'Доставляется',
                delivered: 'Доставлен',
                cancelled: 'Отменён'
            };
            return map[status] || 'В обработке';
        },
        getStatusClass(status) {
            const map = {
                processing: 'status-processing',
                confirmed: 'status-confirmed',
                delivering: 'status-delivering',
                delivered: 'status-delivered',
                cancelled: 'status-cancelled'
            };
            return map[status] || 'status-processing';
        }
    };

    window.Storage = S;
})();