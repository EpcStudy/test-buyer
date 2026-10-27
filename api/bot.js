// api/bot.js — посредник между Telegram и базой.
// Положить в репозиторий GitHub в папку api/ (рядом с index.html должна
// появиться папка api, в ней этот файл). Vercel подхватит сам.
//
// Нужны 4 переменные окружения в Vercel (Settings → Environment Variables):
//   TG_BOT_TOKEN      — токен бота из @BotFather
//   BOT_SECRET        — тот же, что в базе (settings → bot_secret)
//   SUPABASE_URL      — https://ebyrccbbpzdfwdfgpysd.supabase.co
//   SUPABASE_ANON_KEY — публичный ключ anon (тот же, что в html-файлах)
//
// Логики здесь нет: сообщение пересылается функции bot_dialog в базе,
// её ответ отправляется кандидату. Все тексты и правила — в 25-bot.sql.

module.exports = async (req, res) => {
  // Telegram шлёт только POST; на GET отвечаем, что живы
  if (req.method !== 'POST') {
    res.status(200).send('bot ok');
    return;
  }

  // Проверяем, что это действительно Telegram (секрет задаётся при включении вебхука)
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.BOT_SECRET) {
    res.status(401).send('unauthorized');
    return;
  }

  // Telegram ждёт быстрый ответ 200, иначе шлёт то же сообщение снова
  try {
    const msg = req.body && req.body.message;
    const text = msg && (msg.text || '');
    const chatId = msg && msg.chat && msg.chat.id;

    if (!chatId || typeof text !== 'string') {
      res.status(200).json({ ok: true });
      return;
    }

    // Спрашиваем базу, что ответить
    const rpc = await fetch(process.env.SUPABASE_URL + '/rest/v1/rpc/bot_dialog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + process.env.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        p_secret: process.env.BOT_SECRET,
        p_chat_id: chatId,
        p_username: (msg.from && msg.from.username) || null,
        p_text: text
      })
    });
    const out = await rpc.json().catch(() => null);

    // Отправляем ответ кандидату
    if (out && out.reply) {
      const body = {
        chat_id: chatId,
        text: out.reply,
        disable_web_page_preview: true
      };
      if (out.buttons) {
        body.reply_markup = {
          keyboard: out.buttons.map(row => row.map(b => ({ text: b }))),
          resize_keyboard: true,
          one_time_keyboard: true
        };
      } else {
        body.reply_markup = { remove_keyboard: true };
      }
      await fetch('https://api.telegram.org/bot' + process.env.TG_BOT_TOKEN + '/sendMessage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    }
  } catch (e) {
    // молча: кандидат попробует ещё раз, а Telegram не должен зациклиться
  }

  res.status(200).json({ ok: true });
};
