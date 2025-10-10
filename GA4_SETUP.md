# Google Analytics 4 (GA4) Setup Guide

## Why GA4?
- ✅ **FREE & UNLIMITED** - No cost, no limits
- ✅ **Real-time dashboard** - See events in seconds
- ✅ **Advanced reports** - Funnels, retention, demographics
- ✅ **No Firestore costs** - Uses GA4 API instead

## Setup Steps

### 1. Create GA4 Property

1. Go to: https://analytics.google.com
2. Click **Admin** (bottom left)
3. Click **Create Property**
4. Enter property details:
   - Property name: `bihediye.art`
   - Timezone: `Turkey`
   - Currency: `Turkish Lira (TRY)`
5. Click **Next** → **Create**

### 2. Create Data Stream

1. In Property settings, click **Data Streams**
2. Click **Add stream** → **Web**
3. Enter:
   - Website URL: `https://bihediye.art`
   - Stream name: `bihediye.art backend`
4. Click **Create stream**
5. **Copy the Measurement ID** (format: `G-XXXXXXXXXX`)

### 3. Get API Secret

1. In the Data Stream details page, scroll down
2. Click **Measurement Protocol API secrets**
3. Click **Create**
4. Enter nickname: `backend-server`
5. Click **Create**
6. **Copy the Secret value**

### 4. Update .env File

```bash
# Google Analytics 4 (GA4) Configuration
GA4_MEASUREMENT_ID=G-NKJFSX6SYY
GA4_API_SECRET=xuhnhhtQTGKvo29cOuIvYg
```

### 5. Rebuild and Restart

```bash
npm run build
pm2 restart all
```

### 6. Test

Send a WhatsApp message "merhaba" and check logs:
```bash
pm2 logs bihediye --lines 50
```

You should see:
```
✅ GA4 Analytics initialized
📊 Logging analytics event: conversation_started
✅ GA4 event logged: conversation_started
```

### 7. View Analytics

1. Go to: https://analytics.google.com
2. Select your property: `bihediye.art`
3. Click **Reports** → **Realtime**
4. You'll see events in **real-time** (within seconds!)

## Available Events

### Conversation Events
- `conversation_started` - New conversation started
- `conversation_completed` - Order confirmed
- `conversation_abandoned` - Order cancelled
- `song_type_selected` - User selected song type
- `song_style_selected` - User selected song style

### Payment Events
- `order_created` - Order created
- `payment_link_sent` - Payment link sent
- `purchase` - Payment completed (GA4 recommended event)

### Production Events
- `lyrics_generation_started` - Lyrics generation started
- `music_generation_started` - Music generation started
- `order_completed` - Order fully completed
- `order_delivered` - Files delivered to customer

## Custom Reports

### Conversion Funnel
1. Reports → Exploration
2. Create new exploration: **Funnel exploration**
3. Add steps:
   - conversation_started
   - song_type_selected
   - conversation_completed
   - payment_link_sent
   - purchase
   - order_delivered

### Revenue Report
- Go to: **Reports** → **Monetization** → **Purchase revenue**
- See total revenue, transactions, average order value

### User Behavior
- **Reports** → **Engagement** → **Events**
- See all events, users, engagement time

## Troubleshooting

### Events not showing?
1. Check logs: `pm2 logs bihediye`
2. Verify GA4_MEASUREMENT_ID and GA4_API_SECRET in .env
3. Wait 1-2 minutes (GA4 has slight delay)
4. Check GA4 Realtime view (not standard reports)

### Still not working?
- Verify Measurement ID format: `G-XXXXXXXXXX`
- Verify API Secret is correct (32+ characters)
- Check network: `curl https://www.google-analytics.com/mp/collect`

## Cost Comparison

| Service | Cost | Limits |
|---------|------|--------|
| Firestore | $0.06 per 100k reads | 50k free/day |
| GA4 | **FREE** | **Unlimited** |

**Savings:** ~$20-50/month for high-traffic apps!
