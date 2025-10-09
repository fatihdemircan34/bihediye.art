# bihediye.art - AI-Powered Music Gift Service

**Bird.com** WhatsApp API üzerinden çalışan, Minimax.io ve ChatGPT kullanarak kişiselleştirilmiş müzik ve video hediyeleri üreten TypeScript servisi.

## 🚀 Özellikler

- 🎵 **2 Özel Şarkı**: Her sipariş için 2 farklı şarkı üretimi
- ✍️ **ChatGPT Şarkı Sözleri**: OpenAI ile profesyonel şarkı sözü yazımı
- 🎼 **Minimax.io Müzik**: AI ile müzik üretimi
- 🎬 **Video Oluşturma**: Müzik + fotoğraftan video üretimi
- 📱 **Bird.com WhatsApp**: Sipariş ve teslimat WhatsApp üzerinden
- ⚡ **Asenkron İşleme**: Arka planda sipariş işleme
- 📊 **İlerleme Takibi**: Gerçek zamanlı durum güncellemeleri

## 📋 Sipariş Parametreleri

### Şarkı Bilgileri (2 Şarkı)
- **Tür**: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik
- **Tarz**: Romantik, Duygusal, Eğlenceli, Sakin
- **Vokal**: Kadın, Erkek, Fark etmez

### Hediye Bilgileri
- Hediye edilecek kişi (anne, baba, sevgili, arkadaş vb.)
- Şarkıda isim geçsin/geçmesin seçimi
- Kişinin adı (isim geçecekse)

### İçerik
- Şarkının hikayesi (max 900 karakter)
- Ek notlar (max 300 karakter)

### Teslimat Seçenekleri
- ✅ Ses Dosyası (ücretsiz)
- 💰 Müzik Platformu (SoundCloud) - +79 TL
- 💰 Video ile Teslim - +79 TL

### Fiyatlandırma
- **Temel**: 299 TL (2 şarkı)
- **SoundCloud**: +79 TL
- **Video**: +79 TL

## 🏗️ Proje Yapısı

```
bihediye.art/
├── src/
│   ├── api/
│   │   ├── order.routes.ts         # Sipariş endpoint'leri
│   │   └── webhook.routes.ts       # Bird.com webhook handler
│   ├── services/
│   │   ├── minimax.service.ts      # Minimax.io entegrasyonu
│   │   ├── openai.service.ts       # ChatGPT şarkı sözü yazımı
│   │   └── whatsapp.service.ts     # Bird.com WhatsApp API
│   ├── models/
│   │   └── order.model.ts          # Sipariş veri modelleri
│   ├── config/
│   │   └── config.ts               # Uygulama konfigürasyonu
│   └── index.ts                    # Ana uygulama
├── dist/                           # Compiled JavaScript
├── .env.example                    # Örnek environment variables
├── tsconfig.json
├── package.json
└── README.md
```

## 🔧 Kurulum

### Gereksinimler
- Node.js v18+
- npm veya yarn
- Minimax.io API key
- OpenAI API key
- Bird.com account ve WhatsApp channel

### Adımlar

```bash
# 1. Bağımlılıkları yükle
npm install

# 2. Environment variables ayarla
cp .env .env
# .env dosyasını düzenle ve API key'lerini ekle

# 3. TypeScript build
npm run build

# 4. Development modda çalıştır
npm run dev

# veya Production
npm start
```

## 🔑 Environment Variables

`.env` dosyası oluşturun:

```env
# Server
PORT=3000
NODE_ENV=development

# Minimax.io
MINIMAX_API_KEY=your_minimax_api_key
MINIMAX_BASE_URL=https://api.minimax.chat

# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4-turbo-preview

# Bird.com WhatsApp API
BIRD_ACCESS_KEY=your_bird_access_key
BIRD_WORKSPACE_ID=your_workspace_id
BIRD_CHANNEL_ID=your_channel_id
```

## 🐦 Bird.com Kurulumu

### 1. Bird.com Hesabı Oluşturun
- https://bird.com adresine gidin
- Ücretsiz hesap oluşturun

### 2. WhatsApp Channel Oluşturun
- Dashboard'da **Channels** > **Add Channel** > **WhatsApp**
- WhatsApp Business numaranızı doğrulayın
- Channel ID'yi kopyalayın

### 3. API Key Alın
- **Settings** > **API Keys** > **Create Access Key**
- Access Key'i kopyalayın
- `.env` dosyasına ekleyin

### 4. Webhook Ayarlayın
- **Settings** > **Webhooks** > **Add Webhook**
- **URL**: `https://yourdomain.com/webhook/bird`
- **Events**: Tüm message events'leri seçin
- **Save**

### 5. Test Edin
```bash
# Health check
curl http://localhost:3000/health

# Webhook test
curl -X POST http://localhost:3000/webhook/bird \
  -H "Content-Type: application/json" \
  -d '{"type":"message.received","contact":{"identifierValue":"+905551234567"}}'
```

## 📡 API Endpoints

### Health Check
```
GET /health
```

### Sipariş Oluşturma
```
POST /api/orders/create
Content-Type: application/json

{
  "whatsappPhone": "+905551234567",
  "song1": {
    "type": "Pop",
    "style": "Romantik",
    "vocal": "Kadın"
  },
  "song2": {
    "type": "Jazz",
    "style": "Sakin",
    "vocal": "Erkek"
  },
  "recipientRelation": "Sevgilim",
  "includeNameInSong": true,
  "recipientName": "Ayşe",
  "story": "Birlikte geçirdiğimiz güzel anılar...",
  "notes": "Akustik gitar olsun",
  "phone": "05551234567",
  "deliveryOptions": {
    "audioFile": true,
    "musicPlatform": false,
    "video": true
  },
  "coverPhoto": "https://example.com/photo.jpg"
}
```

