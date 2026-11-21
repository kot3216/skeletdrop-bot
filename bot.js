"use strict";

/* ⚠️ После запуска отзови токен в BotFather и перенеси в Render → Environment → BOT_TOKEN */
const TOKEN   = process.env.BOT_TOKEN || "9123481275:AAHuYG3Dfat3h5B0O89wg_rhiYtaq96Rnvg";
const ADMIN   = Number(process.env.ADMIN_ID || 6006668545);
const WEB     = process.env.WEB_APP_URL || "https://kot3216.github.io/skeletdrop/";
const CHANNEL = process.env.CHANNEL_ID || "@SkelwtDrop";
const BOT_TAG = "@SkeletDropBot";
const DAY = 864e5;

const { Bot, InlineKeyboard } = require("grammy");
const fs = require("fs"), path = require("path"), http = require("http"), crypto = require("crypto");

const PACKS = { dep50:{stars:25}, dep100:{stars:50}, dep250:{stars:125}, dep500:{stars:250} };

const FILE = process.env.DB_PATH || path.join(__dirname, "db.json");
let cache = null;
function db(){ if(cache) return cache;
  try{ cache = JSON.parse(fs.readFileSync(FILE,"utf8")); }catch(e){ cache={users:{},codes:{},paid:[]}; }
  if(!cache.users)cache.users={}; if(!cache.codes)cache.codes={}; if(!cache.paid)cache.paid=[];
  return cache; }
function flush(){ try{ fs.writeFileSync(FILE,JSON.stringify(db())); }catch(e){ console.error("db:",e.message); } }
function blank(){ return {balance:0,collection:[],lastFree:0,subscribed:false,name:"Игрок",updatedAt:0}; }
function user(id){ const d=db(); if(!d.users[id]) d.users[id]=blank(); return d.users[id]; }
function patch(id,p){ const d=db(); d.users[id]=Object.assign(blank(),d.users[id]||{},p); flush(); return d.users[id]; }

function verify(initData){
  try{
    if(!initData) return null;
    const p=new URLSearchParams(initData), h=p.get("hash"); if(!h) return null; p.delete("hash");
    const data=[...p.entries()].map(([k,v])=>k+"="+v).sort().join("\n");
    const sec=crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();
    if(crypto.createHmac("sha256",sec).update(data).digest("hex")!==h) return null;
    return Object.fromEntries(p);
  }catch(e){ return null; }
}
function uidOf(v){ try{ return String(JSON.parse(v.user).id) }catch(e){ return null } }
function fmt(ms){ const h=Math.floor(ms/36e5),m=Math.floor(ms%36e5/6e4),s=Math.floor(ms%6e4/1e3);
  return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":"); }
function resolveStars(b){
  if(b && b.pkg && PACKS[b.pkg]) return PACKS[b.pkg].stars;
  const n=Math.round(Number(b && b.stars)||0);
  if(n>=1 && n<=2500) return n;
  return 0;
}

const bot = new Bot(TOKEN);
const hasWeb = /^https:\/\/.+/.test(WEB);

const kb=()=>{ const k=new InlineKeyboard();
  if(hasWeb) k.webApp("🎮 Играть",WEB).row();
  k.text("⭐ 25","pay:dep50").text("⭐ 50","pay:dep100").row()
   .text("⭐ 125","pay:dep250").text("⭐ 250","pay:dep500").row()
   .text("💰 Баланс","me").text("🎁 Кейс","free").row()
   .url("📢 Канал","https://t.me/SkelwtDrop");
  return k; };
const play=()=>{ const k=new InlineKeyboard(); if(hasWeb) k.webApp("🎮 Играть",WEB); return k; };

bot.command("start",c=>c.reply(
  "⭐ <b>SkeletDrop</b>\n\n"+
  "Пополнение: 25 / 50 / 125 / 250 ⭐\n"+
  "🎁 Бесплатный кейс — за подписку на @SkelwtDrop, раз в 24 часа\n"+
  "⛏️ Фарм — добавь "+BOT_TAG+" в имя профиля\n"+
  "💰 Продажа подарков — по полной цене",
  {parse_mode:"HTML",reply_markup:kb()}));

bot.command("id",c=>c.reply("Твой ID: <code>"+c.from.id+"</code>",{parse_mode:"HTML"}));
bot.command("balance",c=>c.reply("⭐ Баланс: <b>"+Math.round(user(String(c.from.id)).balance)+"</b>",{parse_mode:"HTML",reply_markup:play()}));

