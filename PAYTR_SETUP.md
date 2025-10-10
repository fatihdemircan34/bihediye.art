# PayTR Ödeme Entegrasyonu - Kurulum Kılavuzu

## 📋 İçindekiler
1. [PayTR Hesap Ayarları](#paytr-hesap-ayarları)
2. [Proje Kurulumu](#proje-kurulumu)
3. [Test Etme](#test-etme)
4. [Prodüksiyon Geçişi](#prodüksiyon-geçişi)
5. [Sorun Giderme](#sorun-giderme)

---

## 1. PayTR Hesap Ayarları

### Adım 1: PayTR Merchant Panel'e Giriş
1. https://www.paytr.com adresinden merchant panel'e giriş yapın
2. **Bilgiler (INFORMATION)** sayfasına gidin
3. Aşağıdaki bilgileri not edin:
   - **Merchant ID** (Mağaza Numarası)
   - **Merchant Key** (Mağaza Şifresi)
   - **Merchant Salt** (Mağaza Gizli Anahtarı)

### Adım 2: iframe API'yi Aktif Edin
1. PayTR destek ekibi ile iletişime geçin
2. **iframe API** kullanmak istediğinizi belirtin
3. API erişimi onaylandıktan sonra kullanabilirsiniz

### Adım 3: Callback URL Ayarları
PayTR Panel'de callback URL'inizi ayarlayın:
```
https://yourdomain.com/payment/callback
```
⚠️ **ÖNEMLİ:** Callback URL public (herkese açık) olmalı!

---

## 2. Proje Kurulumu

### .env Dosyasını Güncelleyin

`.env` dosyanızı açın ve aşağıdaki satırları güncelleyin:

```env
# PayTR Payment Gateway Configuration
PAYTR_MERCHANT_ID=123456
PAYTR_MERCHANT_KEY=xxxxxxxxxxxxx
PAYTR_MERCHANT_SALT=yyyyyyyyyyyy
PAYTR_TEST_MODE=1

# Base URL (callback ve redirect için)
BASE_URL=https://yourdomain.com
```

### Test Modu için:
```env
PAYTR_TEST_MODE=1
```

### Prodüksiyon için:
```env
PAYTR_TEST_MODE=0
```

---

## 3. Test Etme

### Lokal Test (ngrok ile)

1. **ngrok Kurun ve Başlatın:**
```bash
ngrok http 3000
```

2. **ngrok URL'ini .env'ye Ekleyin:**
```env
BASE_URL=https://abc123.ngrok.io
```

3. **Sunucuyu Başlatın:**
```bash
npm run dev
```

4. **PayTR Callback URL'i Güncelleyin:**
PayTR Panel'de callback URL'i ngrok URL'iniz ile güncelleyin:
```
https://abc123.ngrok.io/payment/callback
```

### Test Kartları

PayTR test modunda aşağıdaki kartları kullanabilirsiniz:

**Başarılı İşlem:**
```
Kart No: 5528790000000008
SKT: 12/26
CVV: 000
3D Şifre: 123456
```

**Başarısız İşlem:**
```
Kart No: 4355084355084358
SKT: 12/26
CVV: 000
```

### Test Akışı

1. WhatsApp'tan "merhaba" yazın
2. Sipariş oluşturun
3. "Sipariş Ver" deyin
4. Gelen ödeme linkine tıklayın
5. Test kartı ile ödeme yapın
6. Ödeme sonrası WhatsApp'tan onay mesajı almalısınız

---

## 4. Prodüksiyon Geçişi

### Adım 1: Domain Ayarları
```env
BASE_URL=https://www.bihediye.art
PAYTR_TEST_MODE=0
```

### Adım 2: PayTR Callback URL
PayTR Panel'de callback URL'i güncelleyin:
```
https://www.bihediye.art/payment/callback
```

### Adım 3: SSL Sertifikası
⚠️ **Zorunlu!** Callback URL HTTPS olmalı.

### Adım 4: Test Edin
Prodüksiyona geçmeden önce:
- [ ] Gerçek kart ile test ödemesi yapın
- [ ] Callback'in geldiğini kontrol edin
- [ ] Sipariş işlemlerinin başladığını doğrulayın

---

## 5. Sorun Giderme

### Callback Gelmiyor

**Kontrol Listesi:**
- [ ] Callback URL public (herkese açık) mı?
- [ ] Callback URL HTTPS mi?
- [ ] PayTR Panel'de doğru URL girilmiş mi?
- [ ] Sunucu çalışıyor mu?
- [ ] Firewall callback URL'i engelliyor mu?

**Log Kontrolü:**
```bash
# Sunucu loglarını izleyin
npm run dev

# Callback geldiğinde şu log'u görmelisiniz:
# 📥 PayTR callback received: { merchant_oid: '...', status: 'success' }
```

### Hash Verification Failed

**Nedenleri:**
- Merchant Key yanlış
- Merchant Salt yanlış
- Hash algoritması hatalı

**Çözüm:**
```bash
# .env dosyasındaki bilgileri kontrol edin
PAYTR_MERCHANT_KEY=...
PAYTR_MERCHANT_SALT=...

# PayTR Panel'den tekrar kopyalayın
```

### Payment Token Oluşturulamıyor

**Kontrol Edin:**
```typescript
// Hata log'unda şunları görmelisiniz:
❌ PayTR token error: ...

// Nedenler:
// 1. API credentials yanlış
// 2. Sepet bilgisi hatalı
// 3. Hash yanlış
// 4. API erişimi yok (iframe API onayı gerekli)
```

### Ödeme Sayfası Açılmıyor

**Sebepler:**
- Token oluşturulmamış
- Sipariş bulunamıyor
- iframe URL hatalı

**Çözüm:**
```bash
# Sipariş detaylarını kontrol edin
curl http://localhost:3000/admin/orders

# paymentToken alanı dolu mu?
```

---

## 🔍 API Endpoints

### Ödeme Sayfası
```
GET /payment/:orderId
```
Müşteriye gönderilen link bu sayfayı açar.

### Callback (Webhook)
```
POST /payment/callback
```
PayTR ödeme sonucunu buraya gönderir.

### Başarı Sayfası
```
GET /payment/success?orderId=xxx
```
Ödeme başarılı olunca buraya yönlendirilir.

### Hata Sayfası
```
GET /payment/fail?orderId=xxx
```
Ödeme başarısız olunca buraya yönlendirilir.

---

## 📊 Ödeme Akışı Diyagramı

```
┌─────────────────┐
│  Kullanıcı      │
│  "Sipariş Ver"  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│  Order Service          │
│  - Sipariş oluştur      │
│  - Status: payment_pending
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  PayTR Service          │
│  - Token oluştur        │
│  - Hash hesapla         │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  WhatsApp               │
│  Ödeme linki gönder     │
│  /payment/:orderId      │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Kullanıcı              │
│  Link'e tıklar          │
│  Kart bilgilerini girer │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  PayTR iframe           │
│  Ödeme işlemi           │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  PayTR Callback         │
│  POST /payment/callback │
│  - Hash doğrula         │
│  - Status kontrol       │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Order Service          │
│  - Status: paid         │
│  - Müzik üretimi başlat │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  WhatsApp               │
│  Onay mesajı gönder     │
│  İşlem başladı          │
└─────────────────────────┘
```

---

## 🎯 Güvenlik Notları

1. **Hash Doğrulama:** Her callback'te hash mutlaka doğrulanmalı
2. **HTTPS:** Callback URL HTTPS olmalı
3. **Duplicate Check:** Aynı sipariş için birden fazla ödeme engellenme li
4. **Order Status:** Sadece `payment_pending` durumundaki siparişler işlenmeli
5. **Credentials:** `.env` dosyası asla git'e push edilmemeli

---

## 📞 Destek

- **PayTR Destek:** https://www.paytr.com/destek
- **PayTR Dokümantasyon:** https://dev.paytr.com
- **Proje Destek:** support@bihediye.art

---

## ✅ Checklist (Prodüksiyon Öncesi)

- [ ] PayTR merchant hesabı aktif
- [ ] iframe API erişimi onaylandı
- [ ] Merchant ID, Key, Salt alındı
- [ ] .env dosyası güncellendi
- [ ] SSL sertifikası kuruldu
- [ ] Callback URL ayarlandı
- [ ] Test ödemesi yapıldı
- [ ] Callback geldiği doğrulandı
- [ ] Sipariş işleme başladı
- [ ] WhatsApp bildirimleri çalışıyor
- [ ] Error handling test edildi
- [ ] Production ortamında test edildi

---

**Başarılar! 🎉**
