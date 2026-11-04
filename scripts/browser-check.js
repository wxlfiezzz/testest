const { chromium } = require("playwright");
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  { spawn } = require("child_process"),
  assert = require("assert/strict");
(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fireworks-browser-"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      PORT: "0",
      DATA_DIR: dir,
      HOST: "127.0.0.1",
      NODE_ENV: "development",
      SESSION_SECRET: "browser-test-secret-longer-than-32-characters",
      ADMIN_PASSWORD: "Browser-test-password-123",
      RESEND_API_KEY: "",
    },
  });
  let log = "";
  child.stdout.on("data", (x) => (log += x));
  child.stderr.on("data", (x) => (log += x));
  let browser;
  try {
    const base = await new Promise((resolve, reject) => {
      child.stdout.on("data", () => {
        const m = log.match(/Local site: (http:\/\/[^\s]+)/);
        if (m) resolve(m[1]);
      });
      child.once("exit", () => reject(Error("server failed")));
    });
    browser = await chromium.launch({
      executablePath:
        process.env.CHROMIUM_PATH ||
        (fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      headless: true,
      args: ["--no-sandbox"],
    });
    const errors = [];
    const page = await browser.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const target of [
        "/",
        "/catalog.html",
        "/shary.html",
        "/optom.html",
        "/profile.html",
        "/checkout.html",
        "/admin.html",
      ]) {
        await page.goto(base + target);
        await page.waitForLoadState("networkidle");
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth > innerWidth,
          ),
          false,
          "Horizontal overflow: " + target + " at " + width,
        );
      }
    }
    await page.goto(base + "/profile.html");
    await page.locator("#registerName").fill("Browser User");
    await page.locator("#registerPhone").fill("79000000001");
    await page.locator("#email").fill("browser@example.test");
    await page.locator("#registerPassword").fill("Browser-user-password-123");
    await page.locator("#loginForm button[type=submit]").click();
    await page.locator("#code").waitFor({ state: "visible" });
    const code = log.match(
      /Registration code for browser@example.test: (\d{6})/,
    )[1];
    await page.locator("#code").fill(code);
    await page.waitForURL(base + "/");
    await page.goto(base + "/profile.html");
    await page.locator("#accountPanel").waitFor({ state: "visible" });
    await page.locator("#logout").click();
    await page.locator("#loginPanel").waitFor({ state: "visible" });
    await page.goto(base + "/admin.html");
    await page.locator("#password").fill("Browser-test-password-123");
    await page.locator("#loginForm button[type=submit]").click();
    await page.locator("#dashboard").waitFor({ state: "visible" });

    await page.locator("[data-tab=products]").click();
    await page.locator("[data-section=products] summary").click();
    await page.locator("#productForm [name=name]").fill("Browser test balloon");
    await page
      .locator("#productForm [name=category]")
      .selectOption({ label: "Шары" });
    await page.locator("#productForm [name=price]").fill("100");
    await page.locator("#productForm [name=stock]").fill("4");
    await page.locator("#productForm button[type=submit]").click();
    await page
      .locator("#products h3")
      .filter({ hasText: "Browser test balloon" })
      .waitFor();
    await page.goto(base + "/profile.html");
    await page.locator("#showLogin").click();
    await page.locator("#loginEmail").fill("browser@example.test");
    await page.locator("#loginPassword").fill("Browser-user-password-123");
    await page.locator("#passwordLoginForm button[type=submit]").click();
    await page.waitForURL(base + "/");
    await page.goto(base + "/catalog.html");
    await page.locator("[data-add]").click();
    await page.goto(base + "/checkout.html");
    await page.waitForFunction(
      () => document.querySelector("#orderName").value === "Browser User",
    );
    assert.match(
      await page.locator("#cartLines").innerText(),
      /Browser test balloon/,
    );
    await page.locator("#checkoutForm button[type=submit]").click();
    await page.waitForURL(base + "/");
    await page.goto(base + "/profile.html");
    await page.locator("#orders .line").waitFor();
    await page.goto(base + "/admin.html");
    await page.locator("#orders .admin-item").waitFor();
    // Broken local storage must not prevent navigation or login.
    await page.evaluate(() =>
      localStorage.setItem("vp_cart", '{"unexpected":true}'),
    );
    await page.goto(base + "/checkout.html");
    await page.waitForLoadState("networkidle");
    assert.match(await page.locator("#cartLines").innerText(), /Корзина пуста/);

    assert.deepEqual(errors, []);
    console.log(
      "PASS: 14 responsive page checks, browser registration, logout, admin product creation, customer checkout and corrupted cart recovery; no uncaught page errors",
    );
  } finally {
    if (browser) await browser.close();
    child.kill();
    await new Promise((r) => child.once("exit", r));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
