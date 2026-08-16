require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files directly from root directory
app.use(express.static(__dirname));

const CASHFREE_APP_ID = process.env.CASHFREE_APP_ID;
const CASHFREE_SECRET_KEY = process.env.CASHFREE_SECRET_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: true });
const WEB_APP_URL = process.env.WEB_APP_URL || "https://rainy-manya-bhaiforik76-fe95b73e.koyeb.app";

bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    
    const messageText = `🔥 *WELCOME TO VIP PORTAL*\n\nNeeche diye gaye button par click karke apna plan chunein aur instant access payen!`;
    
    const opts = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "⚡ Open VIP Portal", url: `${WEB_APP_URL}/?userid=${userId}` }
                ],
                [
                    { text: "📞 Support / Help", url: "https://t.me/" }
                ]
            ]
        }
    };
    
    bot.sendMessage(chatId, messageText, opts);
});

const CHANNELS_CONFIG = {
    'channel1': {
        name: 'VIP Movie & Series Channel',
        vipId: process.env.CHANNEL_1_VIP_ID || '@channel_1_vip',
        logId: process.env.CHANNEL_1_LOG_ID || '@channel_1_logs',
        plans: {
            'trial': { name: '10 Mins Free Trial', amount: 0, ms: 10 * 60 * 1000 },
            '15days': { name: '15 Days Trial', amount: 99, ms: 15 * 24 * 60 * 60 * 1000 },
            '1month': { name: '1 Month Pass', amount: 199, ms: 30 * 24 * 60 * 60 * 1000 },
            '2months': { name: '2 Months Pass', amount: 369, ms: 60 * 24 * 60 * 60 * 1000 },
            '3months': { name: '3 Months Gold VIP', amount: 499, ms: 90 * 24 * 60 * 60 * 1000 },
            '4months': { name: '4 Months Diamond', amount: 649, ms: 120 * 24 * 60 * 60 * 1000 }
        }
    },
    'channel2': {
        name: 'VIP Premium Bot & Tools Channel',
        vipId: process.env.CHANNEL_2_VIP_ID || '@channel_2_vip',
        logId: process.env.CHANNEL_2_LOG_ID || '@channel_2_logs',
        plans: {
            'trial': { name: '10 Mins Free Trial', amount: 0, ms: 10 * 60 * 1000 },
            '15days': { name: '15 Days Trial', amount: 149, ms: 15 * 24 * 60 * 60 * 1000 },
            '1month': { name: '1 Month Pass', amount: 299, ms: 30 * 24 * 60 * 60 * 1000 },
            '2months': { name: '2 Months Pass', amount: 549, ms: 60 * 24 * 60 * 60 * 1000 },
            '3months': { name: '3 Months Gold VIP', amount: 799, ms: 90 * 24 * 60 * 60 * 1000 },
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

async function createTelegramInviteLink(chatId) {
    try {
        const expireDate = Math.floor(Date.now() / 1000) + 86400;
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

app.post('/create-order', async (req, res) => {
    try {
        const { channelKey, planKey, telegramId } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        if(!channelData || !channelData.plans[planKey]) {
            return res.status(400).json({ success: false, message: "Invalid Channel or Plan" });
        }
        const selectedPlan = channelData.plans[planKey];
        if (planKey === 'trial') {
            return res.json({ success: true, isTrial: true, planName: selectedPlan.name });
        }

        const orderId = `order_${channelKey}_${planKey}_${Date.now()}`;
        const payload = {
            order_id: orderId,
            order_amount: selectedPlan.amount,
            order_currency: "INR",
            customer_details: { customer_id: String(telegramId), customer_phone: "9999999999" }
        };

        const response = await fetch("https://api.cashfree.com/pg/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-client-id": CASHFREE_APP_ID,
                "x-client-secret": CASHFREE_SECRET_KEY,
                "x-api-version": "2023-08-01"
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok && data.payment_session_id) {
            res.json({ success: true, isTrial: false, payment_session_id: data.payment_session_id, order_id: orderId, planName: selectedPlan.name });
        } else {
            res.status(500).json({ success: false, message: data.message || "Payment Gateway Error" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

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
            planName: '10 Mins Free Trial',
            expiryTime: Date.now() + 10 * 60 * 1000,
            isTrial: true
        });
        saveSubscriptions(subs);

        bot.sendMessage(telegramId, `🎉 *FREE TRIAL ACTIVATED!*\n\nChannel: *${channelData.name}*\n\nLink:\n${inviteLink}`, { parse_mode: 'Markdown' });
        bot.sendMessage(channelData.logId, `🚀 *NEW FREE TRIAL*\n👤 \`${telegramId}\``, { parse_mode: 'Markdown' });

        res.json({ success: true, invite_link: inviteLink });
    } catch (error) {
        res.status(500).json({ success: false, message: "Trial Failed" });
    }
});

app.post('/verify-payment', async (req, res) => {
    try {
        const { order_id, telegramId, channelKey, planKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const selectedPlan = channelData.plans[planKey];

        const response = await fetch(`https://api.cashfree.com/pg/orders/${order_id}`, {
            method: "GET",
            headers: {
                "x-client-id": CASHFREE_APP_ID,
                "x-client-secret": CASHFREE_SECRET_KEY,
                "x-api-version": "2023-08-01"
            }
        });
        const orderData = await response.json();

        if (response.ok && orderData.order_status === "PAID") {
            const inviteLink = await createTelegramInviteLink(channelData.vipId);
            if(!inviteLink) return res.status(500).json({ success: false, message: "Bot ko channel ka admin banayein!" });

            let subs = loadSubscriptions();
            subs.push({
                telegramId: String(telegramId),
                channelKey: channelKey,
                vipId: channelData.vipId,
                planName: selectedPlan.name,
                expiryTime: Date.now() + selectedPlan.ms,
                isTrial: false
            });
            saveSubscriptions(subs);

            bot.sendMessage(telegramId, `⚡ *PAYMENT CONFIRMED!*\n\nChannel: *${channelData.name}*\nPlan: *${selectedPlan.name}*\n\nLink:\n${inviteLink}`, { parse_mode: 'Markdown' });
            bot.sendMessage(channelData.logId, `🔔 *NEW VIP PURCHASE*\n👤 \`${telegramId}\`\n💎 ${selectedPlan.name}\n💰 ₹${selectedPlan.amount}`, { parse_mode: 'Markdown' });

            res.json({ success: true, invite_link: inviteLink });
        } else {
            res.status(400).json({ success: false, message: "Payment not completed yet!" });
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Verification Failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server and Bot running on port ${PORT}`));
