// public/admin.js
document.addEventListener('DOMContentLoaded', function () {

    if (typeof Storage === 'undefined') {
        alert('Ошибка: storage.js не загружен.');
        return;
    }

    const { categories, baseProducts } = window.APP_DATA;

    // ---------- XSS-экранирование ----------
    function esc(s) {
        return String(s ?? '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    const loginScreen = document.getElementById('adminLogin');
    const appScreen = document.getElementById('adminApp');

    function showApp() {
        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        initApp();
    }

    // Проверка сессии на сервере
    Storage.checkAdminSession().then(ok => { if (ok) showApp(); });

    document.getElementById('adminLoginForm').addEventListener('submit', async function(e) {
        e.preventDefault();
        const pass = document.getElementById('adminPassword').value;
        try {
            const r = await fetch('/api/admin-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'same-origin',
                body: JSON.stringify({ password: pass })
            });
            if (r.ok) {
                Storage.adminLogin();
                showApp();
            } else {
                showToast('Неверный пароль', 'error');
                document.getElementById('adminPassword').value = '';
            }
        } catch (err) {
            showToast('Ошибка соединения', 'error');
        }
    });

    document.getElementById('adminLogoutBtn')?.addEventListener('click', async function() {
        await Storage.adminLogout();
        location.reload();
    });

    // ============ ТАБЫ ============
    document.querySelectorAll('.admin-nav a').forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const tab = this.dataset.tab;
            document.querySelectorAll('.admin-nav a').forEach(l => l.classList.remove('active'));
            this.classList.add('active');
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            const tabEl = document.getElementById('tab-' + tab);
            if (tabEl) tabEl.classList.add('active');
            renderTab(tab);
        });
    });

    function getAllBaseProducts() {
        let all = [];
        for (const cat in baseProducts) all = all.concat(baseProducts[cat]);
        return all;
    }

    function getMergedProducts() {
        const overrides = Storage.getProductOverrides();
        const custom = Storage.getCustomProducts();
        const base = getAllBaseProducts()
            .filter(p => !(overrides[p.id] && overrides[p.id].hidden))
            .map(p => overrides[p.id] ? { ...p, ...overrides[p.id] } : p);
        return [...base, ...custom];
    }

    // ============ INIT ============
    function initApp() {
        updateSidebarCounts();
        renderDashboard();
        renderOrders();
        renderClients();
        renderProducts();
        renderReviews();
        renderSettings();
        initModals();
        initForms();
        initProductCategoryFilter();
        initProductFormCategorySelect();
        startAutoRefresh();
    }

    // ============ АВТООБНОВЛЕНИЕ (только счётчики) ============
    function startAutoRefresh() {
        setInterval(() => {
            if (document.hidden) return;
            updateSidebarCounts();
        }, 5000);
    }

    function renderTab(tab) {
        if (tab === 'dashboard') renderDashboard();
        if (tab === 'orders') renderOrders();
        if (tab === 'clients') renderClients();
        if (tab === 'products') renderProducts();
        if (tab === 'reviews') renderReviews();
        if (tab === 'settings') renderSettings();
    }

    function updateSidebarCounts() {
        const orders = Storage.getOrders();
        const users = Storage.getUsers();
        const o = document.getElementById('ordersCount');
        const c = document.getElementById('clientsCount');
        if (o) o.textContent = orders.length;
        if (c) c.textContent = users.length;
    }

    // ============ ДАШБОРД ============
    function renderDashboard() {
        const orders = Storage.getOrders();
        const users = Storage.getUsers();
        const revenue = orders.reduce((s, o) => s + (o.total || 0), 0);
        const newOrders = orders.filter(o => o.status === 'processing').length;

        document.getElementById('statOrders').textContent = orders.length;
        document.getElementById('statRevenue').textContent = revenue.toLocaleString() + ' ₽';
        document.getElementById('statClients').textContent = users.length;
        document.getElementById('statNew').textContent = newOrders;

        const recent = orders.slice(-5).reverse();
        const container = document.getElementById('dashboardRecentOrders');
        if (recent.length === 0) {
            container.innerHTML = `<div class="admin-empty"><i class="fas fa-inbox"></i><p>Заказов пока нет</p></div>`;
            return;
        }
        container.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr><th>#</th><th>Клиент</th><th>Дата</th><th>Сумма</th><th>Статус</th></tr></thead>
                    <tbody>
                        ${recent.map(o => `
                            <tr>
                                <td>${esc(o.id.toString().slice(-6))}</td>
                                <td>${esc(o.name || '—')}</td>
                                <td>${esc(o.date || '—')}</td>
                                <td>${(o.total || 0).toLocaleString()} ₽</td>
                                <td>${statusBadge(o.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;
    }

    // ============ ЗАЯВКИ ============
    function renderOrders() {
        const filterEl = document.getElementById('ordersFilter');
        const filter = filterEl ? filterEl.value : 'all';
        let orders = Storage.getOrders().slice().reverse();
        if (filter !== 'all') orders = orders.filter(o => o.status === filter);

        const container = document.getElementById('ordersList');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `<div class="admin-empty"><i class="fas fa-inbox"></i><p>Заявок нет</p></div>`;
            return;
        }

        container.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr><th>#</th><th>Клиент</th><th>Телефон</th><th>Дата</th><th>Сумма</th><th>Статус</th><th></th></tr></thead>
                    <tbody>
                        ${orders.map(o => `
                            <tr>
                                <td>${esc(o.id.toString().slice(-6))}</td>
                                <td>${esc(o.name || '—')}</td>
                                <td>${esc(o.phone || '—')}</td>
                                <td>${esc(o.date || '—')}</td>
                                <td>${(o.total || 0).toLocaleString()} ₽</td>
                                <td>${statusBadge(o.status)}</td>
                                <td class="actions">
                                    <button class="admin-icon-btn" data-view="${o.id}"><i class="fas fa-eye"></i></button>
                                    <button class="admin-icon-btn danger" data-del="${o.id}"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>`;

        container.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', () => openOrderModal(parseInt(btn.dataset.view)));
        });
        container.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Удалить заказ?')) {
                    Storage.deleteOrder(parseInt(btn.dataset.del));
                    renderOrders();
                    renderDashboard();
                    updateSidebarCounts();
                }
            });
        });
    }

    function statusBadge(status) {
        const map = {
            processing: ['В обработке', 'status-processing'],
            confirmed: ['Подтверждён', 'status-confirmed'],
            delivering: ['Доставляется', 'status-delivering'],
            delivered: ['Доставлен', 'status-delivered'],
            cancelled: ['Отменён', 'status-cancelled']
        };
        const [text, cls] = map[status] || map.processing;
        return `<span class="status-badge ${cls}">${text}</span>`;
    }

    // ============ МОДАЛКА ЗАКАЗА ============
    function openOrderModal(id) {
        const order = Storage.getOrders().find(o => o.id === id);
        if (!order) return;

        document.getElementById('orderModalTitle').textContent = 'Заказ #' + id.toString().slice(-6);

        const itemsHtml = (order.items || []).map(i => `
            <div class="order-item">
                <span>${esc(i.name)} × ${i.quantity}</span>
                <span>${(i.price * i.quantity).toLocaleString()} ₽</span>
            </div>`).join('');

        const addressHtml = order.address ? `
            <p style="margin-bottom:8px;"><strong>Адрес:</strong> ${esc(order.address)}</p>
            ${order.privateHouse
                ? '<p style="margin-bottom:8px;color:#27ae60;"><i class="fas fa-home"></i> Частный дом</p>'
                : (order.apartment || order.entrance || order.floor
                    ? `<p style="margin-bottom:8px;">Подъезд: ${esc(order.entrance || '—')}, этаж: ${esc(order.floor || '—')}, кв.: ${esc(order.apartment || '—')}</p>`
                    : '')}` : '';

        const deliveryLabels = { pickup: 'Самовывоз', courier: 'Доставка' };
        const paymentLabels = { card: 'Картой при получении', cash: 'Наличными' };
        const pickupStores = {
            '1': 'ул. Ленина, 45',
            '2': 'ТРК «Родник», ул. Труда, 203',
            '3': 'пр. Комсомольский, 112'
        };

        const pickupHtml = order.deliveryType === 'pickup' && order.pickupStore
            ? `<p style="margin-bottom:8px;"><strong>Магазин:</strong> ${esc(pickupStores[order.pickupStore] || order.pickupStore)}</p>` : '';

        document.getElementById('orderModalBody').innerHTML = `
            <div style="margin-bottom:20px;">
                <p style="margin-bottom:8px;"><strong>Клиент:</strong> ${esc(order.name || '—')}</p>
                <p style="margin-bottom:8px;"><strong>Телефон:</strong> ${esc(order.phone || '—')}</p>
                <p style="margin-bottom:8px;"><strong>Дата:</strong> ${esc(order.date || '—')}</p>
                <p style="margin-bottom:8px;"><strong>Способ получения:</strong> ${deliveryLabels[order.deliveryType] || 'Самовывоз'}</p>
                ${pickupHtml}
                ${addressHtml}
                <p style="margin-bottom:8px;"><strong>Оплата:</strong> ${paymentLabels[order.paymentType] || 'Картой при получении'}</p>
            </div>
            <h4 style="margin-bottom:10px;">Состав заказа:</h4>
            <div style="margin-bottom:20px;">${itemsHtml}</div>
            <div class="order-total" style="margin-bottom:20px;">
                <span>Итого:</span><span>${(order.total || 0).toLocaleString()} ₽</span>
            </div>
            <div class="form-group">
                <label>Статус заказа</label>
                <select id="orderStatusSelect">
                    <option value="processing" ${order.status==='processing'?'selected':''}>В обработке</option>
                    <option value="confirmed" ${order.status==='confirmed'?'selected':''}>Подтверждён</option>
                    <option value="delivering" ${order.status==='delivering'?'selected':''}>Доставляется</option>
                    <option value="delivered" ${order.status==='delivered'?'selected':''}>Доставлен</option>
                    <option value="cancelled" ${order.status==='cancelled'?'selected':''}>Отменён</option>
                </select>
            </div>
            <button class="btn-primary btn-block" id="saveOrderStatus">
                <i class="fas fa-save"></i> Сохранить статус
            </button>`;

        document.getElementById('orderModal').classList.add('active');

        document.getElementById('saveOrderStatus').addEventListener('click', function() {
            const newStatus = document.getElementById('orderStatusSelect').value;
            Storage.updateOrder(id, { status: newStatus });
            document.getElementById('orderModal').classList.remove('active');
            renderOrders();
            renderDashboard();
            showToast('Статус обновлён.');
        });
    }

    // ============ КЛИЕНТЫ ============
    function renderClients() {
        const users = Storage.getUsers();
        const container = document.getElementById('clientsList');
        if (!container) return;

        if (users.length === 0) {
            container.innerHTML = `<div class="admin-empty"><i class="fas fa-users"></i><p>Клиентов пока нет</p></div>`;
            return;
        }
        const orders = Storage.getOrders();

        container.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr><th>Имя</th><th>Телефон</th><th>Email</th><th>Заказов</th><th>Сумма</th><th></th></tr></thead>
                    <tbody>
                        ${users.map(u => {
                            const userOrders = orders.filter(o => o.userPhone === u.phone || o.phone === u.phone);
                            const total = userOrders.reduce((s, o) => s + (o.total || 0), 0);
                            return `
                                <tr>
                                    <td>${esc(u.name || '—')}</td>
                                    <td>${esc(u.phone || '—')}</td>
                                    <td>${esc(u.email || '—')}</td>
                                    <td>${userOrders.length}</td>
                                    <td>${total.toLocaleString()} ₽</td>
                                    <td class="actions">
                                        <button class="admin-icon-btn danger" data-del-user="${esc(u.phone)}"><i class="fas fa-trash"></i></button>
                                    </td>
                                </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>`;

        container.querySelectorAll('[data-del-user]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Удалить клиента?')) {
                    Storage.deleteUser(btn.dataset.delUser);
                    renderClients();
                    updateSidebarCounts();
                }
            });
        });
    }

    // ============ ТОВАРЫ ============
    function initProductCategoryFilter() {
        const filter = document.getElementById('productsCategoryFilter');
        if (!filter || filter.options.length > 1) return;
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            filter.appendChild(opt);
        });
    }

    function initProductFormCategorySelect() {
        const sel = document.getElementById('pCategory');
        if (!sel || sel.options.length > 0) return;
        categories.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.id;
            opt.textContent = c.name;
            sel.appendChild(opt);
        });
    }

    function renderProducts() {
        const filter = document.getElementById('productsCategoryFilter');
        if (!filter) return;
        const catFilter = filter.value;
        let list = getMergedProducts();
        if (catFilter !== 'all') list = list.filter(p => p.category === catFilter);

        const container = document.getElementById('productsList');
        if (!container) return;

        if (list.length === 0) {
            container.innerHTML = `<div class="admin-empty"><i class="fas fa-box"></i><p>Товаров нет</p></div>`;
            return;
        }

        container.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr><th>Название</th><th>Категория</th><th>Цена</th><th>Рейтинг</th><th></th></tr></thead>
                    <tbody>
                        ${list.map(p => `
                            <tr>
                                <td><strong>${esc(p.name)}</strong><br><small style="color:#999;">${esc(p.brand || '')}</small></td>
                                <td>${esc(categories.find(c => c.id === p.category)?.name || '—')}</td>
                                <td>${p.price.toLocaleString()} ₽</td>
                                <td>${p.rating} (${p.reviews})</td>
                                <td class="actions">
                                    <button class="admin-icon-btn" data-edit-product="${p.id}"><i class="fas fa-edit"></i></button>
                                    <button class="admin-icon-btn danger" data-del-product="${p.id}"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;

        container.querySelectorAll('[data-edit-product]').forEach(btn => {
            btn.addEventListener('click', () => openProductModal(parseInt(btn.dataset.editProduct)));
        });
        container.querySelectorAll('[data-del-product]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('Удалить товар?')) return;
                const id = parseInt(btn.dataset.delProduct);
                const isCustom = Storage.getCustomProducts().some(p => p.id === id);
                if (isCustom) {
                    Storage.saveCustomProducts(Storage.getCustomProducts().filter(p => p.id !== id));
                } else {
                    const overrides = Storage.getProductOverrides();
                    overrides[id] = { ...(overrides[id] || {}), hidden: true };
                    Storage.saveProductOverrides(overrides);
                }
                renderProducts();
                showToast('Товар удалён.');
            });
        });
    }

    // ============ ФОРМЫ ============
    function initForms() {
        document.getElementById('ordersFilter')?.addEventListener('change', renderOrders);
        document.getElementById('productsCategoryFilter')?.addEventListener('change', renderProducts);
        document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal(null));
        document.getElementById('addReviewBtn')?.addEventListener('click', () => openReviewModal(null));

        document.getElementById('productForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const id = document.getElementById('pId').value;
            const data = {
                name: document.getElementById('pName').value,
                category: document.getElementById('pCategory').value,
                price: parseInt(document.getElementById('pPrice').value),
                oldPrice: document.getElementById('pOldPrice').value ? parseInt(document.getElementById('pOldPrice').value) : undefined,
                brand: document.getElementById('pBrand').value,
                type: document.getElementById('pType').value,
                description: document.getElementById('pDescription').value,
                rating: parseFloat(document.getElementById('pRating').value) || 5,
                reviews: parseInt(document.getElementById('pReviews').value) || 0
            };
            if (id) {
                const numericId = parseInt(id);
                const isCustom = Storage.getCustomProducts().some(p => p.id === numericId);
                if (isCustom) {
                    const custom = Storage.getCustomProducts();
                    const idx = custom.findIndex(p => p.id === numericId);
                    custom[idx] = { ...custom[idx], ...data };
                    Storage.saveCustomProducts(custom);
                } else {
                    const overrides = Storage.getProductOverrides();
                    const existing = overrides[numericId] || {};
                    overrides[numericId] = { ...existing, ...data };
                    Storage.saveProductOverrides(overrides);
                }
            } else {
                const custom = Storage.getCustomProducts();
                custom.push({ id: Date.now(), ...data });
                Storage.saveCustomProducts(custom);
            }
            document.getElementById('productModalAdmin').classList.remove('active');
            renderProducts();
            showToast('Товар сохранён.');
        });

        document.getElementById('reviewForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            const idx = document.getElementById('rIndex').value;
            const data = {
                name: document.getElementById('rName').value,
                rating: parseInt(document.getElementById('rRating').value) || 5,
                date: document.getElementById('rDate').value || new Date().toLocaleDateString('ru-RU'),
                text: document.getElementById('rText').value,
                link: document.getElementById('rLink').value || '#'
            };
            const list = getReviews();
            if (idx !== '') list[parseInt(idx)] = data;
            else list.push(data);
            Storage.saveReviews(list);
            document.getElementById('reviewModal').classList.remove('active');
            renderReviews();
            showToast('Отзыв сохранён.');
        });

        document.getElementById('settingsForm')?.addEventListener('submit', function(e) {
            e.preventDefault();
            Storage.saveSettings({
                phone: document.getElementById('setPhone').value,
                workingHours: document.getElementById('setWorkingHours').value,
                heroTitle: document.getElementById('setHeroTitle').value,
                heroSubtitle: document.getElementById('setHeroSubtitle').value,
                yearsExperience: document.getElementById('setYears').value,
                storesCount: document.getElementById('setStores').value,
                productsCount: document.getElementById('setProducts').value
            });
            showToast('Настройки сохранены.');
        });
    }

    function initModals() {
        document.querySelectorAll('#adminApp .modal-close').forEach(btn => {
            btn.addEventListener('click', () => btn.closest('.modal').classList.remove('active'));
        });
        document.querySelectorAll('#adminApp .modal-overlay').forEach(ov => {
            ov.addEventListener('click', () => ov.closest('.modal').classList.remove('active'));
        });
    }

    function openProductModal(id) {
        const form = document.getElementById('productForm');
        if (!form) return;
        form.reset();
        document.getElementById('pId').value = '';

        if (id) {
            const product = getMergedProducts().find(p => p.id === id);
            if (!product) return;
            document.getElementById('productModalAdminTitle').textContent = 'Редактировать товар';
            document.getElementById('pId').value = product.id;
            document.getElementById('pName').value = product.name;
            document.getElementById('pCategory').value = product.category;
            document.getElementById('pPrice').value = product.price;
            document.getElementById('pOldPrice').value = product.oldPrice || '';
            document.getElementById('pBrand').value = product.brand || '';
            document.getElementById('pType').value = product.type || '';
            document.getElementById('pDescription').value = product.description || '';
            document.getElementById('pRating').value = product.rating || 5;
            document.getElementById('pReviews').value = product.reviews || 0;
        } else {
            document.getElementById('productModalAdminTitle').textContent = 'Новый товар';
            document.getElementById('pRating').value = 5;
            document.getElementById('pReviews').value = 0;
        }
        document.getElementById('productModalAdmin').classList.add('active');
    }

    // ============ ОТЗЫВЫ ============
    const defaultReviews = [
        { name: '[Имя клиента]', rating: 5, date: '[дата]', text: '[Здесь будет текст отзыва клиента.]', link: '#' },
        { name: '[Имя клиента]', rating: 5, date: '[дата]', text: '[Здесь будет текст отзыва клиента.]', link: '#' },
        { name: '[Имя клиента]', rating: 4, date: '[дата]', text: '[Здесь будет текст отзыва клиента.]', link: '#' },
        { name: '[Имя клиента]', rating: 5, date: '[дата]', text: '[Здесь будет текст отзыва клиента.]', link: '#' }
    ];

    function getReviews() {
        return Storage.getReviews() || JSON.parse(JSON.stringify(defaultReviews));
    }

    function renderReviews() {
        const reviews = getReviews();
        const container = document.getElementById('reviewsList');
        if (!container) return;
        if (reviews.length === 0) {
            container.innerHTML = `<div class="admin-empty"><i class="fas fa-star"></i><p>Отзывов нет</p></div>`;
            return;
        }
        container.innerHTML = `
            <div class="admin-table-wrap">
                <table class="admin-table">
                    <thead><tr><th>Имя</th><th>Оценка</th><th>Дата</th><th>Текст</th><th></th></tr></thead>
                    <tbody>
                        ${reviews.map((r, i) => `
                            <tr>
                                <td>${esc(r.name)}</td>
                                <td>${'★'.repeat(Math.round(r.rating))}</td>
                                <td>${esc(r.date)}</td>
                                <td style="max-width:300px;">${esc(r.text.slice(0, 80))}${r.text.length > 80 ? '…' : ''}</td>
                                <td class="actions">
                                    <button class="admin-icon-btn" data-edit-review="${i}"><i class="fas fa-edit"></i></button>
                                    <button class="admin-icon-btn danger" data-del-review="${i}"><i class="fas fa-trash"></i></button>
                                </td>
                            </tr>`).join('')}
                    </tbody>
                </table>
            </div>`;

        container.querySelectorAll('[data-edit-review]').forEach(btn => {
            btn.addEventListener('click', () => openReviewModal(parseInt(btn.dataset.editReview)));
        });
        container.querySelectorAll('[data-del-review]').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('Удалить отзыв?')) return;
                const list = getReviews();
                list.splice(parseInt(btn.dataset.delReview), 1);
                Storage.saveReviews(list);
                renderReviews();
                showToast('Отзыв удалён');
            });
        });
    }

    function openReviewModal(index) {
        const form = document.getElementById('reviewForm');
        if (!form) return;
        form.reset();
        document.getElementById('rIndex').value = '';
        if (index !== null && index !== undefined) {
            const reviews = getReviews();
            const r = reviews[index];
            document.getElementById('rIndex').value = index;
            document.getElementById('rName').value = r.name;
            document.getElementById('rRating').value = r.rating;
            document.getElementById('rDate').value = r.date;
            document.getElementById('rText').value = r.text;
            document.getElementById('rLink').value = r.link || '';
        } else {
            document.getElementById('rRating').value = 5;
            document.getElementById('rDate').value = new Date().toLocaleDateString('ru-RU');
        }
        document.getElementById('reviewModal').classList.add('active');
    }

    // ============ НАСТРОЙКИ ============
    function renderSettings() {
        const s = Storage.getSettings();
        document.getElementById('setPhone').value = s.phone;
        document.getElementById('setWorkingHours').value = s.workingHours;
        document.getElementById('setHeroTitle').value = s.heroTitle;
        document.getElementById('setHeroSubtitle').value = s.heroSubtitle;
        document.getElementById('setYears').value = s.yearsExperience;
        document.getElementById('setStores').value = s.storesCount;
        document.getElementById('setProducts').value = s.productsCount;
    }

    // ============ TOAST ============
    function showToast(msg, type = 'success') {
        const t = document.createElement('div');
        t.className = `notification ${type === 'error' ? 'error' : ''}`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.classList.add('show'), 50);
        setTimeout(() => {
            t.classList.remove('show');
            setTimeout(() => t.remove(), 300);
        }, 3000);
    }
});

// Синхронизация между вкладками
window.addEventListener('storage', function(e) {
    if (!e.key) return;
    const syncKeys = ['users', 'orders', 'customProducts', 'productOverrides', 'reviewsData', 'siteSettings'];
    if (syncKeys.includes(e.key)) location.reload();
});

document.addEventListener('visibilitychange', function() {
    if (!document.hidden && typeof Storage !== 'undefined') {
        const ordersEl = document.getElementById('ordersCount');
        const clientsEl = document.getElementById('clientsCount');
        if (ordersEl) ordersEl.textContent = Storage.getOrders().length;
        if (clientsEl) clientsEl.textContent = Storage.getUsers().length;
    }
});