require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const CASHFREE_APP_ID = process.env.RAZORPAY_KEY_ID; // AppID yahan map kiya hai
const CASHFREE_SECRET_KEY = process.env.RAZORPAY_KEY_SECRET; // Secret Key yahan map kiya hai
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const DB_FILE = 'subscriptions.json';
function loadSubscriptions() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE)); } catch (e) { return []; }
}
function saveSubscriptions(subs) {
    fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
}

// 1. Create Cashfree Order API
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

        // Cashfree API Call to Create Order
        const orderId = `order_${channelKey}_${planKey}_${Date.now()}`;
        const payload = {
            order_id: orderId,
            order_amount: selectedPlan.amount,
            order_currency: "INR",
            customer_details: {
                customer_id: String(telegramId),
                customer_phone: "9999999999"
            }
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
            res.json({
                success: true,
                isTrial: false,
                payment_session_id: data.payment_session_id,
                order_id: orderId,
                planName: selectedPlan.name
            });
        } else {
            console.error("Cashfree Error:", data);
            res.status(500).json({ success: false, message: data.message || "Payment Gateway Error" });
        }
    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Direct Activate Trial API
app.post('/activate-trial', async (req, res) => {
    try {
        const { telegramId, channelKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const selectedPlan = channelData.plans['trial'];

        let subs = loadSubscriptions();
        const existingTrial = subs.find(s => s.telegramId === String(telegramId) && s.channelKey === channelKey && s.isTrial);
        if (existingTrial) {
            return res.json({ success: false, message: "Aapne is channel ka free trial pehle hi use kar liya hai!" });
        }

        const inviteLink = await bot.createChatInviteLink(channelData.vipId, {
            member_limit: 1,
            expire_date: Math.floor(Date.now() / 1000) + 86400
        });

        const expiryTime = Date.now() + selectedPlan.ms;

        subs.push({
            telegramId: String(telegramId),
            channelKey: channelKey,
            vipId: channelData.vipId,
            planName: selectedPlan.name,
            expiryTime: expiryTime,
            isTrial: true,
            remindersSent: 4
        });
        saveSubscriptions(subs);

        await bot.sendMessage(telegramId, `🎉 *10-MINUTES FREE TRIAL ACTIVATED!*\n\nChannel: *${channelData.name}* \n\nAccess Link:\n${inviteLink.invite_link}`, { parse_mode: 'Markdown' });
        await bot.sendMessage(channelData.logId, `🚀 *NEW FREE TRIAL USER*\n👤 *User ID:* \`${telegramId}\``, { parse_mode: 'Markdown' });

        res.json({ success: true, invite_link: inviteLink.invite_link });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Trial Failed" });
    }
});

// 3. Verify Cashfree Payment Success
app.post('/verify-payment', async (req, res) => {
    try {
        const { order_id, telegramId, channelKey, planKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const selectedPlan = channelData.plans[planKey];

        // Verify order status from Cashfree server
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
            const inviteLink = await bot.createChatInviteLink(channelData.vipId, {
                member_limit: 1,
                expire_date: Math.floor(Date.now() / 1000) + 86400
            });

            const expiryTime = Date.now() + selectedPlan.ms;

            let subs = loadSubscriptions();
            subs.push({
                telegramId: String(telegramId),
                channelKey: channelKey,
                vipId: channelData.vipId,
                planName: selectedPlan.name,
                expiryTime: expiryTime,
                isTrial: false,
                remindersSent: 0
            });
            saveSubscriptions(subs);

            await bot.sendMessage(telegramId, `⚡ *PAYMENT CONFIRMED!*\n\nChannel: *${channelData.name}*\nPlan: *${selectedPlan.name}*\n\nSecure Link:\n${inviteLink.invite_link}`, { parse_mode: 'Markdown' });
            await bot.sendMessage(channelData.logId, `🔔 *NEW VIP PURCHASE*\n👤 *User ID:* \`${telegramId}\`\n💎 *Plan:* ${selectedPlan.name}\n💰 *Amount:* ₹${selectedPlan.amount}`, { parse_mode: 'Markdown' });

            res.json({ success: true, invite_link: inviteLink.invite_link });
        } else {
            res.status(400).json({ success: false, message: "Payment not completed yet!" });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Verification Failed" });
    }
});

// 4. Background Expiry & Reminder Cron Worker
setInterval(async () => {
    try {
        let subs = loadSubscriptions();
        if (subs.length === 0) return;

        const now = Date.now();
        let updatedSubs = [];

        for (let sub of subs) {
            const timeLeft = sub.expiryTime - now;
            const oneDayMs = 24 * 60 * 60 * 1000;

            if (timeLeft <= 0) {
                try {
                    await bot.banChatMember(sub.vipId, sub.telegramId);
                    await bot.unbanChatMember(sub.vipId, sub.telegramId);
                    
                    const msg = sub.isTrial 
                        ? `⌛ *Aapka 10-minute ka Free Trial samapt ho gaya hai!*`
                        : `❌ *Your VIP Subscription has Expired!*`;
                    
                    await bot.sendMessage(sub.telegramId, msg, { parse_mode: 'Markdown' });
                } catch (err) {
                    console.error(`Kick error:`, err.message);
                }
            } else {
                if (!sub.isTrial && timeLeft <= oneDayMs) {
                    if (sub.remindersSent === undefined) sub.remindersSent = 0;
                    if (sub.remindersSent < 4) {
                        let hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
                        await bot.sendMessage(sub.telegramId, `⚠️ *REMINDER (${sub.remindersSent + 1}/4): Plan Expires Soon!*\nAapka plan *${hoursLeft} hours* me khatam hone wala hai.`, { parse_mode: 'Markdown' });
                        sub.remindersSent += 1;
                    }
                }
                updatedSubs.push(sub);
            }
        }
        saveSubscriptions(updatedSubs);
    } catch (error) {
        console.error("Cron Error:", error);
    }
}, 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running with Cashfree on port ${PORT}`));
