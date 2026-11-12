const TOKEN = "9238600427:AAEaRZ1EzFLlP8DuQg4SdyvXeEL2efYi0Oo";
const WEB_APP_URL = "https://kot3216.github.io/skeletdrop/";
const ADMIN_ID = 6006668545; // сюда свой Telegram ID (узнай у @userinfobot), 0 = выключено

const { Bot, InlineKeyboard } = require("grammy");
const fs = require("fs");
const http = require("http");
const crypto = require("crypto");

const bot = new Bot(TOKEN);

const PACKAGES = {
  dep50:  { stars: 25,  rub: 50 },
  dep100: { stars: 50,  rub: 100 },
  dep250: { stars: 125, rub: 250 },
  dep500: { stars: 250, rub: 500 }
};

/* ---------- простая база ---------- */
const DB = "db.json";
function load(){ try{ return JSON.parse(fs.readFileSync(DB,"utf8")); }catch{ return { users:{}, codes:{} }; } }
function store(d){ try{ fs.writeFileSync(DB, JSON.stringify(d)); }catch(e){ console.error("DB write:", e.message); } }
function getUser(uid){
  const d = load();
  if(!d.users[uid]) d.users[uid] = { balance:0, collection:[], lastFree:0, subscribed:false, name:"Игрок", avatar:"💀" };
  return d.users[uid];
}
function setUser(uid, patch){
  const d = load();
  d.users[uid] = Object.assign(getUser(uid), patch);
  store(d);
  return d.users[uid];
}
function credit(uid, rub){
  const u = getUser(uid);
  return setUser(uid, { balance: Math.round((u.balance||0) + rub) });
}

/* ---------- проверка initData из Mini App ---------- */
function verifyInitData(initData){
  try{
    const p = new URLSearchParams(initData);
    const hash = p.get("hash");
    if(!hash) return null;
    p.delete("hash");
    const data = [...p.entries()].map(([k,v]) => k+"="+v).sort().join("\n");
    const secret = crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();
    const calc = crypto.createHmac("sha256", secret).update(data).digest("hex");
    if(calc !== hash) return null;
    return Object.fromEntries(p);
  }catch(e){ return null; }
}

/* ---------- команды бота ---------- */
bot.command("start", async ctx => {
  const kb = new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL).row();
  for(const [k,v] of Object.entries(PACKAGES)){
    kb.text(`⭐ ${v.stars} → ${v.rub} ₽`, "pay:"+k).row();
  }
  await ctx.reply(
    "💀 SkeletDrop\n\nКейсы с NFT-подарками и звёздами.\nПополнение — официальной оплатой звёздами Telegram.\n\nЖми «Играть» или выбери пакет 👇",
    { reply_markup: kb }
  );
});

bot.command("balance", async ctx => {
  const u = getUser(String(ctx.from.id));
  await ctx.reply(`💰 Твой баланс: ${u.balance} ₽`);
});

bot.callbackQuery(/^pay:(\w+)$/, async ctx => {
  const key = ctx.match[1];
  const pkg = PACKAGES[key];
  await ctx.answerCallbackQuery();
  if(!pkg) return;
  try{
    await bot.api.raw.sendInvoice({
      chat_id: ctx.chat.id,
      title: `Пополнение ${pkg.rub} ₽`,
      description: `${pkg.stars} ⭐ → ${pkg.rub} ₽ на баланс SkeletDrop`,
      payload: JSON.stringify({ uid: String(ctx.from.id), pkg: key }),
      currency: "XTR",
      prices: [{ label: "Пополнение", amount: pkg.stars }]
    });
  }catch(e){
    console.error("sendInvoice:", e.message);
    await ctx.reply("Не удалось создать счёт, попробуй ещё раз.");
  }
});

bot.on("pre_checkout_query", async ctx => {
  try{ await ctx.answerPreCheckoutQuery(true); }
  catch(e){ console.error("pre_checkout:", e.message); }
});

