require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const multer = require('multer');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID || "1249672673"; // Aapki Telegram ID

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: { interval: 2000, autoStart: true, params: { timeout: 10 } } });
const WEB_APP_URL = process.env.WEB_APP_URL || "https://rainy-manya-bhaiforik76-fe95b73e.koyeb.app";
const BOT_USERNAME = process.env.BOT_USERNAME || "Payments_Robot_bot"; // Apne bot ka username yahan daalein

bot.onText(/\/start/, (msg, match) => {
    try {
        const chatId = msg.chat.id;
        const userId = msg.from.id;
        const text = msg.text;

        // Agar user website se payment ke baad redirect होकर wapas aaya hai
        if (text.includes('payment_done')) {
            bot.sendMessage(chatId, "✅ *Payment details submit karne ke liye niche click karein ya apna UTR/Screenshot yahan bhej dein:*", {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: "📤 Submit Payment Proof", url: `${WEB_APP_URL}/?userid=${userId}` }]
                    ]
                }
            });
            return;
        }

        const messageText = "🔥 WELCOME TO VIP PORTAL\n\nNeeche diye gaye button par click karke apna plan chunein aur instant access payen!";
        bot.sendMessage(chatId, messageText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: "⚡ Open VIP Portal", url: `${WEB_APP_URL}/?userid=${userId}` }],
                    [{ text: "📞 Support / Help", url: "https://t.me/" }]
                ]
            }
        });
    } catch(e) { console.log(e); }
});

const CHANNELS_CONFIG = {
    'channel1': {
        name: 'VIP Movie & Series Channel',
        vipId: process.env.CHANNEL_1_VIP_ID || '@channel_1_vip',
        plans: {
            'trial': { name: 'Free Trial (10 Mins)', amount: 0, ms: 10 * 60 * 1000 },
            '15days': { name: '15 Days Pass', amount: 99, ms: 15 * 24 * 60 * 60 * 1000 },
            '1month': { name: '1 Month Pass', amount: 199, ms: 30 * 24 * 60 * 60 * 1000 },
            '2months': { name: '2 Months Pass', amount: 369, ms: 60 * 24 * 60 * 60 * 1000 },
            '3months': { name: '3 Months Gold', amount: 499, ms: 90 * 24 * 60 * 60 * 1000 },
            '4months': { name: '4 Months Diamond', amount: 649, ms: 120 * 24 * 60 * 60 * 1000 }
        }
    },
    'channel2': {
        name: 'VIP Premium Bot & Tools Channel',
        vipId: process.env.CHANNEL_2_VIP_ID || '@channel_2_vip',
        plans: {
            'trial': { name: 'Free Trial (10 Mins)', amount: 0, ms: 10 * 60 * 1000 },
            '15days': { name: '15 Days Pass', amount: 149, ms: 15 * 24 * 60 * 60 * 1000 },
            '1month': { name: '1 Month Pass', amount: 299, ms: 30 * 24 * 60 * 60 * 1000 },
            '2months': { name: '2 Months Pass', amount: 549, ms: 60 * 24 * 60 * 60 * 1000 },
            '3months': { name: '3 Months Gold', amount: 799, ms: 90 * 24 * 60 * 60 * 1000 },
            '4months': { name: '4 Months Diamond', amount: 999, ms: 120 * 24 * 60 * 60 * 1000 }
        }
    }
};

const DB_FILE = 'subscriptions.json';
function loadSubscriptions() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE)); } catch (e) { return []; }
}
function saveSubscriptions(subs) {
    fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
}

