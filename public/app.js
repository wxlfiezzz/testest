"use strict";
const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
const api = async (url, options = {}) => {
  const r = await fetch("/api" + url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
  });
  let j;
  try {
    j = await r.json();
  } catch {
    throw Error("Сервер вернул некорректный ответ. Повторите запрос позже");
  }
  if (!r.ok) throw Error(j.error || "Ошибка запроса");
  return j;
};
const post = (u, data) =>
  api(u, { method: "POST", body: JSON.stringify(data) });
const patch = (u, data) =>
  api(u, { method: "PATCH", body: JSON.stringify(data) });
let me = null,
  config = null,
  products = [],
  cart = [];
try {
  const stored = JSON.parse(localStorage.getItem("vp_cart") || "[]");
  if (Array.isArray(stored))
    for (const item of stored.slice(0, 30)) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1
      )
        continue;
      const existing = cart.find((x) => x.id === item.id);
      if (existing)
        existing.quantity = Math.min(20, existing.quantity + item.quantity);
      else cart.push({ id: item.id, quantity: Math.min(20, item.quantity) });
    }
} catch {}

const saveCart = () => {
  try {
    localStorage.setItem("vp_cart", JSON.stringify(cart));
  } catch {}
  updateCount();
};
const updateCount = () => {
  const n = $("#cartCount");
  if (n) n.textContent = cart.reduce((a, x) => a + x.quantity, 0);
};
const message = (txt, ok = false) => {
  const el = $("#message");
  if (el) {
    el.className = ok ? "ok" : "error";
    el.textContent = txt;
  } else alert(txt);
};
function toast(text, kind = "success", redirect = null) {
  let host = document.querySelector("#toastHost");
  if (!host) {
    host = document.createElement("div");
    host.id = "toastHost";
    host.className = "toast-host";
    document.body.appendChild(host);
  }
  const item = document.createElement("div");
  item.className =
    "site-toast " + (kind === "error" ? "toast-error" : "toast-success");
  item.setAttribute("role", "status");
  item.textContent = text;
  host.appendChild(item);
  setTimeout(() => item.remove(), 4500);
  if (redirect) setTimeout(() => location.assign(redirect), 1800);
}
const money = (n) => Number(n || 0).toLocaleString("ru-RU") + " ₽";
const productCard = (p) =>
  `<article class="card"><div class="product-art" aria-hidden="true">${/шар/i.test(p.category + " " + p.name) ? '<svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c-4 0-7 3-7 7s3 7 7 7 7-3 7-7-3-7-7-7Z"/><path d="m10 17 2 2 2-2M12 19c-3 2 3 3 0 5"/></svg>' : /дым/i.test(p.category) ? '<svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 19h10a4 4 0 0 0 .4-8A6 6 0 0 0 6 9a5 5 0 0 0 1 10Z"/></svg>' : /фонтан/i.test(p.category) ? '<svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22c5 0 8-4 8-9 0-3-2-6-4-8 0 4-2 5-3 6 0-4-2-7-5-9 0 5-4 8-4 12 0 5 3 8 8 8Z"/></svg>' : '<svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z"/><path d="M20 18v4m-2-2h4M3 2v4M1 4h4"/></svg>'}</div><span class="pill">${esc(p.category)}</span><h3>${esc(p.name)}</h3><p class="muted">${esc(p.description || "")}</p><p class="price">${money(p.price)}</p><p class="small">В наличии: ${esc(p.stock ?? "уточняется")} ${p.ageRestricted ? " · возрастные ограничения" : ""}</p><button data-add="${esc(p.id)}">В корзину</button></article>`;
