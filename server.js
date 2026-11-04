"use strict";
require("dotenv").config();
const express = require("express"),
  helmet = require("helmet"),
  rateLimit = require("express-rate-limit"),
  cookieParser = require("cookie-parser"),
  crypto = require("crypto"),
  fs = require("fs"),
  path = require("path");
const app = express(),
  PORT = Number(process.env.PORT || 3000),
  production = process.env.NODE_ENV === "production";
const host = process.env.HOST || "127.0.0.1";
if (!Number.isInteger(PORT) || PORT < 0 || PORT > 65535)
  throw new Error("PORT must be an integer between 0 and 65535");
if (process.env.TRUST_PROXY)
  app.set(
    "trust proxy",
    process.env.TRUST_PROXY.split(",").map((x) => x.trim()),
  );
const secret = process.env.SESSION_SECRET,
  adminPassword = process.env.ADMIN_PASSWORD;
if (
  !secret ||
  secret.length < 32 ||
  !adminPassword ||
  adminPassword.length < 12 ||
  /REPLACE_WITH/.test(secret + adminPassword)
) {
  console.error(
    "Configure SESSION_SECRET (32+ chars) and ADMIN_PASSWORD (12+ chars) in .env",
  );
  process.exit(1);
}
const root = path.resolve(
    process.env.DATA_DIR || path.join(__dirname, "private"),
  ),
  file = path.join(root, "store.json");
fs.mkdirSync(root, { recursive: true, mode: 0o700 });
const lockFile = path.join(root, "server.lock");
function acquireLock() {
  try {
    fs.writeFileSync(lockFile, String(process.pid), {
      flag: "wx",
      mode: 0o600,
    });
  } catch (err) {
    if (err.code !== "EEXIST") throw err;
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0)
      throw new Error("Invalid data lock; check " + lockFile);
    try {
      process.kill(pid, 0);
    } catch (check) {
      if (check.code !== "ESRCH") throw check;
      fs.unlinkSync(lockFile);
      return acquireLock();
    }
    throw new Error("This data directory is already in use by another server");
  }
}
acquireLock();
process.on("exit", () => {
  try {
    if (fs.readFileSync(lockFile, "utf8") === String(process.pid))
      fs.unlinkSync(lockFile);
  } catch {}
});
const shops = [
  "Улица Братьев Кашириных, 75/2",
  "Улица Зальцмана, 34 к1",
  "Улица Блюхера, 126/1",
  "Улица Академика Сахарова, 15/1",
  "Черкасская улица, 23/1",
];
let db = {
  users: [],
  orders: [],
  leads: [],
  reviews: [],
  products: [],
  sessions: [],
  codes: [],
  passwordResets: [],
  authAttempts: [],
};
try {
  db = { ...db, ...JSON.parse(fs.readFileSync(file, "utf8")) };
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
for (const key of Object.keys(db)) {
  if (!Array.isArray(db[key]))
    throw new Error("Invalid store collection: " + key);
}
function persist() {
  const tmp = file + ".tmp";
  try {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, file + ".bak");
      fs.chmodSync(file + ".bak", 0o600);
    }
    const fd = fs.openSync(tmp, "w", 0o600);
    try {
      fs.writeFileSync(fd, JSON.stringify(db, null, 2));
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  } catch (err) {
    // Keep memory consistent with the last committed state after an I/O failure.
    if (fs.existsSync(file))
      db = { ...db, ...JSON.parse(fs.readFileSync(file, "utf8")) };
    throw err;
  }
}
const now = () => Date.now(),
  id = () => crypto.randomUUID(),
  hash = (s) =>
    crypto.createHmac("sha256", secret).update(String(s)).digest("hex");
const safe = (s, max = 200) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";
const phone = (s) => {
  if (typeof s !== "string") return null;
  const d = s.replace(/\D/g, "");
  return /^([78])\d{10}$/.test(d) ? "+7" + d.slice(1) : null;
};
const email = (s) => {
  const x = safe(s, 254).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x) ? x : null;
};
const check = (a, b) => {
  const x = Buffer.from(hash(a)),
    y = Buffer.from(hash(b));
  return crypto.timingSafeEqual(x, y);
};
const adminVersion = () => hash("admin-password:" + adminPassword);
const limits = (max) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Слишком много запросов. Попробуйте позже" },
  });
