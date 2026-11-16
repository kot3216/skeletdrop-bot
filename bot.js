"use strict";
const TOKEN       = process.env.BOT_TOKEN   || "9238600427:AAEaRZ1EzFLlP8DuQg4SdyvXeEL2efYi0Oo";
const WEB_APP_URL = process.env.WEB_APP_URL || "https://kot3216.github.io/skeletdrop/";
const ADMIN_ID    = Number(process.env.ADMIN_ID || 6006668545;
const CHANNEL     = process.env.CHANNEL_ID  || "@SkelwtDrop";

const { Bot, InlineKeyboard } = require("grammy");
const fs = require("fs"), path = require("path"), http = require("http"), crypto = require("crypto");
const bot = new Bot(TOKEN);

const PACKAGES = {
  dep50:{stars:25,gram:.30}, dep100:{stars:50,gram:.60},
  dep250:{stars:125,gram:1.50}, dep500:{stars:250,gram:3.00}
};

const DB_FILE = process.env.DB_PATH || path.join(__dirname,"db.json");
let cache=null;
function db(){ if(cache) return cache;
  try{ cache=JSON.parse(fs.readFileSync(DB_FILE,"utf8")); }catch{ cache={users:{},codes:{},payments:[]}; }
  if(!cache.users)cache.users={}; if(!cache.codes)cache.codes={}; if(!cache.payments)cache.payments=[];
  return cache; }
function flush(){ try{ fs.writeFileSync(DB_FILE,JSON.stringify(db())); }catch(e){ console.error("DB:",e.message); } }
function blankUser(){ return {balance:0,collection:[],lastFree:0,subscribed:false,boosted:false,name:"Игрок",avatar:"💎",updatedAt:0,deposited:0}; }
function getUser(uid){ const d=db(); if(!d.users[uid]) d.users[uid]=blankUser(); return d.users[uid]; }
function patchUser(uid,p){ const d=db(); d.users[uid]=Object.assign(blankUser(),d.users[uid]||{},p); flush(); return d.users[uid]; }

function verifyInitData(initData){
  try{
    const p=new URLSearchParams(initData), hash=p.get("hash");
    if(!hash) return null;
    p.delete("hash");
    const data=[...p.entries()].map(([k,v])=>k+"="+v).sort().join("\n");
    const secret=crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();
    const calc=crypto.createHmac("sha256",secret).update(data).digest("hex");
    if(calc!==hash) return null;
    const ad=Number(p.get("auth_date")||0)*1000;
    if(ad && Date.now()-ad>864e5*3) return null;
    return Object.fromEntries(p);
  }catch{ return null; }
}

/* ═════ ПРОВЕРКА ПОДПИСКИ И БУСТА ═════ */
async function checkSub(uid){
  try{
    const m = await bot.api.raw.getChatMember({ chat_id: CHANNEL, user_id: Number(uid) });
    const ok = ["member","administrator","creator"].includes(m.status) || (m.status==="restricted" && m.is_member===true);
    return { ok, status:m.status };
  }catch(e){ return { ok:false, status:"error", error:e.message }; }
}
async function checkBoost(uid){
  try{
    const r = await bot.api.raw.getUserChatBoosts({ chat_id: CHANNEL, user_id: Number(uid) });
    const n = (r && Array.isArray(r.user_boosts)) ? r.user_boosts.length : 0;
    return { ok:n>0, count:n };
  }catch(e){ return { ok:false, count:0, error:e.message }; }
}

/* ═════ БОТ ═════ */
function shopKeyboard(){
  const kb=new InlineKeyboard().webApp("🎮 Играть",WEB_APP_URL).row();
  kb.text("⭐ 25 → 0.30 💎","pay:dep50").text("⭐ 50 → 0.60 💎","pay:dep100").row();
  kb.text("⭐ 125 → 1.50 💎","pay:dep250").row();
  kb.text("⭐ 250 → 3.00 💎","pay:dep500").row();
  kb.text("💰 Баланс","me").text("🎟 Промокод","promo").row();
  kb.url("📢 Канал","https://t.me/SkelwtDrop").url("🚀 Буст","https://t.me/boost/SkelwtDrop").row();
  return kb;
}
const playKb=()=>new InlineKeyboard().webApp("🎮 Играть",WEB_APP_URL);

bot.command("start",async ctx=>{
  await ctx.reply(
    "💎 <b>GRAM</b>\n\nКейсы с NFT-подарками и 6 игр.\nКурс: <b>1 ⭐ = 0.012 GRAM</b>\n\n"+
    "🎁 Бесплатный кейс: подпишись на канал + сделай буст.\n🎟 Промокод: <code>STAR DROP</code>",
    {parse_mode:"HTML",reply_markup:shopKeyboard()});
});
bot.command("balance",async ctx=>{
  const u=getUser(String(ctx.from.id));
  await ctx.reply(`💎 Баланс: <b>${u.balance.toFixed(2)} GRAM</b>\n🎁 Предметов: ${(u.collection||[]).length}`,{parse_mode:"HTML",reply_markup:playKb()});
});
bot.command("promo",async ctx=>{ await ctx.reply("🎟 <code>STAR DROP</code> — 0.60 GRAM",{parse_mode:"HTML",reply_markup:playKb()}); });
bot.callbackQuery("me",async ctx=>{ const u=getUser(String(ctx.from.id)); await ctx.answerCallbackQuery({text:`💎 ${u.balance.toFixed(2)} GRAM`,show_alert:true}); });
bot.callbackQuery("promo",async ctx=>{ await ctx.answerCallbackQuery(); await ctx.reply("🎟 STAR DROP — 0.60 GRAM",{reply_markup:playKb()}); });

bot.callbackQuery(/^pay:(\w+)$/,async ctx=>{
  const key=ctx.match[1], pkg=PACKAGES[key];
  await ctx.answerCallbackQuery(); if(!pkg) return;
  try{
    await bot.api.raw.sendInvoice({chat_id:ctx.chat.id,title:`Пополнение ${pkg.gram.toFixed(2)} GRAM`,
      description:`${pkg.stars} ⭐ → ${pkg.gram.toFixed(2)} GRAM`,
      payload:JSON.stringify({uid:String(ctx.from.id),pkg:key}),currency:"XTR",
      prices:[{label:"Пополнение",amount:pkg.stars}]});
  }catch(e){ console.error("invoice:",e.message); await ctx.reply("Не удалось создать счёт."); }
});
bot.on("pre_checkout_query",async ctx=>{ try{ await ctx.answerPreCheckoutQuery(true); }catch(e){} });
bot.on("message:successful_payment",async ctx=>{
  try{
    const sp=ctx.message.successful_payment, data=JSON.parse(sp.invoice_payload), pkg=PACKAGES[data.pkg];
    if(!pkg) return;
    const d=db(), charge=sp.telegram_payment_charge_id;
    if(d.payments.includes(charge)) return;
    d.payments.push(charge); if(d.payments.length>5000) d.payments=d.payments.slice(-5000);
    const u=getUser(String(data.uid));
    patchUser(data.uid,{balance:Math.round(((u.balance||0)+pkg.gram)*1000)/1000,deposited:Math.round(((u.deposited||0)+pkg.gram)*1000)/1000,updatedAt:Date.now()});
    flush();
    await ctx.reply(`✅ +${pkg.gram.toFixed(2)} GRAM\n💎 Баланс: ${(u.balance+pkg.gram).toFixed(2)}`,{reply_markup:playKb()});
  }catch(e){ console.error("payment:",e.message); }
});

bot.command("code",async ctx=>{
  if(!ADMIN_ID||ctx.from.id!==ADMIN_ID) return;
  const amt=parseFloat(String(ctx.match||"").replace(",","."))||0;
  if(amt<=0) return ctx.reply("Пример: /code 0.6");
  const code="SD-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  db().codes[code]=amt; flush();
  await ctx.reply(`🎟 ${code} → ${amt} GRAM`);
});
bot.command("diag",async ctx=>{
  if(!ADMIN_ID||ctx.from.id!==ADMIN_ID) return;
  const uid=String(ctx.from.id);
  const s=await checkSub(uid), b=await checkBoost(uid);
  await ctx.reply(`🔎 Диагностика канала ${CHANNEL}\n\nПодписка: ${s.ok?"✅":"❌"} (${s.status})\n${s.error?"err: "+s.error+"\n":""}\nБуст: ${b.ok?"✅":"❌"} (${b.count})\n${b.error?"err: "+b.error:""}\n\n⚠️ Бот должен быть АДМИНОМ канала.`);
});
bot.catch(e=>console.error("Bot:",e.error||e.message));

/* ═════ HTTP API ═════ */
function readBody(req){ return new Promise(res=>{ let r=""; req.on("data",c=>{r+=c; if(r.length>1e6)req.destroy();}); req.on("end",()=>{try{res(JSON.parse(r||"{}"))}catch{res({})}}); req.on("error",()=>res({})); }); }

const server=http.createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST, GET, OPTIONS");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end();}
  if(req.method==="GET") return res.end(JSON.stringify({ok:true,service:"gram",channel:CHANNEL}));
  const send=o=>res.end(JSON.stringify(o));
  try{
    const body=await readBody(req), url=(req.url||"").split("?")[0];

    if(url==="/api/check"){
      const code=String(body.code||"").toUpperCase().replace(/[\s\-_]+/g,""), d=db();
      const found=Object.keys(d.codes).find(k=>k.replace(/[\s\-_]+/g,"")===code);
      if(found){ const g=d.codes[found]; delete d.codes[found]; flush(); return send({ok:true,gram:g}); }
      return send({ok:false});
    }

    const v=verifyInitData(body.initData||"");
    if(!v||!v.user) return send({ok:false,error:"auth"});
    const uid=String(JSON.parse(v.user).id);

    /* НОВОЕ: реальная проверка */
    if(url==="/api/verify"){
      const [s,b]=await Promise.all([checkSub(uid),checkBoost(uid)]);
      patchUser(uid,{subscribed:!!s.ok,boosted:!!b.ok});
      return send({ok:true,sub:!!s.ok,boost:!!b.ok,boosts:b.count||0,status:s.status||"",err:s.error||b.error||""});
    }

    if(url==="/api/load") return send({ok:true,user:getUser(uid)});

    if(url==="/api/save"){
      const s=body.state||{}, cur=getUser(uid), ts=Number(s.updatedAt)||0;
      if(ts<(cur.updatedAt||0)) return send({ok:true,user:cur});
      const u=patchUser(uid,{
        balance:Math.max(0,Math.round((Number(s.balance)||0)*1000)/1000),
        collection:Array.isArray(s.collection)?s.collection.slice(0,600):[],
        lastFree:Number(s.lastFree)||0,
        subscribed:!!cur.subscribed, boosted:!!cur.boosted,
        name:String(s.name||"Игрок").slice(0,24), avatar:"💎",
        updatedAt:ts||Date.now()
      });
      return send({ok:true,user:u});
    }

    if(url==="/api/invoice"){
      const pkg=PACKAGES[body.pkg];
      if(!pkg) return send({ok:false,error:"pkg"});
      const link=await bot.api.raw.createInvoiceLink({
        title:`Пополнение ${pkg.gram.toFixed(2)} GRAM`,
        description:`${pkg.stars} ⭐ → ${pkg.gram.toFixed(2)} GRAM`,
        payload:JSON.stringify({uid,pkg:body.pkg}),currency:"XTR",
        prices:[{label:"Пополнение",amount:pkg.stars}]});
      return send({ok:true,link});
    }
    return send({ok:false,error:"route"});
  }catch(e){ console.error("API",req.url,e.message); return send({ok:false,error:e.message}); }
});

const PORT=process.env.PORT||8080;
server.listen(PORT,()=>console.log("✅ API порт",PORT));
bot.start({onStart:i=>console.log("✅ Бот:",i.username)}).catch(e=>{console.error("❌",e.message);process.exit(1)});
process.on("SIGTERM",()=>{flush();server.close();process.exit(0)});
process.on("SIGINT",()=>{flush();server.close();process.exit(0)});