function add(id) {
  const p = products.find((x) => x.id === id);
  if (!p) return;
  if (p.stock === 0) return toast("Товар закончился", "error");
  const c = cart.find((x) => x.id === id);
  if (c)
    c.quantity = Math.min(
      c.quantity + 1,
      20,
      Number.isInteger(p.stock) ? p.stock : 20,
    );
  else cart.push({ id, quantity: 1 });
  saveCart();
  toast("✓ Товар добавлен в корзину");
}
function renderProducts() {
  const area = $("#products");
  if (!area) return;
  const query = ($("#search")?.value || "").toLowerCase(),
    category = $("#category")?.value || "";
  const onlyBalloons = area.dataset.onlyBalloons === "true";
  const filtered = products
    .filter(
      (p) =>
        (!onlyBalloons || /шар/i.test(p.category + " " + p.name)) &&
        (!category || p.category === category) &&
        p.name.toLowerCase().includes(query),
    )
    .slice(0, area.closest("#bestsellers") ? 4 : 100);
  area.innerHTML = filtered.length
    ? filtered.map(productCard).join("")
    : "<p>Товаров пока нет. Добавьте их через административную панель.</p>";
  area
    .querySelectorAll("[data-add]")
    .forEach((b) => (b.onclick = () => add(b.dataset.add)));
}
function renderCart() {
  const area = $("#cartLines");
  if (!area) return;
  cart = cart.filter((c) => products.some((p) => p.id === c.id));
  saveCart();
  area.innerHTML =
    cart
      .map((c) => {
        const p = products.find((x) => x.id === c.id);
        return `<div class="line"><div><b>${esc(p.name)}</b><div>${money(p.price)} × ${esc(c.quantity)}</div></div><button class="ghost" data-remove="${esc(c.id)}">Удалить</button></div>`;
      })
      .join("") || "<p>Корзина пуста</p>";
  $("#total").textContent = money(
    cart.reduce(
      (a, c) =>
        a + (products.find((p) => p.id === c.id)?.price || 0) * c.quantity,
      0,
    ),
  );
  area.querySelectorAll("[data-remove]").forEach(
    (b) =>
      (b.onclick = () => {
        cart = cart.filter((c) => c.id !== b.dataset.remove);
        renderCart();
      }),
  );
}
function setAuth() {
  const a = $("#authLink");
  if (a)
    a.innerHTML = me
      ? '<span aria-hidden="true"><svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span><small>Профиль</small>'
      : '<span aria-hidden="true"><svg class="vp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></svg></span><small>Войти</small>';
  const form = $("#loginPanel"),
    account = $("#accountPanel");
  if (form) form.hidden = !!me;
  if (account) account.hidden = !me;
  if (me) {
    if ($("#orderName")) $("#orderName").value = me.name || "";
    if ($("#orderPhone")) $("#orderPhone").value = me.phone || "";
    if ($("#accountEmail")) $("#accountEmail").textContent = me.email;
    if ($("#name")) $("#name").value = me.name || "";
    if ($("#phone")) $("#phone").value = me.phone || "";
  }
}
function shops() {
  const select = $("#shop");
  if (select)
    select.innerHTML = config.shops
      .map((s) => `<option value="${esc(s)}">${esc(s)}</option>`)
      .join("");
}
function delivery() {
  const d = $("#method")?.value === "delivery";
  if ($("#pickupBlock")) $("#pickupBlock").hidden = d;
  if ($("#deliveryBlock")) $("#deliveryBlock").hidden = !d;
}
let selectedDeliveryCoords = null;
function formatRuPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (!digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);
  const d = digits.slice(1);
  let out = "+7";
  if (d.length) out += " (" + d.slice(0, 3);
  if (d.length >= 3) out += ")";
  if (d.length > 3) out += "-" + d.slice(3, 6);
  if (d.length > 6) out += " " + d.slice(6, 8);
  if (d.length > 8) out += " " + d.slice(8, 10);
  return out;
}
function setupPhoneInputs() {
  document.querySelectorAll('input[type="tel"]').forEach((input) => {
    input.setAttribute("inputmode", "tel");
    input.setAttribute("maxlength", "20");
    input.setAttribute("placeholder", "+7 (950)-729 50 19");
    input.addEventListener("input", () => {
      input.value = formatRuPhone(input.value);
      input.setCustomValidity("");
    });
    input.addEventListener("blur", () => {
      if (
        input.required &&
        !/^\+7 \(\d{3}\)-\d{3} \d{2} \d{2}$/.test(input.value)
      )
        input.setCustomValidity("Введите номер полностью: +7 (950)-729 50 19");
      else input.setCustomValidity("");
    });
    if (input.value) input.value = formatRuPhone(input.value);
  });
}
function mapInit() {
  const el = $("#map");
  if (!el) return;
  const key = config.mapKey;
  if (!key) {
    el.textContent =
      "Выбор адреса временно недоступен. Выберите самовывоз или свяжитесь с магазином.";
    return;
  }
  const s = document.createElement("script");
  s.src =
    "https://api-maps.yandex.ru/2.1/?apikey=" +
    encodeURIComponent(key) +
    "&lang=ru_RU";
  s.onload = () =>
    ymaps.ready(() => {
      const m = new ymaps.Map("map", {
        center: [55.1644, 61.4368],
        zoom: 12,
        controls: ["zoomControl", "geolocationControl"],
      });
      let marker = null,
        selectionVersion = 0;
      async function choose(coords) {
        const version = ++selectionVersion;
        selectedDeliveryCoords = null;
        try {
          const result = await ymaps.geocode(coords, { results: 1 });
          if (version !== selectionVersion) return;
          const first = result.geoObjects.get(0);
          if (!first) throw Error("Адрес не найден");
          const address = first.getAddressLine();
          const kind = first.properties.get(
            "metaDataProperty.GeocoderMetaData.kind",
          );
          if (!/челябинск/i.test(address))
            throw Error("Выберите дом в Челябинске");
          if (kind !== "house")
            throw Error("Нажмите на конкретный дом, а не на улицу или район");
          const point = first.geometry.getCoordinates();
          if (marker) m.geoObjects.remove(marker);
          marker = new ymaps.Placemark(
            point,
            { balloonContent: address },
            { preset: "islands#orangeDotIcon", draggable: false },
          );
          m.geoObjects.add(marker);
          m.setCenter(point, 16);
          selectedDeliveryCoords = { latitude: point[0], longitude: point[1] };
          $("#address").value = address;
          message("Дом отмечен на карте: " + address, true);
        } catch (err) {
          if (version === selectionVersion)
            message(err.message || "Не удалось определить дом");
        }
      }
      m.events.add("click", (event) => choose(event.get("coords")));
      $("#address")?.addEventListener("input", () => {
        selectionVersion++;
        selectedDeliveryCoords = null;
        if (marker) m.geoObjects.remove(marker);
        marker = null;
        message("После изменения адреса отметьте дом на карте");
      });
    });
  s.onerror = () => {
    el.textContent =
      "Не удалось загрузить карту. Выберите самовывоз или попробуйте позже.";
  };
  document.head.appendChild(s);
}
async function init() {
  try {
    const [identity, configuration, catalog] = await Promise.all([
      api("/me"),
      api("/config"),
      api("/products"),
    ]);
    me = identity.user;
    config = configuration;
    products = catalog.products;
    setAuth();
    shops();
    setupPhoneInputs();
    renderProducts();
    renderCart();
    delivery();
    mapInit();
    loadReviews();
    loadOrders();
  } catch (e) {
    message(
      "Не удалось загрузить данные. Проверьте соединение и обновите страницу: " +
        e.message,
    );
  }
  updateCount();
  const params = new URLSearchParams(location.search);
  if ($("#search") && params.has("q")) $("#search").value = params.get("q");
  if ($("#category") && params.has("category"))
    $("#category").value = params.get("category");
  renderProducts();
  $("#search")?.addEventListener("input", renderProducts);
  $("#category")?.addEventListener("change", renderProducts);
  $("#method")?.addEventListener("change", delivery);
}
async function loadReviews() {
  const area = $("#reviews");
  if (!area) return;
  try {
    const d = await api("/reviews");
    area.innerHTML = d.reviews.length
      ? d.reviews
          .map(
            (r) =>
              `<article class="card"><b>${esc(r.author)}</b> · ${"★".repeat(r.rating)}<p>${esc(r.text)}</p><a class="small" target="_blank" rel="noopener noreferrer" href="${esc(r.sourceUrl)}">Источник: ${esc(r.source)}</a></article>`,
          )
          .join("")
      : "<p>Избранные отзывы появятся после модерации.</p>";
  } catch {
    area.textContent = "Не удалось загрузить отзывы. Обновите страницу.";
  }
}
async function loadOrders() {
  const el = $("#orders");
  if (!el || !me) return;
  try {
    const d = await api("/orders");
    const labels = {
      new: "Новый",
      confirmed: "Подтверждён",
      completed: "Выполнен",
      cancelled: "Отменён",
    };
    el.innerHTML =
      d.orders
        .map(
          (o) =>
            `<div class="line">${new Date(o.created).toLocaleDateString("ru-RU")} · ${money(o.total)} · ${esc(labels[o.status] || o.status)}</div>`,
        )
        .join("") || "Заказов пока нет";
  } catch {
    el.textContent = "Не удалось загрузить заказы. Обновите страницу.";
  }
}
function authMode(mode) {
  const register = mode === "register";
  $("#loginForm").hidden = !register;
  $("#passwordLoginForm").hidden = register;
  $("#codePanel").hidden = true;
  $("#resetPanel").hidden = true;
  $("#showRegister").classList.toggle("active", register);
  $("#showLogin").classList.toggle("active", !register);
  $("#showRegister").setAttribute("aria-selected", String(register));
  $("#showLogin").setAttribute("aria-selected", String(!register));
}
$("#forgotPassword")?.addEventListener("click", () => {
  $("#loginForm").hidden = true;
  $("#passwordLoginForm").hidden = true;
  $("#codePanel").hidden = true;
  $("#resetPanel").hidden = false;
  $("#resetRequestForm").hidden = false;
  $("#resetConfirmForm").hidden = true;
  $("#resetStatus").textContent = "";
  $("#resetEmail").value = $("#loginEmail").value;
  $("#resetEmail").focus();
});
$("#backToLogin")?.addEventListener("click", () => authMode("login"));
$("#resetRequestForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const result = await post("/auth/password-reset/request", {
      email: $("#resetEmail").value,
    });
    $("#resetStatus").textContent = result.message;
    $("#resetRequestForm").hidden = true;
    $("#resetConfirmForm").hidden = false;
    $("#resetCode").focus();
  } catch (error) {
    $("#resetStatus").textContent = error.message;
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
});
$("#resetConfirmForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = $("#resetPassword").value;
  if (password !== $("#resetPasswordRepeat").value) {
    $("#resetStatus").textContent = "Пароли не совпадают";
    return;
  }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await post("/auth/password-reset/confirm", {
      email: $("#resetEmail").value,
      code: $("#resetCode").value,
      password,
      passwordRepeat: $("#resetPasswordRepeat").value,
    });
    toast("Пароль изменён. Теперь войдите с новым паролем.", "success");
    authMode("login");
    $("#loginEmail").value = $("#resetEmail").value;
    $("#loginPassword").focus();
  } catch (error) {
    $("#resetStatus").textContent = error.message;
    toast(error.message, "error");
  } finally {
    button.disabled = false;
  }
});
$("#showRegister")?.addEventListener("click", () => authMode("register"));
$("#showLogin")?.addEventListener("click", () => authMode("login"));
$("#loginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.currentTarget.querySelector("[type=submit]");
  if (button.disabled) return;
  button.disabled = true;
  try {
    const sent = await post("/auth/register", {
      email: $("#email").value,
      name: $("#registerName").value,
      phone: $("#registerPhone").value,
      password: $("#registerPassword").value,
    });
    $("#codePanel").hidden = false;
    $("#loginForm").hidden = true;
    $("#code").value = "";
    $("#codeStatus").textContent = sent.message;
    $("#code").focus();
    toast(sent.message);
  } catch (err) {
    message(err.message);
    toast(err.message, "error");
  } finally {
    button.disabled = false;
  }
});
$("#passwordLoginForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const button = e.currentTarget.querySelector("[type=submit]");
  if (button.disabled) return;
  button.disabled = true;
  try {
    await post("/auth/login", {
      email: $("#loginEmail").value,
      password: $("#loginPassword").value,
    });
    location.assign("/");
  } catch (err) {
    message(err.message);
    toast(err.message, "error");
  } finally {
    button.disabled = false;
  }
});
let codeBusy = false;
$("#code")?.addEventListener("input", async (e) => {
  const input = e.currentTarget;
  input.value = input.value.replace(/\D/g, "").slice(0, 6);
  if (input.value.length !== 6 || codeBusy) return;
  codeBusy = true;
  input.disabled = true;
  $("#codeStatus").textContent = "Проверяем код…";
  try {
    await post("/auth/verify", { email: $("#email").value, code: input.value });
    $("#codeStatus").textContent = "Почта подтверждена. Выполняется вход…";
    toast("✓ Аккаунт создан! Добро пожаловать.", "success", "/");
  } catch (err) {
    input.value = "";
    $("#codeStatus").textContent = err.message;
    toast(err.message, "error");
  } finally {
    input.disabled = false;
    codeBusy = false;
    if (!input.value) input.focus();
  }
});
$("#changeEmail")?.addEventListener("click", () => authMode("register"));
$("#profileForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const d = await patch("/me", {
      name: $("#name").value,
      phone: $("#phone").value,
    });
    me = d.user;
    message("Данные сохранены", true);
  } catch (err) {
    message(err.message);
  }
});
$("#logout")?.addEventListener("click", async () => {
  try {
    await post("/logout", {});
    location.reload();
  } catch (err) {
    message(err.message);
  }
});
let checkoutRequest = null;
$("#checkoutForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!me) return message("Для оформления заказа войдите в личный кабинет");
  if (!cart.length) return message("Корзина пуста");
  if ($("#method").value === "delivery" && !selectedDeliveryCoords)
    return message("Выберите дом на карте, чтобы появилась метка");
  const form = e.currentTarget;
  const b = form.querySelector("button[type=submit]");
  if (b.disabled) return;
  b.disabled = true;
  try {
    const payload = {
      name: $("#orderName").value,
      phone: $("#orderPhone").value,
      method: $("#method").value,
      shop: $("#shop").value,
      address: $("#address").value,
      latitude: selectedDeliveryCoords?.latitude,
      longitude: selectedDeliveryCoords?.longitude,
      payment: "on-receipt",
      items: cart,
    };
    const fingerprint = JSON.stringify(payload);
    if (checkoutRequest?.fingerprint !== fingerprint)
      checkoutRequest = { fingerprint, key: crypto.randomUUID() };
    const d = await api("/orders", {
      method: "POST",
      body: fingerprint,
      headers: { "Idempotency-Key": checkoutRequest.key },
    });
    checkoutRequest = null;
    cart = [];
    saveCart();
    renderCart();
    toast(
      "✓ Заказ № " +
        d.order.id.slice(0, 8) +
        " оформлен! Оплата при получении.",
      "success",
      "/",
    );
  } catch (err) {
    message(err.message);
  } finally {
    b.disabled = false;
  }
});
$("#leadForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!me) return message("Войдите в личный кабинет");
  const f = e.currentTarget;
  const button = f.querySelector("[type=submit]");
  if (button.disabled) return;
  button.disabled = true;
  const data = Object.fromEntries(new FormData(f));
  data.type = f.dataset.type;
  try {
    await post("/leads", data);
    f.reset();
    message("Заявка отправлена", true);
  } catch (err) {
    message(err.message);
  } finally {
    button.disabled = false;
  }
});
init();
