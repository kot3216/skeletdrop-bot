"use strict";
const TOKEN = process.env.BOT_TOKEN || "9123481275:AAHuYG3Dfat3h5B0O89wg_rhiYtaq96Rnvg";
const WEB = process.env.WEB_APP_URL || "https://kot3216.github.io/skeletdrop/";
const ADMIN = Number(process.env.ADMIN_ID || 6006668545;
const CHANNEL = process.env.CHANNEL_ID || "@SkelwtDrop";
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
    const p=new URLSearchParams(initData), h=p.get("hash"); if(!h) return null; p.delete("hash");
    const data=[...p.entries()].map(([k,v])=>k+"="+v).sort().join("\n");
    const sec=crypto.createHmac("sha256","WebAppData").update(TOKEN).digest();
    if(crypto.createHmac("sha256",sec).update(data).digest("hex")!==h) return null;
    return Object.fromEntries(p);
  }catch(e){ return null; }
}
function fmt(ms){ const h=Math.floor(ms/36e5),m=Math.floor(ms%36e5/6e4),s=Math.floor(ms%6e4/1e3);
  return [h,m,s].map(x=>String(x).padStart(2,"0")).join(":"); }

let bot=null;
if(TOKEN){
  bot=new Bot(TOKEN);
  const hasWeb=/^https:\/\/.+/.test(WEB);
  const kb=()=>{ const k=new InlineKeyboard();
    if(hasWeb) k.webApp("🎮 Играть",WEB).row();
    k.text("⭐ 25","pay:dep50").text("⭐ 50","pay:dep100").row()
     .text("⭐ 125","pay:dep250").text("⭐ 250","pay:dep500").row()
     .text("💰 Баланс","me").text("🎁 Кейс","free").row()
     .url("📢 Канал","https://t.me/SkelwtDrop");
    return k; };
  const play=()=>{ const k=new InlineKeyboard(); if(hasWeb) k.webApp("🎮 Играть",WEB); return k; };

  bot.command("start",c=>c.reply(
    "⭐ <b>SkeletDrop</b>\n\nПополнение: 25 / 50 / 125 / 250 ⭐\n"+
    "🎁 Бесплатный кейс — за подписку на @SkelwtDrop, раз в 24 часа.\n"+
    "⛏️ Фарм — добавь @SkeletDropBot в имя профиля.\n"+
    "💰 Продажа подарков — по их полной цене.",
    {parse_mode:"HTML",reply_markup:kb()}));
  bot.command("balance",c=>c.reply("⭐ Баланс: <b>"+Math.round(user(String(c.from.id)).balance)+"</b>",{parse_mode:"HTML",reply_markup:play()}));
  bot.command("free",c=>{const u=user(String(c.from.id)),l=(u.lastFree||0)+DAY-Date.now();
    c.reply(l>0?"⏳ Бесплатный кейс через <b>"+fmt(l)+"</b>":"🎁 <b>Бесплатный кейс доступен!</b>\nНужна подписка на @SkelwtDrop",{parse_mode:"HTML",reply_markup:play()})});
  bot.callbackQuery("free",async c=>{await c.answerCallbackQuery();
    const u=user(String(c.from.id)),l=(u.lastFree||0)+DAY-Date.now();
    c.reply(l>0?"⏳ Бесплатный кейс через <b>"+fmt(l)+"</b>":"🎁 <b>Бесплатный кейс доступен!</b>\nНужна подписка на @SkelwtDrop",{parse_mode:"HTML",reply_markup:play()})});
  bot.callbackQuery("me",c=>c.answerCallbackQuery({text:"⭐ "+Math.round(user(String(c.from.id)).balance),show_alert:true}));

  bot.callbackQuery(/^pay:(\w+)$/,async c=>{
    const p=PACKS[c.match[1]]; await c.answerCallbackQuery(); if(!p) return;
    try{ await bot.api.raw.sendInvoice({chat_id:c.chat.id,title:"Пополнение "+p.stars+" ⭐",
      description:p.stars+" ⭐ на баланс SkeletDrop",
      payload:JSON.stringify({uid:String(c.from.id),stars:p.stars}),
      currency:"XTR",prices:[{label:"Пополнение",amount:p.stars}]}); }
    catch(e){ c.reply("Ошибка счёта: "+e.message); }
  });

  bot.on("pre_checkout_query",c=>c.answerPreCheckoutQuery(true).catch(()=>{}));
  bot.on("message:successful_payment",async c=>{
    try{
      const sp=c.message.successful_payment,d=JSON.parse(sp.invoice_payload);
      const stars=Math.round(Number(d.stars)||0); if(stars<1) return;
      const dd=db(); if(dd.paid.includes(sp.telegram_payment_charge_id)) return;
      dd.paid.push(sp.telegram_payment_charge_id);
      if(dd.paid.length>5000) dd.paid=dd.paid.slice(-5000);
      const u=user(String(d.uid));
      patch(d.uid,{balance:Math.round((u.balance||0)+stars),updatedAt:Date.now()});
      c.reply("✅ +"+stars+" ⭐\nБаланс: "+Math.round(u.balance+stars)+" ⭐",{reply_markup:play()});
    }catch(e){ console.error("pay:",e.message); }
  });

  bot.command("code",c=>{ if(!ADMIN||c.from.id!==ADMIN) return;
    const a=parseFloat(String(c.match||"").replace(",","."))||0; if(a<=0) return c.reply("/code 50");
    const code="SD-"+crypto.randomBytes(4).toString("hex").toUpperCase();
    db().codes[code]=a; flush(); c.reply("🎟 "+code+" → "+a+" ⭐"); });

  bot.command("diag",async c=>{ if(!ADMIN||c.from.id!==ADMIN) return;
    let r="Канал: "+CHANNEL+"\n";
    try{ const m=await bot.api.raw.getChatMember({chat_id:CHANNEL,user_id:c.from.id});
      r+="Твой статус: "+m.status+"\n✅ Бот видит канал"; }
    catch(e){ r+="❌ ОШИБКА: "+e.message+"\n→ Сделай бота АДМИНОМ канала!"; }
    c.reply(r); });

  bot.catch(e=>console.error("bot:",e.message));
  bot.start({onStart:i=>console.log("✅ Бот:",i.username)}).catch(e=>console.error("start:",e.message));
}else console.error("❌ BOT_TOKEN не задан");

