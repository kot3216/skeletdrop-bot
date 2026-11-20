"use strict";
const TOKEN       = process.env.BOT_TOKEN   || "9238600427:AAEaRZ1EzFLlP8DuQg4SdyvXeEL2efYi0Oo";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://kot3216.github.io/skeletdrop/";
const ADMIN_ID    = Number(process.env.ADMIN_ID || 6006668545;
const CHANNEL     = process.env.CHANNEL_ID  || "@SkelwtDrop";

const DAY = 864e5;

const { Bot, InlineKeyboard } = require("grammy");
const fs = require("fs"), path = require("path"), http = require("http"), crypto = require("crypto");
const bot = new Bot(TOKEN);

/* ДОНАТ: 1 / 10 / 25 / 50 / 250 звёзд */
const PACKAGES = {
  s1: { stars: 1 },
  s10: { stars: 10 },
  s25: { stars: 25 },
  s50: { stars: 50 },
  s250: { stars: 250 }
};

const DB_FILE = process.env.DB_PATH || path.join(__dirname, "db.json");
let cache = null;
function db() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { cache = { users: {}, codes: {}, payments: [] }; }
  if (!cache.users) cache.users = {};
  if (!cache.codes) cache.codes = {};
  if (!cache.payments) cache.payments = [];
  return cache;
}
function flush() { try { fs.writeFileSync(DB_FILE, JSON.stringify(db())); } catch (e) { console.error("DB:", e.message); } }
function blankUser() { return { balance: 0, collection: [], lastFree: 0, subscribed: false, name: "Игрок", avatar: "⭐", updatedAt: 0, deposited: 0 }; }
function getUser(uid) { const d = db(); if (!d.users[uid]) d.users[uid] = blankUser(); return d.users[uid]; }
function patchUser(uid, p) { const d = db(); d.users[uid] = Object.assign(blankUser(), d.users[uid] || {}, p); flush(); return d.users[uid]; }

function verifyInitData(initData) {
  try {
    const p = new URLSearchParams(initData), hash = p.get("hash");
    if (!hash) return null;
    p.delete("hash");
    const data = [...p.entries()].map(([k, v]) => k + "=" + v).sort().join("\n");
    const secret = crypto.createHmac("sha256", "WebAppData").update(TOKEN).digest();
    const calc = crypto.createHmac("sha256", secret).update(data).digest("hex");
    if (calc !== hash) return null;
    const ad = Number(p.get("auth_date") || 0) * 1000;
    if (ad && Date.now() - ad > DAY * 3) return null;
    return Object.fromEntries(p);
  } catch { return null; }
}

async function checkSub(uid) {
  try {
    const m = await bot.api.raw.getChatMember({ chat_id: CHANNEL, user_id: Number(uid) });
    const ok = ["member", "administrator", "creator"].includes(m.status) || (m.status === "restricted" && m.is_member === true);
    return { ok, status: m.status };
  } catch (e) { return { ok: false, status: "error", error: e.message }; }
}

function fmtLeft(ms) {
  const h = Math.floor(ms / 36e5), m = Math.floor(ms % 36e5 / 6e4), s = Math.floor(ms % 6e4 / 1e3);
  return [h, m, s].map(x => String(x).padStart(2, "0")).join(":");
}

function kb() {
  const k = new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL).row();
  k.text("⭐ 1", "pay:s1").text("⭐ 10", "pay:s10").text("⭐ 25", "pay:s25").row();
  k.text("⭐ 50", "pay:s50").text("⭐ 250", "pay:s250").row();
  k.text("💰 Баланс", "me").text("🎁 Бесплатный кейс", "free").row();
  k.url("📢 Канал", "https://t.me/SkelwtDrop");
  return k;
}
const play = () => new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL);