app.disable("x-powered-by");
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        upgradeInsecureRequests: production ? [] : null,
        scriptSrc: [
          "'self'",
          "https://api-maps.yandex.ru",
          "https://*.yandex.ru",
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://*.yandex.ru",
          "https://*.yandex.net",
        ],
        connectSrc: ["'self'", "https://*.yandex.ru", "https://*.yandex.net"],
        frameSrc: ["'self'", "https://yandex.ru", "https://*.yandex.ru"],
      },
    },
  }),
);
app.use(express.json({ limit: "24kb" }));
app.use(cookieParser());
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", limits(160));
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    if (!req.is("application/json"))
      return fail(res, "Требуется Content-Type: application/json", 415);
    if (!req.body || typeof req.body !== "object" || Array.isArray(req.body))
      return fail(res, "Ожидается JSON-объект");
  }
  next();
});
// Persist account limits so IP changes and restarts do not reset a password attack.
function accountLimit(scope, max) {
  return (req, res, next) => {
    const key = hash(
      scope +
        ":" +
        (scope === "admin" ? "admin" : email(req.body.email) || req.ip),
    );
    const stamp = Date.now();
    db.authAttempts = db.authAttempts.filter((x) => x.until > stamp);
    let record = db.authAttempts.find((x) => x.key === key);
    if (record && record.count >= max)
      return fail(res, "Слишком много попыток. Попробуйте позже", 429);
    if (!record) {
      record = { key, count: 0, until: stamp + 15 * 60000 };
      db.authAttempts.push(record);
    }
    record.count++;
    persist();
    next();
  };
}
// Avoid overlapping mail requests and password changes for the same address.
const pending = new Set();
function exclusive(scope) {
  return (req, res, next) => {
    const key = scope + ":" + email(req.body.email);
    if (pending.has(key))
      return fail(res, "Запрос уже выполняется. Подождите", 429);
    pending.add(key);
    const release = () => pending.delete(key);
    res.once("finish", release);
    res.once("close", release);
    next();
  };
}

function fail(res, msg, status = 400) {
  return res.status(status).json({ error: msg });
}
function session(req, role = "user") {
  const token =
    req.cookies[role === "admin" ? "vp_admin_session" : "vp_session"];
  if (!token) return null;
  const s = db.sessions.find(
    (x) => x.tokenHash === hash(token) && x.exp > now(),
  );
  if (
    !s ||
    s.role !== role ||
    (role === "admin" && s.adminVersion !== adminVersion())
  )
    return null;
  return s;
}
function auth(req, res, next) {
  const s = session(req, "user");
  if (!s || s.role !== "user") return fail(res, "Требуется вход", 401);
  req.user = db.users.find((u) => u.id === s.userId);
  if (!req.user) return fail(res, "Требуется вход", 401);
  next();
}
function admin(req, res, next) {
  const s = session(req, "admin");
  if (!s || s.role !== "admin") return fail(res, "Доступ запрещён", 403);
  next();
}
function csrf(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (req.get("sec-fetch-site") === "cross-site")
    return fail(res, "Недопустимый источник запроса", 403);
  const origin = req.get("origin");
  const host = req.get("host");
  if (origin) {
    try {
      if (
        new URL(origin).host !== host ||
        !["http:", "https:"].includes(new URL(origin).protocol)
      )
        return fail(res, "Недопустимый источник запроса", 403);
    } catch {
      return fail(res, "Недопустимый источник запроса", 403);
    }
  } else if (production) return fail(res, "Отсутствует Origin", 403);
  next();
}
app.use("/api", csrf);
function setSession(res, userId, role) {
  const token = crypto.randomBytes(32).toString("hex");
  db.sessions = db.sessions.filter((s) => s.exp > now());
  const lifetime = role === "admin" ? 8 * 3600000 : 7 * 86400000;
  const previous = db.sessions.filter(
    (s) => s.userId === userId && s.role === role,
  );
  if (previous.length >= 5) {
    const oldest = previous.sort((a, b) => a.exp - b.exp)[0];
    db.sessions = db.sessions.filter((s) => s !== oldest);
  }
  db.sessions.push({
    tokenHash: hash(token),
    userId,
    role,
    exp: now() + lifetime,
    ...(role === "admin" ? { adminVersion: adminVersion() } : {}),
  });
  persist();
  res.cookie(role === "admin" ? "vp_admin_session" : "vp_session", token, {
    httpOnly: true,
    secure: production,
    sameSite: "lax",
    maxAge: lifetime,
    path: "/",
  });
}

