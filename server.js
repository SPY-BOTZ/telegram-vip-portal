require('dotenv').config();
const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
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

const razorpay = new Razorpay({
    key_id: RAZORPAY_KEY_ID,
    key_secret: RAZORPAY_KEY_SECRET
});

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false });

const DB_FILE = 'subscriptions.json';
function loadSubscriptions() {
    if (!fs.existsSync(DB_FILE)) return [];
    try { return JSON.parse(fs.readFileSync(DB_FILE)); } catch (e) { return []; }
}
function saveSubscriptions(subs) {
    fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
}

// 1. Create Order API (Handles ₹0 Free Trial Separately)
app.post('/create-order', async (req, res) => {
    try {
        const { channelKey, planKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];

        if(!channelData || !channelData.plans[planKey]) {
            return res.status(400).json({ success: false, message: "Invalid Channel or Plan" });
        }

        const selectedPlan = channelData.plans[planKey];

        // Agar Trial hai toh Razorpay order ki zaroorat nahi
        if (planKey === 'trial') {
            return res.json({ success: true, isTrial: true, planName: selectedPlan.name });
        }

        const options = {
            amount: selectedPlan.amount * 100,
            currency: "INR",
            receipt: `rcpt_${channelKey}_${planKey}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);
        res.json({ success: true, isTrial: false, order, planName: selectedPlan.name, amount: selectedPlan.amount });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

// 2. Direct Activate Trial API (No Payment Needed)
app.post('/activate-trial', async (req, res) => {
    try {
        const { telegramId, channelKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const selectedPlan = channelData.plans['trial'];

        // Check if user already took a trial for this channel to prevent abuse
        let subs = loadSubscriptions();
        const existingTrial = subs.find(s => s.telegramId === String(telegramId) && s.channelKey === channelKey && s.isTrial);
        if (existingTrial) {
            return res.json({ success: false, message: "Aapne is channel ka free trial pehle hi use kar liya hai!" });
        }

        // Generate Invite Link
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
            remindersSent: 4 // Skip reminders for trial
        });
        saveSubscriptions(subs);

        // Send link to user
        await bot.sendMessage(telegramId, `🎉 *10-MINUTES FREE TRIAL ACTIVATED!*\n\nChannel: *${channelData.name}*\n\nAapka trial link yeh raha (Sirf 10 minutes ke liye valid hai):\n${inviteLink.invite_link}\n\n_Note: 10 minutes baad aapko automatic channel se hata diya jayega._`, { parse_mode: 'Markdown' });

        // Send log to admin channel
        await bot.sendMessage(channelData.logId, `🚀 *NEW FREE TRIAL USER*\n\n👤 *User ID:* \`${telegramId}\`\n⏳ *Type:* 10 Mins Trial activated for ${channelData.name}`, { parse_mode: 'Markdown' });

        res.json({ success: true, invite_link: inviteLink.invite_link });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Trial Activation Failed" });
    }
});

// 3. Verify Normal Payment
app.post('/verify-payment', async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, telegramId, channelKey, planKey } = req.body;
        const channelData = CHANNELS_CONFIG[channelKey];
        const selectedPlan = channelData.plans[planKey];

        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto.createHmac('sha256', RAZORPAY_KEY_SECRET).update(body.toString()).digest('hex');

        if (expectedSignature === razorpay_signature) {
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
            res.status(400).json({ success: false, message: "Invalid Signature" });
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
                        ? `⌛ *Aapka 10-minute ka Free Trial samapt ho gaya hai!* \n\nChannel se aapko remove kar diya gaya hai. Pura maza lene ke liye abhi website se paid plan kharidein!`
                        : `❌ *Your VIP Subscription has Expired!* \n\nYou have been removed from the channel. Renew to regain access.`;
                    
                    await bot.sendMessage(sub.telegramId, msg, { parse_mode: 'Markdown' });
                } catch (err) {
                    console.error(`Kick error for ${sub.telegramId}:`, err.message);
                }
            } else {
                // Reminders logic for normal plans (1 day before expiry)
                if (!sub.isTrial && timeLeft <= oneDayMs) {
                    if (sub.remindersSent === undefined) sub.remindersSent = 0;
                    if (sub.remindersSent < 4) {
                        let hoursLeft = Math.ceil(timeLeft / (60 * 60 * 1000));
                        await bot.sendMessage(sub.telegramId, `⚠️ *REMINDER (${sub.remindersSent + 1}/4): Plan Expires Soon!*\n\nAapka plan *${hoursLeft} hours* me khatam hone wala hai. Kripya renew kar lein!`, { parse_mode: 'Markdown' });
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
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