// 12 Hours Expiry Link Generator (Single Use)
async function createTelegramInviteLink(chatId) {
    try {
        const expireDate = Math.floor(Date.now() / 1000) + (12 * 60 * 60); // 12 Hours
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createChatInviteLink`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, member_limit: 1, expire_date: expireDate })
        });
        const data = await res.json();
        return data.ok ? data.result.invite_link : null;
    } catch (err) {
        return null;
    }
}

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Trial activation
app.post('/activate-trial', async (req, res) => {
    try {
        const { telegramId, channelKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        let subs = loadSubscriptions();
        if (subs.find(s => s.telegramId === String(telegramId) && s.channelKey === channelKey && s.isTrial)) {
            return res.json({ success: false, message: "Aapne is channel ka free trial pehle hi use kar liya hai!" });
        }

        const inviteLink = await createTelegramInviteLink(channelData.vipId);
        if(!inviteLink) return res.status(500).json({ success: false, message: "Bot ko channel ka admin banayein!" });

        subs.push({
            telegramId: String(telegramId),
            channelKey: channelKey,
            vipId: channelData.vipId,
            planName: 'Free Trial',
            expiryTime: Date.now() + 10 * 60 * 1000,
            isTrial: true
        });
        saveSubscriptions(subs);

        bot.sendMessage(telegramId, `🎉 FREE TRIAL ACTIVATED!\n\nChannel: ${channelData.name}\n\nYeh raha aapka 12-hour single-use link:\n${inviteLink}`);
        res.json({ success: true, invite_link: inviteLink });
    } catch (error) {
        res.status(500).json({ success: false, message: "Trial Failed" });
    }
});

// Manual Payment Submission from Web
app.post('/submit-manual-payment', upload.single('screenshot'), async (req, res) => {
    try {
        const { telegramId, channelKey, planKey, utr } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const planData = channelData.plans[planKey];

        const caption = `💰 *NEW MANUAL PAYMENT SUBMISSION*\n\n` +
                        `👤 *User ID:* \`${telegramId}\`\n` +
                        `📺 *Channel:* ${channelData.name}\n` +
                        `📦 *Plan:* ${planData.name} (₹${planData.amount})\n` +
                        `🔖 *UTR / Txn ID:* \`${utr}\``;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: "✅ Approve & Send Link", callback_data: `app_${telegramId}_${channelKey}_${planKey}` },
                    { text: "❌ Reject", callback_data: `rej_${telegramId}` }
                ]
            ]
        };

        if (req.file) {
            await bot.sendPhoto(ADMIN_TELEGRAM_ID, fs.createReadStream(req.file.path), {
                caption: caption,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(ADMIN_TELEGRAM_ID, caption, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }

        res.json({ success: true, message: "Payment details admin ko bhej di gayi hain! Approval ke baad bot par link mil jayega." });
    } catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// Admin Approval/Rejection Handler
bot.on('callback_query', async (query) => {
    const data = query.data;
    const chatId = query.message.chat.id;

    if (data.startsWith('app_')) {
        const parts = data.split('_');
        const telegramId = parts[1];
        const channelKey = parts[2];
        const planKey = parts[3];

        const channelData = CHANNELS_CONFIG[channelKey];
        const planData = channelData.plans[planKey];

        const inviteLink = await createTelegramInviteLink(channelData.vipId);
        if (!inviteLink) {
            bot.answerCallbackQuery(query.id, { text: "Link generate nahi ho paya. Bot admin hai na?" });
            return;
        }

        let subs = loadSubscriptions();
        subs.push({
            telegramId: String(telegramId),
            channelKey: channelKey,
            vipId: channelData.vipId,
            planName: planData.name,
            expiryTime: Date.now() + planData.ms,
            isTrial: false
        });
        saveSubscriptions(subs);

        await bot.sendMessage(telegramId, `✅ *PAYMENT APPROVED!*\n\nChannel: ${channelData.name}\nPlan: ${planData.name}\n\nAapka 12-hour single-use link:\n${inviteLink}`, { parse_mode: 'Markdown' });
        
        await bot.editMessageCaption(`${query.message.caption}\n\n🟢 *STATUS:* APPROVED BY ADMIN`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(query.id, { text: "Approved successfully!" });

    } else if (data.startsWith('rej_')) {
        const telegramId = data.split('_')[1];
        await bot.sendMessage(telegramId, `❌ *PAYMENT REJECTED*\nAapka payment verification fail ho gaya hai. Kripya sahi details ke saath dobara try karein.`, { parse_mode: 'Markdown' });
        
        await bot.editMessageCaption(`${query.message.caption}\n\n🔴 *STATUS:* REJECTED BY ADMIN`, {
            chat_id: chatId,
            message_id: query.message.message_id,
            parse_mode: 'Markdown'
        });
        bot.answerCallbackQuery(query.id, { text: "Payment rejected!" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