// Resend HTTPS API avoids SMTP port 465, which is blocked by some ISPs/VPNs.
const mailConfigured = Boolean(
  process.env.RESEND_API_KEY && process.env.MAIL_FROM,
);
if (!Array.isArray(db.passwordResets)) db.passwordResets = [];
async function sendCodeEmail(
  to,
  code,
  subject = "Код подтверждения — Воздушный праздник",
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.MAIL_FROM,
        to: [to],
        subject,
        text: `Ваш код: ${code}. Действителен 5 минут. Никому его не сообщайте.`,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        `Resend HTTP ${response.status}: ${String(data.message || data.name || "ошибка сервиса").slice(0, 200)}`,
      );
  } finally {
    clearTimeout(timeout);
  }
}
// Passwords are stored using scrypt with a unique random salt, never in plaintext.
const scrypt = require("util").promisify(crypto.scrypt);
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = (await scrypt(password, salt, 64)).toString("hex");
  return `scrypt:${salt}:${digest}`;
}
async function passwordMatches(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt:")) return false;
  const parts = stored.split(":");
  if (
    parts.length !== 3 ||
    !/^[a-f0-9]{32}$/.test(parts[1]) ||
    !/^[a-f0-9]{128}$/.test(parts[2])
  )
    return false;
  const a = await scrypt(password, parts[1], 64),
    b = Buffer.from(parts[2], "hex");
  return crypto.timingSafeEqual(a, b);
}
const dummyPasswordHash =
  "scrypt:" +
  crypto.randomBytes(16).toString("hex") +
  ":" +
  crypto.randomBytes(64).toString("hex");
