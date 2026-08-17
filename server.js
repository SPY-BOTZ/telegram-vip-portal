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

// DATABASE SETUP (SQLite)
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS users (user_id TEXT PRIMARY KEY, first_name TEXT)");
    db.run("CREATE TABLE IF NOT EXISTS premium (user_id TEXT PRIMARY KEY, expires_at INTEGER, reminders INTEGER DEFAULT 0)");
});

// TELEGRAM BOT SETUP
const token = process.env.BOT_TOKEN;
const adminId = process.env.ADMIN_ID; 
const adminChannelId = process.env.ADMIN_CHANNEL_ID; // Channel for screenshots
const fsubChannelId = process.env.FSUB_CHANNEL_ID; // Free channel (e.g. @mychannel)
const paidChannelId = process.env.PAID_CHANNEL_ID; // VIP Paid channel ID
const webAppUrlBase = process.env.WEBAPP_URL; // Your Koyeb App URL

let bot;
const awaitingScreenshot = new Map(); // Kisko screenshot bhejna hai track karne ke liye

if (token) {
    bot = new TelegramBot(token, { polling: true });
    console.log("Telegram Bot is running...");

    // 1. FORCE SUBSCRIBE CHECK FUNCTION
    async function checkFSub(userId) {
        if (!fsubChannelId) return true; // Agar FSub set nahi hai toh allow karein
        try {
            const member = await bot.getChatMember(fsubChannelId, userId);
            return ['creator', 'administrator', 'member'].includes(member.status);
        } catch (e) {
            return false;
        }
    }

    // 2. /START COMMAND
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
        // App url fallback agar env var set na ho
        const appUrl = webAppUrlBase || `https://t.me/your_bot_username`; 
        const finalUrl = `${appUrl}/?userid=${chatId}`;

        const opts = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '⚡ Open VIP Portal (Pay Here)', web_app: { url: finalUrl } }],
                    [{ text: '📞 Support', url: 'https://t.me/YOUR_SUPPORT_USERNAME' }]
                ]
            }
        };
        bot.sendMessage(chatId, "🔥 **WELCOME TO VIP PORTAL**\n\nNiche diye gaye button par click karke apna plan chunein aur instant access payein!", opts);
    }

    // 3. CALLBACK QUERIES (Inline Buttons)
    bot.on('callback_query', async (query) => {
        const chatId = query.message.chat.id;
        const action = query.data;

        // FSub 'Try Again' Check
        if (action === 'check_fsub') {
            const isSubbed = await checkFSub(chatId);
            if (isSubbed) {
                bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
                sendMainMenu(chatId);
            } else {
                bot.answerCallbackQuery(query.id, { text: "❌ Aapne abhi tak join nahi kiya hai!", show_alert: true });
            }
        }

        // Admin Approve Logic
        if (action.startsWith('approve_')) {
            const parts = action.split('_');
            const userId = parts[1];
            const days = parseInt(parts[2]);

            const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);

            try {
                // Generate 12-hour unique single-use link
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
                console.error(err);
                bot.sendMessage(chatId, "❌ Error: Bot ko VIP channel me 'Add Users' aur 'Ban Users' ki admin permission dein.");
            }
        }

        // Admin Reject Logic
        if (action.startsWith('reject_')) {
            const userId = action.split('_')[1];
            bot.sendMessage(userId, "❌ **Payment Rejected!**\nAapka screenshot invalid tha. Kripya support se contact karein.");
            bot.editMessageCaption(`❌ **REJECTED**\nUser ID: ${userId}`, { chat_id: chatId, message_id: query.message.message_id });
        }
    });

    // 4. RECEIVE SCREENSHOT FROM USER
    bot.on('photo', async (msg) => {
        const userId = msg.from.id.toString();
        
        if (awaitingScreenshot.has(userId)) {
            const data = awaitingScreenshot.get(userId);
            const fileId = msg.photo[msg.photo.length - 1].file_id;

            const caption = `🚨 **New Payment Proof!**\n\n👤 **User:** ${msg.from.first_name} (@${msg.from.username || 'None'})\n🆔 **User ID:** \`${userId}\`\n💎 **Plan:** ${data.planName}\n💰 **Amount:** ₹${data.amount}\n⏳ **Duration:** ${data.days} Days`;

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
            bot.sendMessage(userId, "✅ Aapka payment screenshot Admin ko bhej diya gaya hai. Kripya approval ka wait karein.");
            awaitingScreenshot.delete(userId); // Clear state
        }
    });

    // 5. EXPIRY REMINDERS & AUTO-KICK (Runs every hour)
    cron.schedule('0 * * * *', () => {
        const now = Date.now();
        const oneDayLater = now + (24 * 60 * 60 * 1000);

        db.each("SELECT * FROM premium", (err, row) => {
            if (row.expires_at < now) {
                // EXPIRED - Kick user
                bot.banChatMember(paidChannelId, row.user_id).then(() => {
                    bot.unbanChatMember(paidChannelId, row.user_id); 
                }).catch(e => console.log(e));
                
                bot.sendMessage(row.user_id, "🚫 **Aapka Premium Plan Expire ho gaya hai!**\nAapko VIP channel se remove kar diya gaya hai. Kripya VIP Portal se dubara renew karein.");
                db.run("DELETE FROM premium WHERE user_id = ?", [row.user_id]);

            } else if (row.expires_at < oneDayLater && row.reminders < 5) {
                // REMINDERS (1 Day before)
                bot.sendMessage(row.user_id, `⚠️ **ALERT:** Aapka VIP Premium bahut jald expire hone wala hai!\nKripya apna plan renew karein taaki access na ruke.`);
                db.run("UPDATE premium SET reminders = reminders + 1 WHERE user_id = ?", [row.user_id]);
            }
        });
    });

    // 6. ADMIN COMMANDS
    bot.onText(/\/addpremium (\d+) (\d+)/, (msg, match) => {
        if (msg.from.id.toString() !== adminId) return;
        const userId = match[1];
        const days = parseInt(match[2]);
        const expiresAt = Date.now() + (days * 24 * 60 * 60 * 1000);
        
        db.run("INSERT OR REPLACE INTO premium (user_id, expires_at, reminders) VALUES (?, ?, 0)", [userId, expiresAt]);
        bot.sendMessage(msg.chat.id, `✅ User ${userId} manually added for ${days} days.`);
    });

    bot.onText(/\/removepremium (\d+)/, (msg, match) => {
        if (msg.from.id.toString() !== adminId) return;
        const userId = match[1];
        
        db.run("DELETE FROM premium WHERE user_id = ?", [userId]);
        bot.banChatMember(paidChannelId, userId).then(() => bot.unbanChatMember(paidChannelId, userId)).catch(()=>{});
        bot.sendMessage(msg.chat.id, `✅ User ${userId} removed from premium and kicked from channel.`);
    });

    bot.onText(/\/stats/, (msg) => {
        if (msg.from.id.toString() !== adminId) return;
        db.get("SELECT COUNT(*) AS total FROM users", (err, userRow) => {
            db.get("SELECT COUNT(*) AS active FROM premium", (err, premRow) => {
                bot.sendMessage(msg.chat.id, `📊 **Bot Stats:**\n\n👥 Total Users: ${userRow.total}\n💎 Active Premium Members: ${premRow.active}`);
            });
        });
    });

    bot.onText(/\/broadcast (.+)/, (msg, match) => {
        if (msg.from.id.toString() !== adminId) return;
        const bMsg = match[1];
        db.each("SELECT user_id FROM users", (err, row) => {
            bot.sendMessage(row.user_id, `📢 **Broadcast:**\n\n${bMsg}`).catch(()=>{});
        });
        bot.sendMessage(msg.chat.id, "✅ Broadcast completed!");
    });

} else {
    console.warn("⚠️ BOT_TOKEN is missing in environment variables!");
}

// ==============================================
// WEB SERVER LOGIC (For WebApp and Payment API)
// ==============================================

app.post('/api/notify-payment', async (req, res) => {
    const { userId, planName, amount, days } = req.body;
    
    if (bot && userId && userId !== 'Unknown') {
        // Set user state that we are waiting for a screenshot
        awaitingScreenshot.set(userId.toString(), { planName, amount, days });
        
        bot.sendMessage(userId, `⏳ **Payment Initiated!**\n\nAapne **${planName}** select kiya hai (₹${amount}).\n✅ **Kripya payment complete karne ke baad is chat mein apna Screenshot (Photo) bhejein.**`);
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Invalid User ID' });
    }
});

// Serve frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web Server is running on port ${PORT}`);
});