function freeText(u){ const l=(u.lastFree||0)+DAY-Date.now();
  return l>0 ? "⏳ Бесплатный кейс будет доступен через <b>"+fmt(l)+"</b>"
             : "🎁 <b>Бесплатный кейс доступен!</b>\nНужна подписка на @SkelwtDrop"; }
bot.command("free",c=>c.reply(freeText(user(String(c.from.id))),{parse_mode:"HTML",reply_markup:play()}));
bot.callbackQuery("free",async c=>{ await c.answerCallbackQuery();
  c.reply(freeText(user(String(c.from.id))),{parse_mode:"HTML",reply_markup:play()}); });
bot.callbackQuery("me",c=>c.answerCallbackQuery({text:"⭐ "+Math.round(user(String(c.from.id)).balance),show_alert:true}));

bot.callbackQuery(/^pay:(\w+)$/,async c=>{
  const p=PACKS[c.match[1]]; await c.answerCallbackQuery(); if(!p) return;
  try{
    await bot.api.raw.sendInvoice({chat_id:c.chat.id,
      title:"Пополнение "+p.stars+" ⭐",
      description:p.stars+" ⭐ на баланс SkeletDrop",
      payload:JSON.stringify({uid:String(c.from.id),stars:p.stars}),
      currency:"XTR",prices:[{label:"Пополнение",amount:p.stars}]});
  }catch(e){ console.error("sendInvoice:",e.message); c.reply("Ошибка счёта: "+e.message); }
});

bot.on("pre_checkout_query",async c=>{
  try{ await c.answerPreCheckoutQuery(true); }catch(e){ console.error("pre_checkout:",e.message); }
});

bot.on("message:successful_payment",async c=>{
  try{
    const sp=c.message.successful_payment;
    let d={}; try{ d=JSON.parse(sp.invoice_payload) }catch(e){}
    const stars=Math.round(Number(d.stars)||Number(sp.total_amount)||0);
    const uid=String(d.uid||c.from.id);
    if(stars<1) return;
    const dd=db();
    if(dd.paid.includes(sp.telegram_payment_charge_id)) return;
    dd.paid.push(sp.telegram_payment_charge_id);
    if(dd.paid.length>5000) dd.paid=dd.paid.slice(-5000);
    const u=user(uid);
    patch(uid,{balance:Math.round((u.balance||0)+stars),updatedAt:Date.now()});
    console.log("💰 +"+stars+" ⭐ → "+uid);
    c.reply("✅ +"+stars+" ⭐\nБаланс: <b>"+Math.round(u.balance+stars)+" ⭐</b>",{parse_mode:"HTML",reply_markup:play()});
  }catch(e){ console.error("payment:",e.message); }
});

bot.command("code",c=>{
  if(c.from.id!==ADMIN) return;
  const a=parseFloat(String(c.match||"").replace(",","."))||0;
  if(a<=0) return c.reply("Формат: /code 50");
  const code="SD-"+crypto.randomBytes(4).toString("hex").toUpperCase();
  db().codes[code]=a; flush();
  c.reply("🎟 <code>"+code+"</code> → "+a+" ⭐",{parse_mode:"HTML"});
});

bot.command("diag",async c=>{
  if(c.from.id!==ADMIN) return;
  const u=user(String(c.from.id));
  let r="🩺 <b>Диагностика</b>\n\nБот: "+BOT_TAG+"\nТокен: …"+TOKEN.slice(-6)+"\nИгра: "+WEB+"\nКанал: "+CHANNEL+"\n\n";
  r+="lastFree: "+(u.lastFree||0)+"\n";
  const l=(u.lastFree||0)+DAY-Date.now();
  r+="Кейс: "+(l>0?"через "+fmt(l):"доступен")+"\n\n";
  try{ const me=await bot.api.getMe(); r+="✅ Бот: @"+me.username+"\n"; }
  catch(e){ r+="❌ Токен: "+e.message+"\n"; }
  try{ const m=await bot.api.raw.getChatMember({chat_id:CHANNEL,user_id:c.from.id});
       r+="✅ Канал виден, статус: "+m.status+"\n"; }
  catch(e){ r+="❌ Канал: "+e.message+"\n→ Добавь бота: t.me/SkeletDropBot?startchannel\n"; }
  c.reply(r,{parse_mode:"HTML"});
});