### Sipariş Durumu
```
GET /api/orders/:orderId/status
```

### Bird.com Webhook
```
GET  /webhook/bird  (verification)
POST /webhook/bird  (events)
```

## 🔄 İş Akışı

1. **Sipariş Alınır** → Bird.com WhatsApp'a onay mesajı gönderilir
2. **Şarkı Sözleri Yazılır** → ChatGPT ile 2 şarkı sözü
3. **Müzik Üretilir** → Minimax.io ile müzik oluşturulur
4. **Video Oluşturulur** (seçildiyse) → Fotoğraf + müzik
5. **WhatsApp'a Gönderilir** → Bird.com ile ses dosyaları ve video

### İlerleme Mesajları
- ⏳ 10% - Şarkı sözleri yazılıyor
- ⏳ 40% - Müzikler oluşturuluyor
- ⏳ 70% - Müzikler hazır
- ⏳ 80% - Video oluşturuluyor
- ✅ 100% - Tamamlandı

## 🛠️ Development

```bash
# Development server (hot reload)
npm run dev

# Build TypeScript
npm run build

# Production
npm start

# Lint
npm run lint

# Format
npm run format
```

## 📦 Dependencies

### Runtime
- `express` - Web framework
- `axios` - HTTP client
- `dotenv` - Environment variables
- `cors` - CORS middleware
- `uuid` - Unique ID generation

### Development
- `typescript` - TypeScript compiler
- `ts-node-dev` - Development server
- `@types/*` - TypeScript definitions
- `eslint` - Linting
- `prettier` - Code formatting

## 🌐 API Entegrasyonları

### Bird.com WhatsApp API
- Message sending (text, media)
- Media sharing (audio, video, image, document)
- Webhook events handling
- Contact management

**Dokümantasyon**: https://docs.bird.com

**Dashboard**: https://dashboard.bird.com

**API Reference**: https://docs.bird.com/api-reference

### Minimax.io
- Music generation API
- Video generation API
- Task status polling

**Dokümantasyon**: https://minimax.io/docs

### OpenAI ChatGPT
- GPT-4 Turbo for lyrics generation
- Context-aware prompt engineering
- Turkish language support

**Dokümantasyon**: https://platform.openai.com/docs

## 🔐 Güvenlik

- API key'ler environment variables'da
- `.env` dosyası git'e commit edilmez
- Bird.com webhook verification
- CORS koruması
- Input validation
- Rate limiting (önerilir)

## 📊 Teslimat Süresi

- **Mesai Saatleri**: 2 saat içinde
- **Asenkron İşlem**: Arka planda üretim
- **Gerçek Zamanlı Takip**: Bird.com WhatsApp bildirimler

## 🚀 Production Deployment

### Heroku
```bash
heroku create bihediye-art
heroku config:set MINIMAX_API_KEY=xxx
heroku config:set OPENAI_API_KEY=xxx
heroku config:set BIRD_ACCESS_KEY=xxx
heroku config:set BIRD_WORKSPACE_ID=xxx
heroku config:set BIRD_CHANNEL_ID=xxx
git push heroku main
```

### Docker
```dockerfile
FROM node:18
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
# Build
docker build -t bihediye-art .

# Run
docker run -p 3000:3000 \
  -e MINIMAX_API_KEY=xxx \
  -e OPENAI_API_KEY=xxx \
  -e BIRD_ACCESS_KEY=xxx \
  bihediye-art
```

### DigitalOcean / VPS
```bash
# 1. SSH to server
ssh user@your-server

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Clone repository
git clone https://github.com/yourusername/bihediye.art.git
cd bihediye.art

# 4. Install dependencies
npm install

# 5. Create .env file
nano .env
# Paste your environment variables

# 6. Build
npm run build

# 7. Install PM2 for process management
sudo npm install -g pm2

# 8. Start application
pm2 start dist/index.js --name bihediye-art

# 9. Setup startup script
pm2 startup
pm2 save

# 10. Setup nginx reverse proxy (optional)
sudo apt install nginx
# Configure nginx to proxy port 3000
```

## 🔔 Bird.com Webhook Events

Bird.com gönderir:
- `message.received` - Müşteriden mesaj geldi
- `message.sent` - Mesaj gönderildi
- `message.delivered` - Mesaj teslim edildi
- `message.read` - Mesaj okundu
- `message.failed` - Mesaj gönderilemedi

## 📝 TODO

- [ ] Veritabank entegrasyonu (MongoDB/PostgreSQL)
- [ ] Sipariş geçmişi
- [ ] SoundCloud upload automation
- [ ] Ödeme entegrasyonu (Stripe/İyzico)
- [ ] Admin panel
- [ ] Analytics & reporting
- [ ] Rate limiting
- [ ] Retry logic for failed messages
- [ ] Order queue system (Bull/BullMQ)

## 🐛 Troubleshooting

### Bird.com connection issues
```bash
# Test Bird.com API
curl -X GET https://api.bird.com/workspaces \
  -H "Authorization: AccessKey YOUR_ACCESS_KEY"
```

### Webhook not receiving events
1. Bird.com Dashboard > Webhooks > Test webhook
2. Sunucunuzun public olduğundan emin olun
3. HTTPS kullanın (ngrok ile test edebilirsiniz)

### Minimax.io timeout
- Task polling interval'ını artırın
- `maxAttempts` değerini yükseltin

## 📄 License

Proprietary - All rights reserved

## 🤝 Support

Sorularınız için: support@bihediye.art

---

**Built with ❤️ using TypeScript, Bird.com, Minimax.io & ChatGPT**
