require('dotenv').config();
const express = require('express');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use(express.static(__dirname));

const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, first_name TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS premium (user_id TEXT PRIMARY KEY, expires_at INTEGER, reminders INTEGER DEFAULT 0)");
});

const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID; 
const adminChannelId = process.env.ADMIN_CHANNEL_ID;
const fsubChannelId = process.env.FSUB_CHANNEL_ID;
const paidChannelId = process.env.PAID_CHANNEL_ID;
const webAppUrlBase = process.env.WEBAPP_URL; 

let bot;
const awaitingScreenshot = new Map();

if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log("Telegram Bot is running...");

    async function checkFSub(userId) {
        if (!fsubChannelId) return true;
        try {
            const member = await bot.getChatMember(fsubChannelId, userId);
            return ['creator', 'administrator', 'member'].includes(member.status);
        } catch (e) {
            return false;
        }
    }

    bot.onText(/\/start/, async (msg) => {
        const chatId = msg.chat.id;
        db.run("INSERT OR IGNORE INTO users (user_id, first_name) VALUES (?, ?)", [chatId, msg.from.first_name]);

        const isSubbed = await checkFSub(chatId);
        if (!isSubbed) {
            const opts = {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '📢 Join Our Free Channel First', url: `https://t.me/${fsubChannelId.replace('@', '')}` }],
                        [{ text: '🔄 Try Again', callback_data: 'check_fsub' }]
                    ]
                }
            };
            return bot.sendMessage(chatId, "⚠️ **Pehle Hamara Free Channel Join Karein!**\nUske baad 'Try Again' par click karein.", opts);
        }
        sendMainMenu(chatId);
    });

    function sendMainMenu(chatId) {
        // CLEAN URL FOR TELEGRAM WEB APP
        const appUrl = webAppUrlBase || `https://a-bhaiforik76-fe95b73e.koyeb.app`; 

        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⚡ Open VIP Portal (Pay Here)', web_app: { url: appUrl } }],
                    [{ text: '📞 Support', url: 'https://t.me/YOUR_SUPPORT_USERNAME' }]
                ]
            }
        };
        bot.sendMessage(chatId, "🔥 **WELCOME TO VIP PORTAL**\n\nNiche diye gaye button par click karke apna plan chunein aur instant access payein!", opts);
    }

    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const action = query.data;

        if (action === 'check_fsub') {
            const isSubbed = await checkFSub(chatId);
            if (isSubbed) {
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                sendMainMenu(chatId);
            } else {
                bot.answerCallbackQuery(query.id, { text: "❌ Aapne abhi tak join nahi kiya hai!", show_alert: true });
            }
        }

        if (action.startsWith('approve_')) {
            const parts = action.split('_');
            const userId = parts[1];
            const days = parseInt(parts[2]);
            const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

            try {
                const inviteLink = await bot.createChatInviteLink(paidChannelId, {
                    member_limit: 1, 
                    expire_date: Math.floor(Date.now() / 1000) + (12 * 3600)
                });
                db.run("INSERT OR REPLACE INTO premium (user_id, expires_at, reminders) VALUES (?, ?, 0)", [userId, expiresAt]);
                await bot.sendMessage(userId, `✅ **Payment Approved!**\n\nAapka Premium **${days} din** ke liye activate kar diya gaya hai.\n\n👇 **Aapka Single-Use Join Link (12 Hours Expiry):**\n${inviteLink.invite_link}`);
                await bot.editMessageCaption(`✅ **APPROVED** for ${days} days.\nUser ID: ${userId}`, {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    reply_markup: { inline_keyboard: [] }
                });
            } catch (err) {
                bot.sendMessage(chatId, "❌ Error: Bot ko VIP channel me admin banayein.");
            }
        }

        if (action.startsWith('reject_')) {
            const userId = action.split('_')[1];
            bot.sendMessage(userId, "❌ **Payment Rejected!**\nAapka screenshot invalid tha. Kripya support se contact karein.");
            bot.editMessageCaption(`❌ **REJECTED**\nUser ID: ${userId}`, { chat_id: chatId, message_id: query.message.message_id });
        }
    });

    bot.on('photo', async (msg) => {
        const userId = msg.from.id.toString();
        
        if (awaitingScreenshot.has(userId)) {
            const data = awaitingScreenshot.get(userId);
            const fileId = msg.photo[msg.photo.length - 1].file_id;
            const caption = `🚨 **New Payment Proof!**\n\n👤 **User:** ${msg.from.first_name}\n🆔 **User ID:** \`${userId}\`\n💎 **Plan:** ${data.planName}\n💰 **Amount:** ₹${data.amount}\n⏳ **Duration:** ${data.days} Days`;
            const opts = {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '✅ Approve', callback_data: `approve_${userId}_${data.days}` }, { text: '❌ Reject', callback_data: `reject_${userId}` }]
                    ]
                }
            };
            await bot.sendPhoto(adminChannelId, fileId, opts);
            bot.sendMessage(userId, "✅ Aapka screenshot bhej diya gaya hai. Wait for approval.");
            awaitingScreenshot.delete(userId);
        }
    });

    cron.schedule('0 * * * *', () => {
        const now = Date.now();
        const oneDayLater = now + (24 * 60 * 60 * 1000);
        db.each("SELECT * FROM premium", (err, row) => {
            if (row.expires_at < now) {
                bot.banChatMember(paidChannelId, row.user_id).then(() => bot.unbanChatMember(paidChannelId, row.user_id)).catch(()=>{});
                bot.sendMessage(row.user_id, "🚫 **Premium Expired!**\nAapko channel se remove kar diya gaya hai.");
                db.run("DELETE FROM premium WHERE user_id = ?", [row.user_id]);
            } else if (row.expires_at < oneDayLater && row.reminders < 5) {
                bot.sendMessage(row.user_id, `⚠️ **ALERT:** Aapka Premium 24 ghante me expire hone wala hai!`);
                db.run("UPDATE premium SET reminders = reminders + 1 WHERE user_id = ?", [row.user_id]);
            }
        });
    });

    bot.onText(/\/addpremium (\d+) (\d+)/, (msg, match) => {
        if (msg.from.id.toString() !== adminId) return;
        const userId = match[1];
        const days = parseInt(match[2]);
        const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
        db.run("INSERT OR REPLACE INTO premium (user_id, expires_at, reminders) VALUES (?, ?, 0)", [userId, expiresAt]);
        bot.sendMessage(msg.chat.id, `✅ User ${userId} added for ${days} days.`);
    });

    bot.onText(/\/removepremium (\d+)/, (msg, match) => {
        if (msg.from.id.toString() !== adminId) return;
        const userId = match[1];
        db.run("DELETE FROM premium WHERE user_id = ?", [userId]);
        bot.banChatMember(paidChannelId, userId).then(() => bot.unbanChatMember(paidChannelId, userId)).catch(()=>{});
        bot.sendMessage(msg.chat.id, `✅ User ${userId} removed.`);
    });
}

app.post('/api/notify-payment', async (req, res) => {
    const { userId, planName, amount, days } = req.body;
    if (bot && userId && userId !== 'Unknown') {
        awaitingScreenshot.set(userId.toString(), { planName, amount, days });
        bot.sendMessage(userId, `⏳ **Payment Initiated!**\nAapne **${planName}** (₹${amount}) chuna hai.\n✅ **Kripya payment ke baad apna Screenshot bhejein.**`);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => console.log(`✅ Server running on port ${PORT}`));