bot.catch(e=>console.error("bot error:",e.message));

(async()=>{
  try{
    const me=await bot.api.getMe();
    console.log("✅ Токен рабочий:",me.username);
    await bot.api.deleteWebhook({drop_pending_updates:false});
    bot.start({onStart:i=>console.log("🚀 Бот запущен:",i.username)});
  }catch(e){ console.error("❌ НЕ ЗАПУСТИЛСЯ:",e.message); }
})();

function body(req){ return new Promise(r=>{ let s=""; req.on("data",c=>{s+=c; if(s.length>1e6)req.destroy()});
  req.on("end",()=>{try{r(JSON.parse(s||"{}"))}catch(e){r({})}}); req.on("error",()=>r({})); }); }

http.createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST, GET, OPTIONS");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end()}
  const send=o=>res.end(JSON.stringify(o));

  if(req.method==="GET") return send({ok:true,service:"skeletdrop",v:33,
    bot:BOT_TAG,token:"…"+TOKEN.slice(-6),web:WEB,channel:CHANNEL,packs:Object.keys(PACKS)});

  try{
    const b=await body(req), url=(req.url||"").split("?")[0];

    if(url==="/api/invoice"){
      const stars=resolveStars(b);
      if(!stars) return send({ok:false,error:"pkg"});
      const v=verify(b.initData||""), uid=v?uidOf(v):null;
      if(!uid) return send({ok:false,error:"auth"});
      try{
        const link=await bot.api.raw.createInvoiceLink({
          title:"Пополнение "+stars+" ⭐",
          description:stars+" ⭐ на баланс SkeletDrop",
          payload:JSON.stringify({uid:uid,stars:stars}),
          currency:"XTR",prices:[{label:"Пополнение",amount:stars}]});
        console.log("🧾 счёт "+stars+" ⭐ → "+uid);
        return send({ok:true,link:link,stars:stars});
      }catch(e){ return send({ok:false,error:e.message}) }
    }

    if(url==="/api/check"){
      const code=String(b.code||"").toUpperCase().replace(/[\s\-_]+/g,""),d=db();
      const k=Object.keys(d.codes).find(x=>x.replace(/[\s\-_]+/g,"")===code);
      if(k){ const v=d.codes[k]; delete d.codes[k]; flush(); return send({ok:true,stars:v}) }
      return send({ok:false});
    }

    const v=verify(b.initData||""), uid=v?uidOf(v):null;
    if(!uid) return send({ok:false,error:"auth"});

    if(url==="/api/load") return send({ok:true,user:user(uid)});

    if(url==="/api/verify"){
      try{
        const m=await bot.api.raw.getChatMember({chat_id:CHANNEL,user_id:Number(uid)});
        const ok=["member","administrator","creator"].includes(m.status)||(m.status==="restricted"&&m.is_member===true);
        const cur=user(uid);
        patch(uid,{subscribed:ok,updatedAt:cur.updatedAt||0});
        return send({ok:true,sub:ok,status:m.status});
      }catch(e){ return send({ok:false,sub:false,err:e.message}) }
    }

    /* СОХРАНЕНИЕ: таймер кейса НИКОГДА не уменьшается */
    if(url==="/api/save"){
      const s=b.state||{}, cur=user(uid);
      const ts=Number(s.updatedAt)||0;
      const free=Math.max(Number(cur.lastFree)||0, Number(s.lastFree)||0);
      const p={ lastFree:free, subscribed:!!cur.subscribed, updatedAt:Math.max(ts,Number(cur.updatedAt)||0,Date.now()) };
      if(ts>=(Number(cur.updatedAt)||0)){
        p.balance=Math.max(0,Math.round(Number(s.balance)||0));
        p.collection=Array.isArray(s.collection)?s.collection.slice(0,600):[];
        p.name=String(s.name||cur.name||"Игрок").slice(0,24);
      }
      return send({ok:true,user:patch(uid,p)});
    }

    return send({ok:false,error:"route"});
  }catch(e){ console.error("api:",e.message); return send({ok:false,error:e.message}) }
}).listen(process.env.PORT||8080,()=>console.log("✅ API v33"));

process.on("SIGTERM",()=>{flush();process.exit(0)});
process.on("SIGINT",()=>{flush();process.exit(0)});
