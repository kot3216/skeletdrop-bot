"use strict";

const TOKEN = "9238600427:AAEaRZ1EzFLlP8DuQg4SdyvXeEL2efYi0Oo";
const WEB_APP_URL = "https://kot3216.github.io/skeletdrop/";
const ADMIN_ID = 6006668545; // 
const { Bot, InlineKeyboard } = require("grammy");
const fs     = require("fs");
const path   = require("path");
const http   = require("http");
const crypto = require("crypto");

const bot = new Bot(TOKEN);

/* 1 ⭐ = 0.012 GRAM */
const STAR_GRAM = 0.012;
const r3 = v => Math.round((Number(v) || 0) * 1000) / 1000;

const PACKAGES = {
  dep50:  { stars: 25,  gram: r3(25  * STAR_GRAM) }, // 0.30
  dep100: { stars: 50,  gram: r3(50  * STAR_GRAM) }, // 0.60
  dep250: { stars: 125, gram: r3(125 * STAR_GRAM) }, // 1.50
  dep500: { stars: 250, gram: r3(250 * STAR_GRAM) }  // 3.00
};

const DB_FILE = process.env.DB_PATH || path.join(__dirname, "db.json");
let cache = null;

function db() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { cache = { users: {}, codes: {}, payments: [] }; }
  if (!cache.users)    cache.users = {};
  if (!cache.codes)    cache.codes = {};
  if (!cache.payments) cache.payments = [];
  return cache;
}
function flush() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db())); }
  catch (e) { console.error("DB write:", e.message); }
}
function blankUser() {
  return { balance: 0, collection: [], lastFree: 0, subscribed: false, name: "Игрок", avatar: "💎", updatedAt: 0, deposited: 0 };
}
function getUser(uid) {
  const d = db();
  if (!d.users[uid]) d.users[uid] = blankUser();
  return d.users[uid];
}
function patchUser(uid, patch) {
  const d = db();
  d.users[uid] = Object.assign(blankUser(), d.users[uid] || {}, patch);
  d.users[uid].balance = r3(d.users[uid].balance);
  flush();
  return d.users[uid];
}
function addBalance(uid, amount) {
  const u = getUser(uid);
  return patchUser(uid, { balance: r3((u.balance || 0) + amount), updatedAt: Date.now() });
}

function verifyInitData(initData) {
  try {
    const p = new URLSearchParams(initData);
    const hash = p.get("hash");
    if (!hash) return null;
    p.delete("hash");
    const data = [...p.entries()].map(([k, v]) => k + "=" + v).sort().join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
    const calc = crypto.createHmac("sha256", secret).update(data).digest("hex");
    if (calc !== hash) return null;
    const authDate = Number(p.get("auth_date") || 0) * 1000;
    if (authDate && Date.now() - authDate > 86400000 * 3) return null;
    return Object.fromEntries(p);
  } catch { return null; }
}

function shopKeyboard() {
  const kb = new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL).row();
  kb.text("⭐ 25 → 0.30 GRAM", "pay:dep50").row();
  kb.text("⭐ 50 → 0.60 GRAM", "pay:dep100").row();
  kb.text("⭐ 125 → 1.50 GRAM", "pay:dep250").row();
  kb.text("⭐ 250 → 3.00 GRAM", "pay:dep500").row();
  kb.text("💎 Мой баланс", "me").text("🎟 Промокод", "promo").row();
  return kb;
}
const playKeyboard = () => new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL);

bot.command("start", async ctx => {
  await ctx.reply(
    "💀 <b>SkeletDrop</b>\n\n" +
    "Кейсы с NFT-подарками и 5 мини-игр.\n" +
    "Валюта игры: <b>💎 GRAM</b>\n\n" +
    "⭐ Пополнение звёздами Telegram.\n" +
    "Курс: <b>1 ⭐ = 0.012 GRAM</b>\n\n" +
    "🎟 Промокод: <code>STAR DROP</code> → 0.60 GRAM\n\n" +
    "Жми «Играть» или выбери пакет 👇",
    { parse_mode: "HTML", reply_markup: shopKeyboard() }
  );
});

