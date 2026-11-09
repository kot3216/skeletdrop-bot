const TOKEN = "9238600427:AAEaRZ1EzFLlP8DuQg4SdyvXeEL2efYi0Oo";
const WEB_APP_URL = "https://kot3216.github.io/skeletdrop/";

console.log("=== ЗАПУСК БОТА ===");
console.log("Токен:", TOKEN ? "OK" : "ПУСТОЙ!");

const { Bot } = require("grammy");
const bot = new Bot(TOKEN);

bot.command("start", async (ctx) => {
  await ctx.reply("Привет! Бот работает ✅");
});

const PORT = process.env.PORT || 8080;
const http = require("http");
http.createServer((req, res) => {
  res.end("OK");
}).listen(PORT, () => {
  console.log("✅ Сервер на порту", PORT);
});

bot.start().then(() => {
  console.log("✅ Бот запущен!");
}).catch((e) => {
  console.error("❌ Ошибка:", e.message);
  process.exit(1);
});
