"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const root = path.resolve(__dirname, "..");
const password = "Test-password-only-123";
async function start(data, extra = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      DATA_DIR: data,
      NODE_ENV: "development",
      SESSION_SECRET: "test-only-session-secret-with-more-than-32-chars",
      ADMIN_PASSWORD: password,
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      ...extra,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (x) => (log += x));
  child.stderr.on("data", (x) => (log += x));
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Server startup timed out"));
    }, 10000);
    child.stdout.on("data", () => {
      const m = log.match(/Local site: (http:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Startup failed: " + log));
    });
  });
  return {
    base,
    child,
    log: () => log,
    stop: async () => {
      if (child.exitCode === null) {
        child.kill();
        await once(child, "exit");
      }
    },
  };
}
async function req(server, url, body, cookie, method, headers = {}) {
  const r = await fetch(server.base + url, {
    method: method || (body !== undefined ? "POST" : "GET"),
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
    headers: r.headers,
  };
}
test("security and complete customer/admin workflow", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fireworks-test-"));
  let server = await start(dir);
  t.after(async () => {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  for (const page of ["/", "/profile.html", "/checkout.html", "/admin.html"])
    assert.equal((await req(server, page)).status, 200);
  for (const file of [
    "/.env",
    "/private/store.json",
    "/server.js",
    "/package.json",
  ])
    assert.equal((await req(server, file)).status, 404);
  assert.equal(
    (await req(server, "/api/me")).headers.get("cache-control"),
    "no-store",
  );
  assert.equal((await req(server, "/api/admin/data")).status, 403);
  assert.equal(
    (
      await req(server, "/api/auth/register", {
        email: "bad@example.test",
        name: "Bad",
        phone: { toString: null, valueOf: null },
        password,
      })
    ).status,
    400,
  );
  assert.equal((await req(server, "/api/auth/register", [])).status, 400);
  const malformed = await fetch(server.base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(malformed.status, 400);
  assert.doesNotMatch(await malformed.text(), /SyntaxError|server\.js/);
  assert.equal(
    (
      await req(server, "/api/admin/login", { password }, null, null, {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await req(server, "/api/admin/login", { password }, null, null, {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
    403,
  );
  const admin = await req(server, "/api/admin/login", { password });
  assert.equal(admin.status, 200);
  assert.match(admin.headers.get("set-cookie"), /HttpOnly/);
  const product = await req(
    server,
    "/api/admin/products",
    {
      name: "Test item",
      category: "balloons",
      price: 100,
      stock: 4,
      ageRestricted: true,
    },
    admin.cookie,
  );
  assert.equal(product.status, 201);
  const id = product.data.product.id;
  assert.equal(
    (
      await req(
        server,
        "/api/admin/products/" + id,
        { price: 200, stock: -1 },
        admin.cookie,
        "PATCH",
      )
    ).status,
    400,
  );
  assert.equal(
    (await req(server, "/api/products")).data.products[0].price,
    100,
  );
  await assert.rejects(start(dir), /already in use/);

  const email = "customer@example.test";
  assert.equal(
    (
      await req(server, "/api/auth/register", {
        email,
        name: "Test",
        phone: "+79000000000",
        password,
      })
    ).status,
    200,
  );
  const code = server
    .log()
    .match(/Registration code for customer@example.test: (\d{6})/)[1];
  const user = await req(server, "/api/auth/verify", { email, code });
  assert.equal(user.status, 200);
  const config = (await req(server, "/api/config")).data;
  const order = {
    name: "Test",
    phone: "+79000000000",
    method: "pickup",
    shop: config.shops[0],
    payment: "on-receipt",
    items: [{ id, quantity: 2 }],
  };
  assert.equal(
    (await req(server, "/api/orders", { ...order, items: [null] }, user.cookie))
      .status,
    400,
  );
  assert.equal(
    (
      await req(
        server,
        "/api/orders",
        {
          ...order,
          items: [
            { id, quantity: 4 },
            { id, quantity: 4 },
          ],
        },
        user.cookie,
      )
    ).status,
    400,
  );
  const key = "test-order-idempotency-123";
  const placed = await req(server, "/api/orders", order, user.cookie, null, {
    "Idempotency-Key": key,
  });
  const repeated = await req(server, "/api/orders", order, user.cookie, null, {
    "Idempotency-Key": key,
  });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.order.id, placed.data.order.id);
  assert.equal(
    (
      await req(
        server,
        "/api/orders",
        { ...order, name: "Changed" },
        user.cookie,
        null,
        { "Idempotency-Key": key },
      )
    ).status,
    409,
  );
  assert.equal(placed.status, 201);
  assert.equal(placed.data.order.total, 200);
  assert.equal((await req(server, "/api/products")).data.products[0].stock, 2);
  assert.equal(
    (
      await req(
        server,
        "/api/orders",
        { ...order, items: [{ id, quantity: 3 }] },
        user.cookie,
      )
    ).status,
    400,
  );
  const status = "/api/admin/orders/" + placed.data.order.id;
  assert.equal(
    (await req(server, status, { status: "cancelled" }, admin.cookie, "PATCH"))
      .status,
    200,
  );
  assert.equal((await req(server, "/api/products")).data.products[0].stock, 4);
  await req(server, status, { status: "cancelled" }, admin.cookie, "PATCH");
  assert.equal((await req(server, "/api/products")).data.products[0].stock, 4);
  assert.equal(
    (await req(server, status, { status: "new" }, admin.cookie, "PATCH"))
      .status,
    409,
  );
  assert.equal(
    (await req(server, "/api/auth/password-reset/request", { email })).status,
    200,
  );
  const reset = server
    .log()
    .match(/Password reset code for customer@example.test: (\d{6})/)[1];
  const next = "Changed-test-password-123";
  const results = await Promise.all([
    req(server, "/api/auth/password-reset/confirm", {
      email,
      code: reset,
      password: next,
      passwordRepeat: next,
    }),
    req(server, "/api/auth/password-reset/confirm", {
      email,
      code: reset,
      password: next,
      passwordRepeat: next,
    }),
  ]);
  assert.equal(results.filter((x) => x.status === 200).length, 1);
  assert.equal(
    (await req(server, "/api/orders", undefined, user.cookie)).status,
    401,
  );
  assert.equal(
    (await req(server, "/api/auth/login", { email, password: next })).status,
    200,
  );
  const review = await req(
    server,
    "/api/admin/reviews",
    {
      author: "Tester",
      text: "A review",
      rating: 5,
      source: "Сайт",
      sourceUrl: "https://example.test",
      date: "2026-11-02",
    },
    admin.cookie,
  );
  assert.equal(review.status, 201);
  await req(
    server,
    "/api/admin/reviews/" + review.data.review.id,
    { published: true },
    admin.cookie,
    "PATCH",
  );
  assert.equal((await req(server, "/api/reviews")).data.reviews.length, 1);
  await server.stop();
  server = await start(dir, { ADMIN_PASSWORD: "Another-test-password-123" });
  assert.equal(
    (await req(server, "/api/admin/data", undefined, admin.cookie)).status,
    403,
  );
  assert.equal((await req(server, "/api/products")).data.products.length, 1);
  assert.ok(fs.existsSync(path.join(dir, "store.json.bak")));
});

test("account limits survive restarts and do not trust arbitrary forwarded IPs", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fireworks-limit-"));
  let server = await start(dir);
  t.after(async () => {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  for (let restart = 0; restart < 4; restart++) {
    for (let attempt = 0; attempt < 5; attempt++)
      assert.equal(
        (
          await req(
            server,
            "/api/admin/login",
            { password: "wrong-password" },
            null,
            null,
            { "X-Forwarded-For": "203.0.113." + (attempt + 1) },
          )
        ).status,
        401,
      );
    await server.stop();
    server = await start(dir);
  }
  assert.equal(
    (await req(server, "/api/admin/login", { password })).status,
    429,
  );
});

test("production protects cookies, requires Origin and hides internal errors", async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fireworks-prod-"));
  const server = await start(dir, { NODE_ENV: "production" });
  t.after(async () => {
    await server.stop();
    fs.rmSync(dir, { recursive: true, force: true });
  });
  assert.equal(
    (await req(server, "/api/admin/login", { password })).status,
    403,
  );
  const admin = await req(
    server,
    "/api/admin/login",
    { password },
    null,
    null,
    { Origin: server.base },
  );
  assert.equal(admin.status, 200);
  assert.match(admin.headers.get("set-cookie"), /Secure/);
  const response = await fetch(server.base + "/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{",
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(await response.text(), /SyntaxError|server\.js/);
});

test("setup generates private credentials once and preserves existing configuration", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fireworks-setup-"));
  try {
    fs.mkdirSync(path.join(dir, "scripts"));
    fs.copyFileSync(
      path.join(root, "scripts/setup.js"),
      path.join(dir, "scripts/setup.js"),
    );
    fs.copyFileSync(
      path.join(root, ".env.example"),
      path.join(dir, ".env.example"),
    );
    async function setup() {
      const child = spawn(process.execPath, ["scripts/setup.js"], {
        cwd: dir,
        stdio: "ignore",
      });
      const [status] = await once(child, "exit");
      assert.equal(status, 0);
    }
    await setup();
    const initial = fs.readFileSync(path.join(dir, ".env"), "utf8");
    assert.doesNotMatch(initial, /REPLACE_WITH/);
    assert.match(initial, /SESSION_SECRET=[a-f0-9]{64}/);
    await setup();
    assert.equal(fs.readFileSync(path.join(dir, ".env"), "utf8"), initial);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