function validPassword(value) {
  return typeof value === "string" && value.length >= 12 && value.length <= 128;
}
app.post(
  "/api/auth/register",
  limits(5),
  exclusive("mail"),
  async (req, res) => {
    const e = email(req.body.email),
      name = safe(req.body.name, 80),
      p = phone(req.body.phone),
      password = req.body.password;
    if (!e || name.length < 2 || !p || !validPassword(password))
      return fail(
        res,
        "Заполните имя, телефон, email и пароль (минимум 12 символов)",
      );
    if (db.users.some((u) => u.email === e))
      return res.json({
        ok: true,
        message:
          "Если регистрация доступна, код отправлен. Если аккаунт уже есть, войдите или восстановите пароль.",
      });
    if (db.codes.some((c) => c.email === e && c.created > now() - 60000))
      return fail(res, "Повторная отправка доступна через минуту", 429);
    if (!mailConfigured && production)
      return fail(res, "Отправка писем не настроена", 503);
    const code = String(crypto.randomInt(100000, 1000000));
    const record = {
      email: e,
      name,
      phone: p,
      passwordHash: await passwordHash(password),
      hash: hash(e + ":" + code),
      exp: now() + 300000,
      created: now(),
      attempts: 0,
    };
    try {
      if (mailConfigured) await sendCodeEmail(e, code);
      else console.log(`[DEV ONLY] Registration code for ${e}: ${code}`);
      db.codes = db.codes.filter((c) => c.email !== e && c.exp > now());
      db.codes.push(record);
      persist();
      res.json({
        ok: true,
        message: mailConfigured
          ? "Если регистрация доступна, код отправлен. Если аккаунт уже есть, войдите или восстановите пароль."
          : "Тестовый код выведен в терминал сервера",
      });
    } catch (err) {
      console.error("Mail delivery failed:", err.message);
      return fail(
        res,
        "Не удалось отправить письмо. Проверьте настройки Resend.",
        503,
      );
    }
  },
);
app.post("/api/auth/verify", limits(12), (req, res) => {
  const e = email(req.body.email),
    code = safe(req.body.code, 8);
  if (!e || !/^[0-9]{6}$/.test(code))
    return fail(res, "Введите шестизначный код");
  const c = db.codes.find((x) => x.email === e);
  if (!c || c.exp < now() || c.attempts >= 5)
    return fail(res, "Код истёк или превышено число попыток", 401);
  c.attempts++;
  if (
    !crypto.timingSafeEqual(
      Buffer.from(hash(e + ":" + code)),
      Buffer.from(c.hash),
    )
  ) {
    persist();
    return fail(res, "Неверный код", 401);
  }
  if (!c.passwordHash)
    return fail(res, "Для этой регистрации нужно запросить новый код", 409);
  if (db.users.some((u) => u.email === e))
    return fail(res, "Эта почта уже зарегистрирована", 409);
  db.codes = db.codes.filter((x) => x.email !== e);
  const u = {
    id: id(),
    email: e,
    name: c.name,
    phone: c.phone,
    passwordHash: c.passwordHash,
    created: now(),
  };
  db.users.push(u);
  setSession(res, u.id, "user");
  res.json({
    ok: true,
    user: { id: u.id, email: u.email, name: u.name, phone: u.phone },
  });
});
app.post(
  "/api/auth/login",
  limits(8),
  accountLimit("login", 20),
  async (req, res) => {
    const e = email(req.body.email),
      password = req.body.password;
    const u = e ? db.users.find((x) => x.email === e) : null;
    const stored = u?.passwordHash;
    const matches =
      validPassword(password) &&
      (await passwordMatches(password, stored || dummyPasswordHash));
    if (!u || !matches || u.passwordHash !== stored)
      return fail(res, "Неверная почта или пароль", 401);
    setSession(res, u.id, "user");
    res.json({
      ok: true,
      user: { id: u.id, email: u.email, name: u.name, phone: u.phone },
    });
  },
);
// Password recovery: single-use short-lived code, no account enumeration.
app.post(
  "/api/auth/password-reset/request",
  limits(5),
  exclusive("mail"),
  async (req, res) => {
    const e = email(req.body?.email);
    if (!e) return fail(res, "Укажите корректный адрес почты");
    const generic =
      "Если аккаунт с такой почтой существует, мы отправили код для восстановления.";
    const user = db.users.find((u) => u.email === e);
    const existing = db.passwordResets.find(
      (r) => r.email === e && r.created > now() - 60000,
    );
    if (existing) return res.json({ ok: true, message: generic });
    if (!user) return res.json({ ok: true, message: generic });
    if (!mailConfigured && production)
      return fail(res, "Почтовый сервис временно недоступен", 503);
    const code = String(crypto.randomInt(100000, 1000000));
    try {
      if (mailConfigured)
        await sendCodeEmail(
          e,
          code,
          "Восстановление пароля — Воздушный праздник",
        );
      else console.log(`[DEV ONLY] Password reset code for ${e}: ${code}`);
      db.passwordResets = db.passwordResets.filter(
        (r) => r.email !== e && r.exp > now(),
      );
      db.passwordResets.push({
        email: e,
        codeHash: hash("reset:" + e + ":" + code),
        exp: now() + 5 * 60000,
        created: now(),
        attempts: 0,
      });
      persist();
      return res.json({ ok: true, message: generic });
    } catch (err) {
      console.error("Password reset mail delivery failed:", err.message);
      return fail(res, "Не удалось отправить письмо. Попробуйте позже.", 503);
    }
  },
);
app.post(
  "/api/auth/password-reset/confirm",
  limits(10),
  exclusive("reset"),
  async (req, res) => {
    const e = email(req.body?.email),
      code = safe(req.body?.code, 8),
      password = req.body?.password;
    if (!e || !/^[0-9]{6}$/.test(code))
      return fail(res, "Введите шестизначный код");
    if (!validPassword(password) || password !== req.body?.passwordRepeat)
      return fail(
        res,
        "Пароли должны совпадать и содержать от 12 до 128 символов",
      );
    const record = db.passwordResets.find((r) => r.email === e);
    if (!record || record.exp < now() || record.attempts >= 5)
      return fail(res, "Код истёк или превышено число попыток", 401);
    record.attempts++;
    const candidate = Buffer.from(hash("reset:" + e + ":" + code));
    const expected = Buffer.from(record.codeHash);
    if (
      candidate.length !== expected.length ||
      !crypto.timingSafeEqual(candidate, expected)
    ) {
      persist();
      return fail(res, "Неверный код", 401);
    }
    const user = db.users.find((u) => u.email === e);
    if (!user) return fail(res, "Не удалось восстановить пароль", 401);
    const updatedHash = await passwordHash(password);
    if (!db.passwordResets.includes(record) || record.exp < now())
      return fail(res, "Код истёк", 401);
    user.passwordHash = updatedHash;
    db.passwordResets = db.passwordResets.filter((r) => r.email !== e);
    db.sessions = db.sessions.filter((r) => r.userId !== user.id);
    persist();
    res.clearCookie("vp_session", { path: "/" });
    res.json({ ok: true, message: "Пароль изменён. Войдите с новым паролем." });
  },
);
app.get("/api/me", (req, res) => {
  const s = session(req, "user");
  const adminSession = session(req, "admin");
  const u = s?.role === "user" ? db.users.find((x) => x.id === s.userId) : null;
  res.json({
    user: u ? { id: u.id, email: u.email, name: u.name, phone: u.phone } : null,
    admin: adminSession?.role === "admin",
  });
});
app.post("/api/logout", (req, res) => {
  const role = req.body?.role === "admin" ? "admin" : "user";
  const s = session(req, role);
  if (s) db.sessions = db.sessions.filter((x) => x !== s);
  persist();
  res.clearCookie(role === "admin" ? "vp_admin_session" : "vp_session", {
    path: "/",
  });
  res.json({ ok: true });
});
app.patch("/api/me", auth, (req, res) => {
  const name = safe(req.body.name, 80),
    p = phone(req.body.phone);
  if (name.length < 2 || !p)
    return fail(res, "Укажите имя и корректный телефон");
  req.user.name = name;
  req.user.phone = p;
  persist();
  res.json({
    user: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      phone: req.user.phone,
    },
  });
});
app.get("/api/config", (req, res) =>
  res.json({
    shops,
    mapKey: process.env.YANDEX_MAPS_API_KEY || "",
    payment: ["При получении"],
    deliveryCity: "Челябинск",
  }),
);
app.get("/api/products", (req, res) =>
  res.json({ products: db.products.filter((p) => p.active !== false) }),
);
app.post("/api/orders", auth, limits(8), (req, res) => {
  const b = req.body;
  const requestKey = req.get("Idempotency-Key");
  if (requestKey && !/^[a-zA-Z0-9-]{16,80}$/.test(requestKey))
    return fail(res, "Некорректный идентификатор заказа");
  const requestHash = hash(JSON.stringify(b));
  const previous =
    requestKey &&
    db.orders.find(
      (o) => o.userId === req.user.id && o.requestKey === requestKey,
    );
  if (previous) {
    if (previous.requestHash !== requestHash)
      return fail(res, "Идентификатор уже использован для другого заказа", 409);
    return res.status(200).json({ order: previous });
  }
  const name = safe(b.name, 80),
    p = phone(b.phone),
    method = b.method,
    shop = safe(b.shop, 150),
    address = safe(b.address, 250),
    payment = safe(b.payment, 30),
    items = b.items;
  if (name.length < 2 || !p) return fail(res, "Имя и телефон обязательны");
  if (!["pickup", "delivery"].includes(method))
    return fail(res, "Выберите способ получения");
  if (payment !== "on-receipt")
    return fail(res, "Оплата доступна только при получении");
  if (method === "pickup" && !shops.includes(shop))
    return fail(res, "Выберите магазин самовывоза");
  if (
    method === "delivery" &&
    (!/челябинск/i.test(address) || address.length < 15)
  )
    return fail(res, "Адрес должен находиться в Челябинске");
  const lat = b.latitude,
    lon = b.longitude;
  if (
    method === "delivery" &&
    (!Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      lat < 54.9 ||
      lat > 55.4 ||
      lon < 61.1 ||
      lon > 61.8)
  )
    return fail(
      res,
      "Выберите дом на карте Челябинска (нужна метка с координатами)",
    );
  if (!Array.isArray(items) || !items.length || items.length > 30)
    return fail(res, "Корзина пуста или слишком большая");
  let total = 0;
  const lines = [];
  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !Number.isInteger(item.quantity)
    )
      return fail(res, "Некорректный товар или количество");
    if (lines.some((x) => x.id === item.id))
      return fail(res, "Товар повторяется в корзине");
    const product = db.products.find(
        (p) => String(p.id) === String(item.id) && p.active !== false,
      ),
      qty = Number(item.quantity);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > 20)
      return fail(res, "Некорректный товар или количество");
    if (!Number.isSafeInteger(product.price) || product.price < 0)
      return fail(res, "Некорректная цена товара");
    if (Number.isInteger(product.stock) && qty > product.stock)
      return fail(res, "Недостаточно товара: " + product.name);
    total += product.price * qty;
    lines.push({
      id: product.id,
      name: product.name,
      quantity: qty,
      price: product.price,
    });
  }
  if (!Number.isSafeInteger(total) || total > 10000000)
    return fail(res, "Сумма заказа превышает лимит");
  const order = {
    id: id(),
    ...(requestKey ? { requestKey, requestHash } : {}),
    userId: req.user.id,
    name,
    phone: p,
    method,
    shop: method === "pickup" ? shop : null,
    address: method === "delivery" ? address : null,
    coordinates:
      method === "delivery" ? { latitude: lat, longitude: lon } : null,
    payment,
    total,
    items: lines,
    status: "new",
    created: now(),
    ageCheckRequired: lines.some(
      (x) => db.products.find((p) => p.id === x.id)?.ageRestricted,
    ),
  };
  for (const line of lines) {
    const product = db.products.find((p) => p.id === line.id);
    if (Number.isInteger(product.stock)) product.stock -= line.quantity;
  }
  order.stockReserved = true;
  db.orders.push(order);
  persist();
  res.status(201).json({ order });
});
app.get("/api/orders", auth, (req, res) =>
  res.json({
    orders: db.orders.filter((o) => o.userId === req.user.id).reverse(),
  }),
);
app.post("/api/leads", auth, limits(6), (req, res) => {
  const b = req.body,
    type = safe(b.type, 20),
    name = safe(b.name, 80),
    p = phone(b.phone),
    message = safe(b.message, 1200);
  if (!["contact", "wholesale"].includes(type) || name.length < 2 || !p)
    return fail(res, "Проверьте контактные данные");
  const lead = {
    id: id(),
    type,
    userId: req.user.id,
    name,
    phone: p,
    message,
    created: now(),
  };
  if (type === "wholesale") {
    lead.organization = safe(b.organization, 150);
    lead.email = email(b.email);
    lead.volume = safe(b.volume, 120);
    if (!lead.organization || !lead.email || !lead.volume)
      return fail(res, "Заполните организацию, email и объём закупки");
  } else if (message.length < 5) return fail(res, "Напишите сообщение");
  db.leads.push(lead);
  persist();
  res.status(201).json({ ok: true });
});
app.get("/api/reviews", (req, res) =>
  res.json({
    reviews: db.reviews
      .filter((r) => r.published === true)
      .map(({ id, author, text, rating, source, sourceUrl, date }) => ({
        id,
        author,
        text,
        rating,
        source,
        sourceUrl,
        date,
      })),
  }),
);
app.post(
  "/api/admin/login",
  limits(5),
  accountLimit("admin", 20),
  (req, res) => {
    const p = safe(req.body.password, 200);
    if (!check(p, adminPassword)) return fail(res, "Неверные данные", 401);
    setSession(res, null, "admin");
    res.json({ ok: true });
  },
);
app.get("/api/admin/data", admin, (req, res) =>
  res.json({
    orders: db.orders,
    leads: db.leads,
    products: db.products,
    reviews: db.reviews,
    users: db.users.map(({ id, name, email, phone, created }) => ({
      id,
      name,
      email,
      phone,
      created,
    })),
  }),
);
app.post("/api/admin/products", admin, (req, res) => {
  const b = req.body,
    name = safe(b.name, 120),
    category = safe(b.category, 50),
    price = b.price,
    stock = b.stock;
  if (
    name.length < 2 ||
    !category ||
    !Number.isSafeInteger(price) ||
    price < 0 ||
    price > 10000000 ||
    !Number.isSafeInteger(stock) ||
    stock < 0
  )
    return fail(res, "Некорректные данные товара");
  const product = {
    id: id(),
    name,
    category,
    price,
    stock,
    description: safe(b.description, 1000),
    ageRestricted: !!b.ageRestricted,
    active: true,
  };
  db.products.push(product);
  persist();
  res.status(201).json({ product });
});
app.patch("/api/admin/products/:id", admin, (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id);
  if (!p) return fail(res, "Не найдено", 404);
  const b = req.body;
  if (
    b.price !== undefined &&
    (!Number.isSafeInteger(b.price) || b.price < 0 || b.price > 10000000)
  )
    return fail(res, "Некорректная цена");
  if (b.stock !== undefined && (!Number.isSafeInteger(b.stock) || b.stock < 0))
    return fail(res, "Некорректный остаток");
  if (b.active !== undefined && typeof b.active !== "boolean")
    return fail(res, "Некорректная видимость");
  for (const key of ["price", "stock", "active"])
    if (b[key] !== undefined) p[key] = b[key];
  persist();
  res.json({ product: p });
});
app.patch("/api/admin/orders/:id", admin, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return fail(res, "Не найдено", 404);
  if (!["new", "confirmed", "completed", "cancelled"].includes(req.body.status))
    return fail(res, "Недопустимый статус");
  if (
    ["completed", "cancelled"].includes(o.status) &&
    req.body.status !== o.status
  )
    return fail(res, "Завершённый заказ нельзя открыть повторно", 409);
  if (
    req.body.status === "cancelled" &&
    o.status !== "cancelled" &&
    o.stockReserved
  ) {
    for (const line of o.items) {
      const p = db.products.find((p) => p.id === line.id);
      if (p && Number.isInteger(p.stock)) p.stock += line.quantity;
    }
    o.stockReserved = false;
  }
  o.status = req.body.status;
  persist();
  res.json({ order: o });
});
function validSourceUrl(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      Boolean(u.hostname)
    );
  } catch {
    return false;
  }
}
app.post("/api/admin/reviews", admin, (req, res) => {
  const b = req.body,
    rating = b.rating,
    source = safe(b.source, 30),
    sourceUrl = safe(b.sourceUrl, 400);
  if (
    !safe(b.author, 100) ||
    !safe(b.text, 1000) ||
    !Number.isInteger(rating) ||
    rating < 1 ||
    rating > 5 ||
    !["Яндекс Карты", "2ГИС", "Сайт"].includes(source) ||
    !validSourceUrl(sourceUrl)
  )
    return fail(res, "Некорректный отзыв");
  const r = {
    id: id(),
    author: safe(b.author, 100),
    text: safe(b.text, 1000),
    rating,
    source,
    sourceUrl,
    date: safe(b.date, 30),
    published: false,
  };
  db.reviews.push(r);
  persist();
  res.status(201).json({ review: r });
});
app.patch("/api/admin/reviews/:id", admin, (req, res) => {
  const r = db.reviews.find((x) => x.id === req.params.id);
  if (!r) return fail(res, "Не найдено", 404);
  if (typeof req.body.published !== "boolean")
    return fail(res, "Некорректный статус публикации");
  r.published = req.body.published;
  persist();
  res.json({ review: r });
});
// Legacy endpoints deliberately unavailable: client must use authenticated server APIs.
app.use("/api", (req, res) => fail(res, "API endpoint not found", 404));
app.use(
  express.static(path.join(__dirname, "public"), {
    dotfiles: "deny",
    index: "index.html",
  }),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status =
    err.type === "entity.too.large"
      ? 413
      : err instanceof SyntaxError || err.status === 400
        ? 400
        : 500;
  console.error("Request failed:", err.code || err.type || err.name);
  res.status(status).json({
    error:
      status === 413
        ? "Слишком большой запрос"
        : status === 400
          ? "Некорректный запрос"
          : "Внутренняя ошибка сервера. Попробуйте позже",
  });
});
const server = app.listen(PORT, host, () =>
  console.log(`Local site: http://${host}:${server.address().port}`),
);
server.on("error", (err) => {
  console.error(
    err.code === "EADDRINUSE"
      ? "Порт занят. Остановите другой сервер или измените PORT."
      : err.message,
  );
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 5000).unref();
  });
