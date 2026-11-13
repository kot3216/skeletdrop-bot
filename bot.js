"use strict";

const TOKEN       = process.env.BOT_TOKEN   || "9238600427:AAEaRZ1EzFLlP8DuQg4SdyvXeEL2efYi0Oo";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://kot3216.github.io/skeletdrop/";
const ADMIN_ID    = Number(process.env.ADMIN_ID || 6006668545;

const { Bot, InlineKeyboard } = require("grammy");
const fs     = require("fs");
const path   = require("path");
const http   = require("http");
const crypto = require("crypto");

const bot = new Bot(TOKEN);

/* только старые пакеты: 1 ⭐ = 2 ₽ */
const PACKAGES = {
  dep50:  { stars: 25,  rub: 50  },
  dep100: { stars: 50,  rub: 100 },
  dep250: { stars: 125, rub: 250 },
  dep500: { stars: 250, rub: 500 }
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
  return { balance:0, collection:[], lastFree:0, subscribed:false, name:"Игрок", avatar:"💀", updatedAt:0, deposited:0 };
}
function getUser(uid) {
  const d = db();
  if (!d.users[uid]) d.users[uid] = blankUser();
  return d.users[uid];
}
function patchUser(uid, patch) {
  const d = db();
  d.users[uid] = Object.assign(blankUser(), d.users[uid] || {}, patch);
  flush();
  return d.users[uid];
}
function addBalance(uid, amount) {
  const u = getUser(uid);
  return patchUser(uid, { balance: Math.round((u.balance || 0) + amount), updatedAt: Date.now() });
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
  kb.text("⭐ 25 → 50 ₽", "pay:dep50").text("⭐ 50 → 100 ₽", "pay:dep100").row();
  kb.text("⭐ 125 → 250 ₽", "pay:dep250").row();
  kb.text("⭐ 250 → 500 ₽", "pay:dep500").row();
  kb.text("💰 Мой баланс", "me").text("🎟 Промокод", "promo").row();
  return kb;
}
const playKeyboard = () => new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL);

bot.command("start", async ctx => {
  await ctx.reply(
    "💀 <b>SkeletDrop</b>\n\n" +
    "Кейсы с NFT-подарками, звёзды и 5 мини-игр:\n" +
    "PLINKO · MINES · SLOTS · CRASH · UPGRADER\n\n" +
    "⭐ Пополнение — официальной оплатой Telegram.\n" +
    "Курс: <b>1 ⭐ = 2 ₽</b>\n\n" +
    "🎟 Промокод на 100 ₽: <code>STAR DROP</code>\n\n" +
    "Жми «Играть» или выбери пакет 👇",
    { parse_mode: "HTML", reply_markup: shopKeyboard() }
  );
});

bot.command("balance", async ctx => {
  const u = getUser(String(ctx.from.id));
  await ctx.reply(
    `💰 Баланс: <b>${u.balance} ₽</b>\n🎁 Подарков: ${(u.collection || []).length}\n⭐ Пополнено всего: ${u.deposited || 0} ₽`,
    { parse_mode: "HTML", reply_markup: playKeyboard() }
  );
});

bot.command("promo", async ctx => {
  await ctx.reply(
    "🎟 <b>Активные промокоды</b>\n\n<code>STAR DROP</code> — 100 ₽\n\nВводи в игре: <b>Пополнить → Промокод</b>.\nРегистр и пробелы не важны.",
    { parse_mode: "HTML", reply_markup: playKeyboard() }
  );
});

bot.callbackQuery("me", async ctx => {
  const u = getUser(String(ctx.from.id));
  await ctx.answerCallbackQuery({ text: `Баланс: ${u.balance} ₽`, show_alert: true });
});
bot.callbackQuery("promo", async ctx => {
  await ctx.answerCallbackQuery();
  await ctx.reply("🎟 Промокод на 100 ₽: <code>STAR DROP</code>\nВводи в игре в разделе «Пополнить».",
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
      title: `Пополнение ${pkg.rub} ₽`,
      description: `${pkg.stars} ⭐ → ${pkg.rub} ₽ на баланс SkeletDrop`,
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
    patchUser(data.uid, {
      balance: Math.round((u.balance || 0) + pkg.rub),
      deposited: Math.round((u.deposited || 0) + pkg.rub),
      updatedAt: Date.now()
    });
    flush();
    await ctx.reply(
      `✅ <b>Оплата получена!</b>\n\n⭐ ${pkg.stars} → +${pkg.rub} ₽\n💰 Баланс: <b>${u.balance + pkg.rub} ₽</b>\n\nОткрой игру — баланс уже обновлён 🎮`,
      { parse_mode: "HTML", reply_markup: playKeyboard() }
    );
  } catch (e) { console.error("successful_payment:", e.message); }
});

bot.command("code", async ctx => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const amount = parseInt(ctx.match, 10) || 0;
  if (amount <= 0) return ctx.reply("Пример: /code 100");
  const code = "SD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  db().codes[code] = amount;
  flush();
  await ctx.reply(`🎟 <code>${code}</code> → ${amount} ₽`, { parse_mode: "HTML" });
});

bot.command("give", async ctx => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const [uid, amount] = String(ctx.match || "").split(/\s+/);
  if (!uid || !amount) return ctx.reply("Пример: /give 123456789 500");
  const u = addBalance(uid, parseInt(amount, 10) || 0);
  await ctx.reply(`✅ ${uid} → баланс ${u.balance} ₽`);
});

bot.command("stats", async ctx => {
  if (!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const d = db();
  const users = Object.values(d.users);
  const total = users.reduce((a, u) => a + (u.deposited || 0), 0);
  await ctx.reply(`📊 Пользователей: ${users.length}\n⭐ Пополнено: ${total} ₽\n🎟 Активных кодов: ${Object.keys(d.codes).length}`);
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
  if (req.method === "GET") return res.end(JSON.stringify({ ok: true, service: "skeletdrop", users: Object.keys(db().users).length }));
  const send = obj => res.end(JSON.stringify(obj));
  try {
    const body = await readBody(req);
    const url = (req.url || "").split("?")[0];
    if (url === "/api/check") {
      const code = String(body.code || "").toUpperCase().replace(/[\s\-_]+/g, "");
      const d = db();
      const found = Object.keys(d.codes).find(k => k.replace(/[\s\-_]+/g, "") === code);
      if (found) {
        const rub = d.codes[found];
        delete d.codes[found];
        flush();
        return send({ ok: true, rub });
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
        balance: Math.max(0, Math.round(Number(s.balance) || 0)),
        collection: Array.isArray(s.collection) ? s.collection.slice(0, 600) : [],
        lastFree: Number(s.lastFree) || 0,
        subscribed: !!s.subscribed,
        name: String(s.name || "Игрок").slice(0, 24),
        avatar: String(s.avatar || "💀").slice(0, 8),
        updatedAt: incomingTs || Date.now()
      });
      return send({ ok: true, user: u });
    }
    if (url === "/api/invoice") {
      const pkg = PACKAGES[body.pkg];
      if (!pkg) return send({ ok: false, error: "pkg" });
      const link = await bot.api.raw.createInvoiceLink({
        title: `Пополнение ${pkg.rub} ₽`,
        description: `${pkg.stars} ⭐ → ${pkg.rub} ₽ на баланс SkeletDrop`,
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