bot.command("balance", async ctx => {
  const u = getUser(String(ctx.from.id));
  await ctx.reply(
    `💎 Баланс: <b>${Number(u.balance).toFixed(2)} GRAM</b>\n🎁 Подарков: ${(u.collection || []).length}\n⭐ Пополнено всего: ${Number(u.deposited || 0).toFixed(2)} GRAM`,
    { parse_mode: "HTML", reply_markup: playKeyboard() }
  );
});

bot.command("promo", async ctx => {
  await ctx.reply(
    "🎟 <b>Промокод</b>\n\n<code>STAR DROP</code> — 0.60 GRAM\n\nВводи в игре: <b>Пополнить → Промокод</b>.",
    { parse_mode: "HTML", reply_markup: playKeyboard() }
  );
});

bot.callbackQuery("me", async ctx => {
  const u = getUser(String(ctx.from.id));
  await ctx.answerCallbackQuery({ text: `💎 ${Number(u.balance).toFixed(2)} GRAM`, show_alert: true });
});
bot.callbackQuery("promo", async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🎟 <code>STAR DROP</code> → 0.60 GRAM\nВводи в игре в разделе «Пополнить».",
    { parse_mode: "HTML", reply_markup: playKeyboard() });
});

bot.callbackQuery(/^pay:(\w+)$/, async ctx => {
  const key = ctx.match[1];
  const pkg = PACKAGES[key];
  await ctx.answerCallbackQuery();
  if (!pkg) return;
  try {
    await bot.api.raw.sendInvoice({
      chat_id: ctx.chat.id,
      title: `Пополнение ${pkg.gram.toFixed(2)} GRAM`,
      description: `${pkg.stars} ⭐ → ${pkg.gram.toFixed(2)} GRAM (курс 0.012)`,
      payload: JSON.stringify({ uid: String(ctx.from.id), pkg: key }),
      currency: "XTR",
      prices: [{ label: "Пополнение", amount: pkg.stars }]
    });
  } catch (e) {
    console.error("sendInvoice:", e.message);
    await ctx.reply("Не удалось создать счёт. Попробуй ещё раз.");
  }
});

bot.on("pre_checkout_query", async ctx => {
  try { await ctx.answerPreCheckoutQuery(true); }
  catch (e) { console.error("pre_checkout:", e.message); }
});

bot.on("message:successful_payment", async ctx => {
  try {
    const sp = ctx.message.successful_payment;
    const data = JSON.parse(sp.invoice_payload);
    const pkg = PACKAGES[data.pkg];
    if (!pkg) return;
    const d = db();
    const charge = sp.telegram_payment_charge_id;
    if (d.payments.includes(charge)) return;
    d.payments.push(charge);
    if (d.payments.length > 5000) d.payments = d.payments.slice(-5000);
    const u = getUser(String(data.uid));
    const newBal = r3((u.balance || 0) + pkg.gram);
    patchUser(data.uid, {
      balance: newBal,
      deposited: r3((u.deposited || 0) + pkg.gram),
      updatedAt: Date.now()
    });
    flush();
    await ctx.reply(
      `✅ <b>Оплата получена!</b>\n\n⭐ ${pkg.stars} → +${pkg.gram.toFixed(2)} GRAM\n💎 Баланс: <b>${newBal.toFixed(2)} GRAM</b>\n\nОткрой игру — баланс уже обновлён 🎮`,
      { parse_mode: "HTML", reply_markup: playKeyboard() }
    );
  } catch (e) { console.error("successful_payment:", e.message); }
});

/* /code 0.6  — сумма в GRAM */
bot.command("code", async ctx => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const amount = parseFloat(String(ctx.match || "").replace(",", ".")) || 0;
  if (amount <= 0) return ctx.reply("Пример: /code 0.6");
  const code = "SD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  db().codes[code] = r3(amount);
  flush();
  await ctx.reply(`🎟 <code>${code}</code> → ${r3(amount).toFixed(2)} GRAM`, { parse_mode: "HTML" });
});

