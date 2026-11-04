"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const target = path.join(__dirname, "..", ".env");
if (fs.existsSync(target)) {
  console.log(".env уже существует — сохранён без изменений.");
} else {
  const example = fs.readFileSync(
    path.join(__dirname, "..", ".env.example"),
    "utf8",
  );
  const content = example
    .replace(
      "REPLACE_WITH_64_RANDOM_HEX_CHARACTERS",
      crypto.randomBytes(32).toString("hex"),
    )
    .replace(
      "REPLACE_WITH_YOUR_PRIVATE_PASSWORD",
      crypto.randomBytes(24).toString("base64url"),
    );
  fs.writeFileSync(target, content, { flag: "wx", mode: 0o600 });
  console.log(
    "Создан .env со случайными секретами. Пароль администратора находится в поле ADMIN_PASSWORD этого файла.",
  );
}
console.log("Запуск: npm start. Локальный адрес: http://127.0.0.1:3000");