bot.on("message:successful_payment", async ctx => {
  try{
    const sp = ctx.message.successful_payment;
    const data = JSON.parse(sp.invoice_payload);
    const pkg = PACKAGES[data.pkg];
    if(!pkg) return;
    const u = credit(String(data.uid), pkg.rub);
    await ctx.reply(
      `✅ Оплата получена!\n\n⭐ ${pkg.stars} звёзд → +${pkg.rub} ₽\n💰 Баланс: ${u.balance} ₽\n\nОткрой игру — баланс уже обновлён 🎮`,
      { reply_markup: new InlineKeyboard().webApp("🎮 Играть", WEB_APP_URL) }
    );
  }catch(e){ console.error("successful_payment:", e.message); }
});

/* админ: выдать промокод /code 100 */
bot.command("code", async ctx => {
  if(!ADMIN_ID || ctx.from.id !== ADMIN_ID) return;
  const rub = parseInt(ctx.match) || 0;
  if(rub <= 0) return ctx.reply("Пример: /code 100");
  const code = "SD-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const d = load(); d.codes[code] = rub; store(d);
  await ctx.reply(`🎟 ${code} → ${rub} ₽`);
});

/* ---------- HTTP API для игры ---------- */
function readBody(req){
  return new Promise(res => {
    let b = "";
    req.on("data", c => b += c);
    req.on("end", () => { try{ res(JSON.parse(b||"{}")); }catch{ res({}); } });
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Content-Type", "application/json");
  if(req.method === "OPTIONS"){ res.statusCode = 204; return res.end(); }
  if(req.method === "GET"){ return res.end(JSON.stringify({ ok:true, service:"skeletdrop" })); }

  try{
    const body = await readBody(req);

    /* промокод — без авторизации */
    if(req.url === "/api/check"){
      const code = String(body.code||"").toUpperCase();
      const d = load();
      if(d.codes[code]){
        const rub = d.codes[code];
        delete d.codes[code]; store(d);
        return res.end(JSON.stringify({ ok:true, rub }));
      }
      return res.end(JSON.stringify({ ok:false }));
    }

    const v = verifyInitData(body.initData || "");
    if(!v || !v.user) return res.end(JSON.stringify({ ok:false, error:"auth" }));
    const uid = String(JSON.parse(v.user).id);

    if(req.url === "/api/load"){
      return res.end(JSON.stringify({ ok:true, user:getUser(uid) }));
    }

    if(req.url === "/api/save"){
      const s = body.state || {};
      const u = setUser(uid, {
        balance: Math.max(0, Math.round(Number(s.balance)||0)),
        collection: Array.isArray(s.collection) ? s.collection.slice(0,500) : [],
        lastFree: Number(s.lastFree)||0,
        subscribed: !!s.subscribed,
        name: String(s.name||"Игрок").slice(0,16),
        avatar: String(s.avatar||"💀").slice(0,8)
      });
      return res.end(JSON.stringify({ ok:true, user:u }));
    }

    if(req.url === "/api/invoice"){
      const pkg = PACKAGES[body.pkg];
      if(!pkg) return res.end(JSON.stringify({ ok:false, error:"pkg" }));
      const link = await bot.api.raw.createInvoiceLink({
        title: `Пополнение ${pkg.rub} ₽`,
        description: `${pkg.stars} ⭐ → ${pkg.rub} ₽ на баланс SkeletDrop`,
        payload: JSON.stringify({ uid, pkg: body.pkg }),
        currency: "XTR",
        prices: [{ label: "Пополнение", amount: pkg.stars }]
      });
      return res.end(JSON.stringify({ ok:true, link }));
    }
  }catch(e){
    console.error("API", req.url, e.message);
    return res.end(JSON.stringify({ ok:false, error:e.message }));
  }
  res.end(JSON.stringify({ ok:false }));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log("✅ HTTP сервер на порту", PORT));

bot.start({
  onStart: info => console.log("✅ Бот запущен:", info.username)
}).catch(e => { console.error("❌ Бот не стартовал:", e.message); process.exit(1); });