bot.command("give", async ctx => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const [uid, amount] = String(ctx.match || "").split(/\s+/);
  if (!uid || !amount) return ctx.reply("Пример: /give 123456789 0.5");
  const u = addBalance(uid, parseFloat(amount.replace(",", ".")) || 0);
  await ctx.reply(`✅ ${uid} → ${Number(u.balance).toFixed(2)} GRAM`);
});

bot.command("stats", async ctx => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const d = db();
  const users = Object.values(d.users);
  const total = users.reduce((a, u) => a + (u.deposited || 0), 0);
  await ctx.reply(
    `📊 Пользователей: ${users.length}\n💎 Пополнено: ${r3(total).toFixed(2)} GRAM\n🎟 Активных кодов: ${Object.keys(d.codes).length}`
  );
});

bot.catch(err => console.error("Bot error:", err.error || err.message));

function readBody(req) {
  return new Promise(resolve => {
    let raw = "";
    req.on("data", c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "GET") return res.end(JSON.stringify({ ok: true, service: "skeletdrop-gram", users: Object.keys(db().users).length }));
  const send = obj => res.end(JSON.stringify(obj));
  try {
    const body = await readBody(req);
    const url = (req.url || "").split("?")[0];

    if (url === "/api/check") {
      const code = String(body.code || "").toUpperCase().replace(/[\s\-_]+/g, "");
      const d = db();
      const found = Object.keys(d.codes).find(k => k.replace(/[\s\-_]+/g, "") === code);
      if (found) {
        const gram = r3(d.codes[found]);
        delete d.codes[found];
        flush();
        return send({ ok: true, gram });
      }
      return send({ ok: false });
    }

    const verified = verifyInitData(body.initData || "");
    if (!verified || !verified.user) return send({ ok: false, error: "auth" });
    const uid = String(JSON.parse(verified.user).id);

    if (url === "/api/load") return send({ ok: true, user: getUser(uid) });

    if (url === "/api/save") {
      const s = body.state || {};
      const current = getUser(uid);
      const incomingTs = Number(s.updatedAt) || 0;
      if (incomingTs < (current.updatedAt || 0)) return send({ ok: true, user: current });
      const u = patchUser(uid, {
        balance: Math.max(0, r3(s.balance)),
        collection: Array.isArray(s.collection) ? s.collection.slice(0, 600) : [],
        lastFree: Number(s.lastFree) || 0,
        subscribed: !!s.subscribed,
        name: String(s.name || "Игрок").slice(0, 24),
        avatar: String(s.avatar || "💎").slice(0, 8),
        updatedAt: incomingTs || Date.now()
      });
      return send({ ok: true, user: u });
    }

    if (url === "/api/invoice") {
      const pkg = PACKAGES[body.pkg];
      if (!pkg) return send({ ok: false, error: "pkg" });
      const link = await bot.api.raw.createInvoiceLink({
        title: `Пополнение ${pkg.gram.toFixed(2)} GRAM`,
        description: `${pkg.stars} ⭐ → ${pkg.gram.toFixed(2)} GRAM (1 ⭐ = 0.012)`,
        payload: JSON.stringify({ uid, pkg: body.pkg }),
        currency: "XTR",
        prices: [{ label: "Пополнение", amount: pkg.stars }]
      });
      return send({ ok: true, link });
    }

    return send({ ok: false, error: "route" });
  } catch (e) {
    console.error("API", req.url, e.message);
    return send({ ok: false, error: e.message });
  }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("✅ HTTP API на порту", PORT));
bot.start({ onStart: info => console.log("✅ Бот запущен:", info.username) })
   .catch(e => { console.error("❌ Бот не стартовал:", e.message); process.exit(1); });
process.on("SIGTERM", () => { flush(); server.close(); process.exit(0); });
process.on("SIGINT",  () => { flush(); server.close(); process.exit(0); });