function body(req){ return new Promise(r=>{ let s=""; req.on("data",c=>{s+=c; if(s.length>1e6)req.destroy()});
  req.on("end",()=>{try{r(JSON.parse(s||"{}"))}catch(e){r({})}}); req.on("error",()=>r({})); }); }

http.createServer(async(req,res)=>{
  res.setHeader("Access-Control-Allow-Origin","*");
  res.setHeader("Access-Control-Allow-Headers","Content-Type");
  res.setHeader("Access-Control-Allow-Methods","POST, GET, OPTIONS");
  res.setHeader("Content-Type","application/json; charset=utf-8");
  if(req.method==="OPTIONS"){res.statusCode=204;return res.end()}
  const send=o=>res.end(JSON.stringify(o));
  if(req.method==="GET") return send({ok:true,service:"skeletdrop",v:31,token:!!TOKEN,channel:CHANNEL,packs:Object.keys(PACKS)});
  try{
    const b=await body(req),url=(req.url||"").split("?")[0];

    if(url==="/api/invoice"){
      if(!bot) return send({ok:false,error:"no_token"});
      const p=PACKS[b.pkg]; if(!p) return send({ok:false,error:"pkg"});
      const v=verify(b.initData||""); let uid="0";
      if(v&&v.user){ try{ uid=String(JSON.parse(v.user).id) }catch(e){} }
      try{
        const link=await bot.api.raw.createInvoiceLink({title:"Пополнение "+p.stars+" ⭐",
          description:p.stars+" ⭐ на баланс SkeletDrop",
          payload:JSON.stringify({uid,stars:p.stars}),currency:"XTR",
          prices:[{label:"Пополнение",amount:p.stars}]});
        return send({ok:true,link});
      }catch(e){ return send({ok:false,error:e.message}) }
    }

    if(url==="/api/check"){
      const code=String(b.code||"").toUpperCase().replace(/[\s\-_]+/g,""),d=db();
      const k=Object.keys(d.codes).find(x=>x.replace(/[\s\-_]+/g,"")===code);
      if(k){ const v=d.codes[k]; delete d.codes[k]; flush(); return send({ok:true,stars:v}) }
      return send({ok:false});
    }

    const v=verify(b.initData||"");
    if(!v||!v.user) return send({ok:false,error:"auth"});
    const uid=String(JSON.parse(v.user).id);

    if(url==="/api/load") return send({ok:true,user:user(uid)});

    if(url==="/api/verify"){
      if(!bot) return send({ok:false,sub:false,err:"no_bot"});
      try{
        const m=await bot.api.raw.getChatMember({chat_id:CHANNEL,user_id:Number(uid)});
        const ok=["member","administrator","creator"].includes(m.status)||(m.status==="restricted"&&m.is_member===true);
        patch(uid,{subscribed:ok});
        return send({ok:true,sub:ok,status:m.status});
      }catch(e){ return send({ok:false,sub:false,err:e.message}) }
    }

    if(url==="/api/save"){
      const s=b.state||{},cur=user(uid),ts=Number(s.updatedAt)||0;
      if(ts<(cur.updatedAt||0)) return send({ok:true,user:cur});
      return send({ok:true,user:patch(uid,{
        balance:Math.max(0,Math.round(Number(s.balance)||0)),
        collection:Array.isArray(s.collection)?s.collection.slice(0,600):[],
        lastFree:Number(s.lastFree)||0,
        subscribed:!!cur.subscribed,
        name:String(s.name||"Игрок").slice(0,24),
        updatedAt:ts||Date.now()})});
    }
    return send({ok:false,error:"route"});
  }catch(e){ return send({ok:false,error:e.message}) }
}).listen(process.env.PORT||8080,()=>console.log("✅ API v31"));

process.on("SIGTERM",()=>{flush();process.exit(0)});
process.on("SIGINT",()=>{flush();process.exit(0)});
