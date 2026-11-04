"use strict";
const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const rub = (value) => Number(value || 0).toLocaleString("ru-RU") + " ₽";
const api = async (url, options = {}) => {
  const response = await fetch("/api" + url, {
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
    ...options,
    headers: { "Content-Type": "application/json" },
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("Сервер временно недоступен. Повторите запрос позже");
  }
  if (!response.ok) throw new Error(result.error || "Ошибка запроса");
  return result;
};
const post = (url, data) =>
  api(url, { method: "POST", body: JSON.stringify(data) });
const patch = (url, data) =>
  api(url, { method: "PATCH", body: JSON.stringify(data) });
const note = (text) => {
  const el = $("#message");
  el.textContent = text;
  el.hidden = false;
  el.setAttribute("role", "status");
  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
};
const statusNames = {
  new: "Новый",
  confirmed: "Подтверждён",
  completed: "Выполнен",
  cancelled: "Отменён",
};

function showTab(tab) {
  document
    .querySelectorAll("[data-tab]")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.tab === tab),
    );
  document.querySelectorAll("[data-section]").forEach((section) => {
    const selected = section.dataset.section === tab;
    section.hidden = !selected;
    section.classList.toggle("active", selected);
  });
}

async function refresh() {
  try {
    const data = await api("/admin/data");
    $("#login").hidden = true;
    $("#dashboard").hidden = false;
    $("#stats").innerHTML = [
      ["Заказы", data.orders.length, "▤"],
      ["Товары", data.products.length, "▦"],
      ["Новые заявки", data.leads.length, "✉"],
      ["Покупатели", data.users.length, "♙"],
    ]
      .map(
        ([title, count, icon]) =>
          `<article class="stat-card"><span>${icon}</span><strong>${count}</strong><small>${title}</small></article>`,
      )
      .join("");

    $("#products").innerHTML =
      data.products
        .map(
          (product) => `
            <article class="admin-item">
                <div class="admin-item-info"><span class="pill">${esc(product.category)}</span>
                    <h3>${esc(product.name)}</h3><p>${rub(product.price)} · ${esc(product.stock)} шт. · ${product.active !== false ? "На сайте" : "Скрыт"}</p></div>
                <div class="admin-item-actions">
                    <label>Цена, ₽ <input type="number" min="0" value="${product.price}" data-price="${esc(product.id)}"></label>
                    <label>Остаток <input type="number" min="0" value="${esc(product.stock)}" data-stock="${esc(product.id)}"></label>
                    <button type="button" data-save="${esc(product.id)}">Сохранить</button>
                    <button type="button" class="subtle-button" data-toggle="${esc(product.id)}" data-active="${product.active !== false}">${product.active !== false ? "Скрыть" : "Показать"}</button>
                </div>
            </article>`,
        )
        .join("") ||
      '<div class="empty-state">Товаров ещё нет. Добавьте первый товар выше.</div>';

    $("#orders").innerHTML =
      data.orders
        .slice()
        .reverse()
        .map(
          (order) => `
            <article class="admin-item"><div class="admin-item-info">
                <span class="pill">${esc(statusNames[order.status] || order.status)}</span>
                <h3>Заказ № ${esc(order.id.slice(0, 8))} · ${rub(order.total)}</h3>
                ${order.ageCheckRequired ? '<p class="notice">Требуется проверка возрастных ограничений перед выдачей.</p>' : ""}
                ${order.method === "delivery" ? '<p class="notice">Проверьте адрес и возможность доставки перед подтверждением.</p>' : ""}
                <p>${esc(order.name)} · ${esc(order.phone)}</p>
                <p>${esc(order.method === "pickup" ? order.shop : order.address)}</p>
                <p>${order.items.map((item) => `${esc(item.name)} × ${esc(item.quantity)}`).join(" · ")}</p>
            </div><div class="admin-item-actions"><label>Статус
                <select data-order="${esc(order.id)}">${Object.entries(
                  statusNames,
                )
                  .map(
                    ([key, label]) =>
                      `<option value="${key}" ${order.status === key ? "selected" : ""}>${label}</option>`,
                  )
                  .join("")}</select>
            </label></div></article>`,
        )
        .join("") || '<div class="empty-state">Заказов пока нет.</div>';

    $("#leads").innerHTML =
      data.leads
        .slice()
        .reverse()
        .map(
          (lead) => `
            <article class="admin-item"><div class="admin-item-info">
                <span class="pill">${lead.type === "wholesale" ? "Оптовая заявка" : "Вопрос"}</span>
                <h3>${esc(lead.name)} · ${esc(lead.phone)}</h3>
                <p>${esc(lead.organization || "")} ${esc(lead.email || "")} ${esc(lead.volume || "")}</p>
                <p>${esc(lead.message || "")}</p>
            </div></article>`,
        )
        .join("") || '<div class="empty-state">Заявок пока нет.</div>';

    $("#reviews").innerHTML =
      data.reviews
        .map(
          (review) => `
            <article class="admin-item"><div class="admin-item-info">
                <span class="pill">${review.published ? "Опубликован" : "На модерации"}</span>
                <h3>${esc(review.author)} · ${"★".repeat(review.rating)}</h3>
                <p>${esc(review.text)}</p><p>${esc(review.source)}</p>
            </div><div class="admin-item-actions"><button type="button" data-review="${esc(review.id)}" data-published="${review.published}">${review.published ? "Снять с сайта" : "Опубликовать"}</button></div></article>`,
        )
        .join("") ||
      '<div class="empty-state">Избранных отзывов пока нет. Добавьте отзыв и опубликуйте его после проверки.</div>';

    $("#customers").innerHTML =
      data.users
        .map(
          (user) => `
            <article class="admin-item"><div class="admin-item-info"><h3>${esc(user.name || "Без имени")}</h3>
                <p>${esc(user.email)} · ${esc(user.phone)}</p></div></article>`,
        )
        .join("") || '<div class="empty-state">Покупателей пока нет.</div>';

    document.querySelectorAll("[data-save]").forEach((button) =>
      button.addEventListener("click", async () => {
        const id = button.dataset.save;
        try {
          await patch("/admin/products/" + id, {
            price: Number(document.querySelector(`[data-price="${id}"]`).value),
            stock: Number(document.querySelector(`[data-stock="${id}"]`).value),
          });
          note("Товар обновлён");
          await refresh();
        } catch (error) {
          note(error.message);
        }
      }),
    );
    document.querySelectorAll("[data-toggle]").forEach((button) =>
      button.addEventListener("click", async () => {
        try {
          await patch("/admin/products/" + button.dataset.toggle, {
            active: button.dataset.active !== "true",
          });
          await refresh();
        } catch (error) {
          note(error.message);
        }
      }),
    );
    document.querySelectorAll("[data-order]").forEach((select) =>
      select.addEventListener("change", async () => {
        try {
          await patch("/admin/orders/" + select.dataset.order, {
            status: select.value,
          });
          note("Статус заказа обновлён");
        } catch (error) {
          note(error.message);
        }
      }),
    );
    document.querySelectorAll("[data-review]").forEach((button) =>
      button.addEventListener("click", async () => {
        try {
          await patch("/admin/reviews/" + button.dataset.review, {
            published: button.dataset.published !== "true",
          });
          await refresh();
        } catch (error) {
          note(error.message);
        }
      }),
    );
  } catch (error) {
    if (error.message === "Доступ запрещён") {
      $("#login").hidden = false;
      $("#dashboard").hidden = true;
    } else note(error.message);
  }
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("[type=submit]");
  if (button.disabled) return;
  button.disabled = true;
  try {
    await post("/admin/login", { password: $("#password").value });
    note("");
    await refresh();
  } catch (error) {
    note(error.message);
  } finally {
    button.disabled = false;
  }
});
$("#productForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  const button = event.currentTarget.querySelector("[type=submit]");
  button.disabled = true;
  button.textContent = "Сохраняем…";
  form.price = Number(form.price);
  form.stock = Number(form.stock);
  form.ageRestricted = !!form.ageRestricted;
  try {
    await post("/admin/products", form);
    event.target.reset();
    note("Товар добавлен");
    await refresh();
  } catch (error) {
    note("Не удалось создать товар: " + error.message);
  } finally {
    button.disabled = false;
    button.textContent = "Сохранить товар";
  }
});
$("#reviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = Object.fromEntries(new FormData(event.currentTarget));
  form.rating = Number(form.rating);
  try {
    await post("/admin/reviews", form);
    event.target.reset();
    note("Отзыв отправлен на модерацию");
    await refresh();
  } catch (error) {
    note(error.message);
  }
});
$("#adminLogout").addEventListener("click", async () => {
  try {
    await post("/logout", { role: "admin" });
    location.reload();
  } catch (error) {
    note(error.message);
  }
});
document
  .querySelectorAll("[data-tab]")
  .forEach((button) =>
    button.addEventListener("click", () => showTab(button.dataset.tab)),
  );
refresh();
