# Telegram VIP Portal Bot 👑

This is an advanced Telegram Subscription Bot that handles FSub (Force Subscribe), WebApp Payment Integrations (UPI Intent), Admin Approvals, and Auto-Kick upon expiration.

## 🛠 Features For Admin
1. **FSub**: Naye users ko pehle free channel join karna hoga, uske bina menu nahi khulega.
2. **Web App Payment**: Bot ke andar hi ek mini website khulegi, jahan se user direct GPay/PhonePe me bhej diya jayega.
3. **Screenshot Approval System**: Payment ke baad bot screenshot mangega, jo seedhe aapke 'Admin Log Channel' me jayega 2 buttons ke saath (`Approve` / `Reject`).
4. **Auto Generate Links**: Approve karne par bot khud ek 1-time join link banayega (12-hour expiry) aur user ko bhej dega.
5. **Auto-Kick**: Time pura hone par bot khud usko VIP channel se nikal (kick) dega.
6. **Reminders**: Expiry se 24 ghante pehle user ko 5 baar auto-message jayega renew karne ke liye.

## 💬 Admin Commands
- `/stats` - Kitne logo ne start kiya hai aur kitne premium par hain.
- `/broadcast <message>` - Sabhi logo ko ek saath message bhejne ke liye.
- `/addpremium <user_id> <days>` - Kisi dost ko bina payment ke VIP dena ho (e.g. `/addpremium 12345678 30`)
- `/removepremium <user_id>` - Kisi ko VIP se nikalne ke liye.

## ⚙️ Koyeb Setup Variables
Koyeb mein `Environment Variables` ke andar ye 6 daalna zaroori hai:
- `BOT_TOKEN`: Telegram se mila bot token.
- `ADMIN_ID`: Aapki personal telegram ID (Commands chalane ke liye).
- `ADMIN_CHANNEL_ID`: Jis group/channel mein payment screenshot aayenge (ex: `-100123...`).
- `FSUB_CHANNEL_ID`: Free channel username (ex: `@technicalseekho`).
- `PAID_CHANNEL_ID`: Asli VIP channel ki ID (ex: `-100987...`).
- `WEBAPP_URL`: Aapki Koyeb website ka link (ex: `https://myapp.koyeb.app`) bina / ke.