bot.command("start", c => c.reply(
  "⭐ <b>SkeletDrop</b>\n\nПополнение: <b>1 / 10 / 25 / 50 / 250 ⭐</b>\n\n" +
  "🎁 Бесплатный кейс — раз в 24 часа после открытия.\n" +
  "⛏️ Фарм — добавь @SkeletDropPayBot в имя.\n" +
  "🎟 Промокод: <code>STAR DROP</code>",
  { parse_mode: "HTML", reply_markup: kb() }));

bot.command("free", async c => {
  const u = getUser(String(c.from.id));
  const left = (u.lastFree || 0) + DAY - Date.now();
  if (left > 0) await c.reply(`⏳ Бесплатный кейс будет доступен через <b>${fmtLeft(left)}</b>`, { parse_mode: "HTML", reply_markup: play() });
  else await c.reply("🎁 <b>Бесплатный кейс доступен!</b>\nОткрой игру и забери его.", { parse_mode: "HTML", reply_markup: play() });
});

bot.callbackQuery("free", async c => {
  await c.answerCallbackQuery();
  const u = getUser(String(c.from.id));
  const left = (u.lastFree || 0) + DAY - Date.now();
  if (left > 0) await c.reply(`⏳ Бесплатный кейс будет доступен через <b>${fmtLeft(left)}</b>`, { parse_mode: "HTML", reply_markup: play() });
  else await c.reply("🎁 <b>Бесплатный кейс доступен!</b>\nОткрой игру и забери его.", { parse_mode: "HTML", reply_markup: play() });
});

bot.command("balance", async c => {
  const u = getUser(String(c.from.id));
  await c.reply(`⭐ Баланс: <b>${Math.round(u.balance)}</b>\n🎁 Предметов: ${(u.collection || []).length}`, { parse_mode: "HTML", reply_markup: play() });
});
bot.callbackQuery("me", async c => { const u = getUser(String(c.from.id)); await c.answerCallbackQuery({ text: `⭐ ${Math.round(u.balance)}`, show_alert: true }); });

bot.callbackQuery(/^pay:(\w+)$/, async c => {
  const key = c.match[1], p = PACKAGES[key];
  await c.answerCallbackQuery();
  if (!p) return;
  try {
    await bot.api.raw.sendInvoice({
      chat_id: c.chat.id,
      title: `Пополнение ${p.stars} ⭐`,
      description: `${p.stars} ⭐ на баланс SkeletDrop`,
      payload: JSON.stringify({ uid: String(c.from.id), pkg: key, stars: p.stars }),
      currency: "XTR",
      prices: [{ label: "Пополнение", amount: p.stars }]
    });
  } catch (e) { console.error("invoice:", e.message); c.reply("Не удалось создать счёт."); }
});

bot.on("pre_checkout_query", async c => { try { await c.answerPreCheckoutQuery(true); } catch (e) {} });

bot.on("message:successful_payment", async c => {
  try {
    const sp = c.message.successful_payment;
    const d = JSON.parse(sp.invoice_payload);
    const p = PACKAGES[d.pkg] || (d.stars ? { stars: d.stars } : null);
    if (!p) return;
    const dd = db(), charge = sp.telegram_payment_charge_id;
    if (dd.payments.includes(charge)) return;
    dd.payments.push(charge);
    if (dd.payments.length > 5000) dd.payments = dd.payments.slice(-5000);
    const u = getUser(String(d.uid));
    patchUser(d.uid, {
      balance: Math.round((u.balance || 0) + p.stars),
      deposited: Math.round((u.deposited || 0) + p.stars),
      updatedAt: Date.now()
    });
    flush();
    await c.reply(`✅ +${p.stars} ⭐\nБаланс: ${Math.round(u.balance + p.stars)} ⭐`, { reply_markup: play() });
  } catch (e) { console.error("pay:", e.message); }
});

bot.command("code", async c => {
  if (!ADMIN_ID || c.from.id !== ADMIN_ID) return;
  const a = parseFloat(String(c.match || "").replace(",", ".")) || 0;
  if (a <= 0) return c.reply("Пример: /code 50");
  const code = "SD-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  db().codes[code] = a; flush();
  c.reply(`🎟 ${code} → ${a} ⭐`);
});

bot.command("diag", async c => {
  if (!ADMIN_ID || c.from.id !== ADMIN_ID) return;
  const s = await checkSub(String(c.from.id));
  c.reply(`Канал: ${CHANNEL}\nПодписка: ${s.ok ? "✅" : "❌"} (${s.status})\n${s.error || ""}\n\nБот должен быть АДМИНОМ канала.`);
});

bot.catch(e => console.error("Bot:", e.error || e.message));

function readBody(req) {
  return new Promise(r => {
    let s = "";
    req.on("data", c => { s += c; if (s.length > 1e6) req.destroy(); });
    req.on("end", () => { try { r(JSON.parse(s || "{}")); } catch { r({}); } });
    req.on("error", () => r({}));
  });
}

http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method === "GET") return res.end(JSON.stringify({ ok: true, service: "skeletdrop", packs: Object.keys(PACKAGES) }));
  const send = o => res.end(JSON.stringify(o));
  try {
    const b = await readBody(req), url = (req.url || "").split("?")[0];

    if (url === "/api/check") {
      const code = String(b.code || "").toUpperCase().replace(/[\s\-_]+/g, ""), d = db();
      const f = Object.keys(d.codes).find(k => k.replace(/[\s\-_]+/g, "") === code);
      if (f) { const v = d.codes[f]; delete d.codes[f]; flush(); return send({ ok: true, stars: v }); }
      return send({ ok: false });
    }

    const v = verifyInitData(b.initData || "");
    if (!v || !v.user) return send({ ok: false, error: "auth" });
    const uid = String(JSON.parse(v.user).id);

    if (url === "/api/verify") {
      const s = await checkSub(uid);
      patchUser(uid, { subscribed: !!s.ok });
      return send({ ok: true, sub: !!s.ok, status: s.status || "", err: s.error || "" });
    }

    if (url === "/api/load") return send({ ok: true, user: getUser(uid) });

    if (url === "/api/save") {
      const s = b.state || {}, cur = getUser(uid), ts = Number(s.updatedAt) || 0;
      if (ts < (cur.updatedAt || 0)) return send({ ok: true, user: cur });
      return send({ ok: true, user: patchUser(uid, {
        balance: Math.max(0, Math.round(Number(s.balance) || 0)),
        collection: Array.isArray(s.collection) ? s.collection.slice(0, 600) : [],
        lastFree: Number(s.lastFree) || 0,
        subscribed: !!cur.subscribed,
        name: String(s.name || "Игрок").slice(0, 24),
        avatar: "⭐",
        updatedAt: ts || Date.now()
      }) });
    }

    if (url === "/api/invoice") {
      const p = PACKAGES[b.pkg] || (b.stars ? { stars: Math.max(1, Math.min(2500, Math.round(b.stars))) } : null);
      if (!p) return send({ ok: false, error: "pkg" });
      const link = await bot.api.raw.createInvoiceLink({
        title: `Пополнение ${p.stars} ⭐`,
        description: `${p.stars} ⭐ на баланс SkeletDrop`,
        payload: JSON.stringify({ uid, pkg: b.pkg || ("custom" + p.stars), stars: p.stars }),
        currency: "XTR",
        prices: [{ label: "Пополнение", amount: p.stars }]
      });
      return send({ ok: true, link });
    }

    return send({ ok: false, error: "route" });
  } catch (e) { console.error("API", req.url, e.message); return send({ ok: false, error: e.message }); }
}).listen(process.env.PORT || 8080, () => console.log("✅ API запущен"));

bot.start({ onStart: i => console.log("✅ Бот:", i.username) }).catch(e => { console.error(e.message); process.exit(1); });
process.on("SIGTERM", () => { flush(); process.exit(0); });
process.on("SIGINT", () => { flush(); process.exit(0); });
