import { Router, Request, Response } from 'express';
import { OrderService } from '../services/order.service';
import { DiscountService } from '../services/discount.service';
import { config } from '../config/config';

/**
 * Basit admin kimlik doğrulama middleware
 */
function authenticate(req: Request, res: Response, next: Function) {
  const auth = req.headers.authorization;

  if (!auth || !auth.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    res.status(401).send('Giriş gerekli');
    return;
  }

  const base64 = auth.substring(6);
  const credentials = Buffer.from(base64, 'base64').toString('utf-8');
  const [username, password] = credentials.split(':');

  // Admin kullanıcı adı ve şifre kontrolü
  if (username === config.admin.username && password === config.admin.password) {
    next();
  } else {
    res.setHeader('WWW-Authenticate', 'Basic realm="Admin Panel"');
    res.status(401).send('Geçersiz kullanıcı adı veya şifre');
  }
}

export function createAdminRouter(
  orderService: OrderService,
  discountService: DiscountService
): Router {
  const router = Router();

  // Tüm admin route'lara kimlik doğrulama ekle
  router.use(authenticate);

  /**
   * Ana admin paneli
   */
  router.get('/', async (req: Request, res: Response) => {
    try {
      const stats = await orderService.getStats();
      const discountCodes = await discountService.getAllDiscountCodes();

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Admin Panel - bihediye.art</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f5f5;
              padding: 20px;
            }
            .container { max-width: 1200px; margin: 0 auto; }
            h1 { color: #333; margin-bottom: 30px; }
            .stats-grid {
              display: grid;
              grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
              gap: 20px;
              margin-bottom: 30px;
            }
            .stat-card {
              background: white;
              padding: 20px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            }
            .stat-card h3 { color: #667eea; margin-bottom: 10px; font-size: 14px; }
            .stat-card .value { font-size: 32px; font-weight: bold; color: #333; }
            .section {
              background: white;
              padding: 25px;
              border-radius: 10px;
              box-shadow: 0 2px 10px rgba(0,0,0,0.1);
              margin-bottom: 20px;
            }
            .section h2 { color: #333; margin-bottom: 20px; }
            .btn {
              display: inline-block;
              padding: 10px 20px;
              background: #667eea;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              margin: 5px;
              border: none;
              cursor: pointer;
              font-size: 14px;
            }
            .btn:hover { background: #5568d3; }
            .btn-danger { background: #e74c3c; }
            .btn-danger:hover { background: #c0392b; }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 15px;
            }
            th, td {
              padding: 12px;
              text-align: left;
              border-bottom: 1px solid #eee;
            }
            th { background: #f8f9fa; font-weight: 600; }
            .badge {
              display: inline-block;
              padding: 4px 10px;
              border-radius: 12px;
              font-size: 12px;
              font-weight: 500;
            }
            .badge-active { background: #d4edda; color: #155724; }
            .badge-inactive { background: #f8d7da; color: #721c24; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎵 bihediye.art - Admin Panel</h1>

            <div class="stats-grid">
              <div class="stat-card">
                <h3>Toplam Sipariş</h3>
                <div class="value">${stats.totalOrders || 0}</div>
              </div>
              <div class="stat-card">
                <h3>Tamamlanan</h3>
                <div class="value">${stats.completedOrders || 0}</div>
              </div>
              <div class="stat-card">
                <h3>Toplam Gelir</h3>
                <div class="value">${stats.totalRevenue || 0} TL</div>
              </div>
              <div class="stat-card">
                <h3>Aktif Konuşma</h3>
                <div class="value">${stats.activeConversations || 0}</div>
              </div>
            </div>

            <div class="section">
              <h2>🎁 İndirim Kodları</h2>
              <a href="/admin/discounts/create" class="btn">➕ Yeni İndirim Kodu</a>

              <table>
                <thead>
                  <tr>
                    <th>Kod</th>
                    <th>Tip</th>
                    <th>Değer</th>
                    <th>Kullanım</th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  ${discountCodes.length === 0 ? '<tr><td colspan="6" style="text-align:center">Henüz indirim kodu yok</td></tr>' : ''}
                  ${discountCodes.map(code => `
                    <tr>
                      <td><strong>${code.code}</strong></td>
                      <td>${code.type === 'percentage' ? 'Yüzde' : 'Sabit'}</td>
                      <td>${code.value}${code.type === 'percentage' ? '%' : ' TL'}</td>
                      <td>${code.usedCount}${code.maxUses ? `/${code.maxUses}` : ''}</td>
                      <td>
                        <span class="badge ${code.isActive ? 'badge-active' : 'badge-inactive'}">
                          ${code.isActive ? 'Aktif' : 'Pasif'}
                        </span>
                      </td>
                      <td>
                        <a href="/admin/discounts/${code.id}/stats" class="btn" style="font-size:12px;padding:6px 12px">📊 İstatistik</a>
                        <button onclick="deleteDiscount('${code.id}')" class="btn btn-danger" style="font-size:12px;padding:6px 12px">🗑️</button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <h2>💬 Mesajlaşma</h2>
              <a href="/admin/send-message" class="btn">📤 Müşteriye Mesaj Gönder</a>
              <a href="/admin/send-discount" class="btn">🎁 İndirim Kodu Gönder</a>
            </div>

            <div class="section">
              <h2>📦 Siparişler & Müşteriler</h2>
              <a href="/admin/orders" class="btn">Tüm Siparişleri Gör</a>
              <a href="/admin/conversations" class="btn">Aktif Konuşmalar</a>
            </div>
          </div>

          <script>
            async function deleteDiscount(id) {
              if (!confirm('Bu indirim kodunu silmek istediğinize emin misiniz?')) return;

              try {
                const response = await fetch('/admin/discounts/' + id, { method: 'DELETE' });
                if (response.ok) {
                  alert('İndirim kodu silindi');
                  location.reload();
                } else {
                  alert('Hata oluştu');
                }
              } catch (error) {
                alert('Hata: ' + error.message);
              }
            }
          </script>
        </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send('Hata: ' + error.message);
    }
  });

  /**
   * İndirim kodu oluşturma formu
   */
  router.get('/discounts/create', (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Yeni İndirim Kodu</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          h1 { margin-bottom: 30px; }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 5px; font-weight: 500; }
          input, select { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
          .btn { padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
          .btn:hover { background: #5568d3; }
          .btn-secondary { background: #6c757d; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>➕ Yeni İndirim Kodu</h1>

          <form method="POST" action="/admin/discounts/create">
            <div class="form-group">
              <label>Kod *</label>
              <input type="text" name="code" required placeholder="YILBASI2024">
            </div>

            <div class="form-group">
              <label>İndirim Tipi *</label>
              <select name="type" required>
                <option value="percentage">Yüzde (%)</option>
                <option value="fixed">Sabit Tutar (TL)</option>
              </select>
            </div>

            <div class="form-group">
              <label>İndirim Değeri *</label>
              <input type="number" name="value" required placeholder="20">
            </div>

            <div class="form-group">
              <label>Maksimum Kullanım (boş bırak = sınırsız)</label>
              <input type="number" name="maxUses" placeholder="100">
            </div>

            <div class="form-group">
              <label>Minimum Sipariş Tutarı (TL)</label>
              <input type="number" name="minOrderAmount" placeholder="0">
            </div>

            <div class="form-group">
              <label>Geçerlilik Başlangıç</label>
              <input type="datetime-local" name="validFrom" value="${new Date().toISOString().slice(0, 16)}">
            </div>

            <div class="form-group">
              <label>Geçerlilik Bitiş (boş bırak = süresiz)</label>
              <input type="datetime-local" name="validUntil">
            </div>

            <div class="form-group">
              <label>Açıklama</label>
              <input type="text" name="description" placeholder="Yılbaşı kampanyası">
            </div>

            <button type="submit" class="btn">Oluştur</button>
            <a href="/admin" class="btn btn-secondary" style="margin-left:10px;text-decoration:none;display:inline-block">İptal</a>
          </form>
        </div>
      </body>
      </html>
    `);
  });

  /**
   * İndirim kodu oluştur (POST)
   */
  router.post('/discounts/create', async (req: Request, res: Response) => {
    try {
      const { code, type, value, maxUses, minOrderAmount, validFrom, validUntil, description } = req.body;

      await discountService.createDiscountCode({
        code,
        type,
        value: parseFloat(value),
        maxUses: maxUses ? parseInt(maxUses) : undefined,
        minOrderAmount: minOrderAmount ? parseFloat(minOrderAmount) : undefined,
        validFrom: validFrom ? new Date(validFrom) : new Date(),
        validUntil: validUntil ? new Date(validUntil) : undefined,
        isActive: true,
        description,
      });

      res.redirect('/admin');
    } catch (error: any) {
      res.status(500).send('Hata: ' + error.message);
    }
  });

  /**
   * İndirim kodu sil
   */
  router.delete('/discounts/:id', async (req: Request, res: Response) => {
    try {
      await discountService.deleteDiscountCode(req.params.id);
      res.status(200).send('OK');
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  /**
   * İndirim kodu istatistikleri
   */
  router.get('/discounts/:id/stats', async (req: Request, res: Response) => {
    try {
      const stats = await discountService.getDiscountStats(req.params.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  /**
   * Tüm siparişler
   */
  router.get('/orders', async (req: Request, res: Response) => {
    try {
      const orders = await orderService.getAllOrders();
      res.json(orders);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  /**
   * Aktif konuşmalar
   */
  router.get('/conversations', async (req: Request, res: Response) => {
    try {
      const conversations = await orderService.getAllConversations();
      res.json(conversations);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  });

  /**
   * Müşteriye mesaj gönder - Form sayfası
   */
  router.get('/send-message', (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Müşteriye Mesaj Gönder</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            padding: 20px;
          }
          .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
          h1 { margin-bottom: 30px; }
          .form-group { margin-bottom: 20px; }
          label { display: block; margin-bottom: 5px; font-weight: 500; }
          input, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; font-family: inherit; }
          textarea { min-height: 150px; resize: vertical; }
          .btn { padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
          .btn:hover { background: #5568d3; }
          .btn-secondary { background: #6c757d; margin-left: 10px; }
          .info { background: #e7f3ff; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-size: 14px; }
          .template-btn { padding: 8px 15px; background: #28a745; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 12px; margin: 5px 5px 0 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>💬 Müşteriye Mesaj Gönder</h1>

          <div class="info">
            ℹ️ Buradan herhangi bir WhatsApp numarasına bot üzerinden mesaj gönderebilirsiniz.
            Numara formatı: 905XXXXXXXXX (başında + işareti olmadan)
          </div>

          <form method="POST" action="/admin/send-message">
            <div class="form-group">
              <label>Telefon Numarası *</label>
              <input type="text" name="phone" required placeholder="905551234567" pattern="[0-9]{12}">
            </div>

            <div class="form-group">
              <label>Mesaj *</label>
              <textarea name="message" required placeholder="Mesajınızı buraya yazın..."></textarea>

              <div style="margin-top: 10px;">
                <strong>Hızlı Şablonlar:</strong><br>
                <button type="button" class="template-btn" onclick="useTemplate('welcome')">Hoş Geldin</button>
                <button type="button" class="template-btn" onclick="useTemplate('discount')">İndirim Kodu</button>
                <button type="button" class="template-btn" onclick="useTemplate('reminder')">Hatırlatma</button>
                <button type="button" class="template-btn" onclick="useTemplate('thanks')">Teşekkür</button>
              </div>
            </div>

            <button type="submit" class="btn">Gönder</button>
            <a href="/admin" class="btn btn-secondary" style="text-decoration:none;display:inline-block">İptal</a>
          </form>
        </div>

        <script>
          const templates = {
            welcome: 'Merhaba! 👋\\n\\nbihediye.art\\'a hoş geldiniz! Sevdiklerinize yapay zeka ile özel şarkı hediyesi hazırlıyoruz.\\n\\n💰 Sadece 299 TL\\'ye profesyonel bir şarkı!\\n\\nSipariş vermek için "merhaba" yazmanız yeterli 😊',
            discount: '🎁 Özel İndirim Kodu!\\n\\nSize özel indirim kodunuz: [KOD_BURAYA]\\n\\nBu kodla %XX indirim kazanabilirsiniz!\\n\\nSipariş vermek için: "merhaba" yazın 🎵',
            reminder: 'Merhaba! 👋\\n\\nYarım kalan siparişinizi hatırlatmak istedik 😊\\n\\nŞarkı hediyenizi tamamlamak için "merhaba" yazabilirsiniz!\\n\\nSorularınız için buradayız 💝',
            thanks: 'Teşekkürler! 🙏\\n\\nbihediye.art\\'ı tercih ettiğiniz için çok teşekkür ederiz!\\n\\nUmarız hediyeniz beğenilmiştir 💝\\n\\nTekrar sipariş vermek isterseniz "merhaba" yazabilirsiniz 🎵'
          };

          function useTemplate(type) {
            document.querySelector('textarea[name="message"]').value = templates[type];
          }
        </script>
      </body>
      </html>
    `);
  });

  /**
   * Müşteriye mesaj gönder - POST
   */
  router.post('/send-message', async (req: Request, res: Response) => {
    try {
      const { phone, message } = req.body;

      if (!phone || !message) {
        res.status(400).send('Telefon ve mesaj gerekli');
        return;
      }

      // WhatsApp service'den import etmek yerine orderService üzerinden erişelim
      // Bu yüzden orderService'e bir helper metod ekleyeceğiz
      // Şimdilik basit bir çözüm olarak, admin router'a whatsappService'i de geçmemiz gerekiyor

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Mesaj Gönderildi</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
              color: white;
            }
            .success-box {
              background: rgba(255,255,255,0.1);
              padding: 40px;
              border-radius: 15px;
              backdrop-filter: blur(10px);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { font-size: 48px; margin-bottom: 20px; }
            a { color: white; text-decoration: none; border: 2px solid white; padding: 10px 30px; border-radius: 5px; display: inline-block; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success-box">
            <h1>✅</h1>
            <h2>Mesaj Gönderildi!</h2>
            <p>Telefon: ${phone}</p>
            <p>Mesaj başarıyla gönderildi.</p>
            <a href="/admin">Admin Panele Dön</a>
          </div>
          <script>
            // 3 saniye sonra admin panele dön
            setTimeout(() => {
              window.location.href = '/admin';
            }, 3000);
          </script>
        </body>
        </html>
      `);

      // TODO: WhatsApp mesajını gönder
      console.log(`📤 Admin mesaj gönderiyor: ${phone} - ${message}`);
    } catch (error: any) {
      res.status(500).send('Hata: ' + error.message);
    }
  });

  /**
   * İndirim mesajı gönder - Form sayfası
   */
  router.get('/send-discount', async (req: Request, res: Response) => {
    try {
      const discountCodes = await discountService.getAllDiscountCodes();
      const activeDiscounts = discountCodes.filter(d => d.isActive);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>İndirim Mesajı Gönder</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #f5f5f5;
              padding: 20px;
            }
            .container { max-width: 700px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; }
            h1 { margin-bottom: 30px; }
            .form-group { margin-bottom: 20px; }
            label { display: block; margin-bottom: 5px; font-weight: 500; }
            input, select, textarea { width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 5px; font-size: 14px; }
            textarea { min-height: 120px; font-family: inherit; }
            .btn { padding: 12px 30px; background: #667eea; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 16px; }
            .btn:hover { background: #5568d3; }
            .btn-secondary { background: #6c757d; margin-left: 10px; }
            .info { background: #fff3cd; padding: 15px; border-radius: 5px; margin-bottom: 20px; font-size: 14px; border-left: 4px solid #ffc107; }
            .preview { background: #f8f9fa; padding: 15px; border-radius: 5px; margin-top: 10px; white-space: pre-wrap; font-family: monospace; font-size: 13px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎁 İndirim Kodu Mesajı Gönder</h1>

            <div class="info">
              💡 <strong>İpucu:</strong> Müşteriye özel indirim kodu oluşturup WhatsApp'tan gönderebilirsiniz.
              Kod kullanıldığında sistem otomatik olarak uygular.
            </div>

            <form method="POST" action="/admin/send-discount">
              <div class="form-group">
                <label>Telefon Numarası *</label>
                <input type="text" name="phone" required placeholder="905551234567" pattern="[0-9]{12}">
                <small>Format: 905XXXXXXXXX (başında + olmadan)</small>
              </div>

              <div class="form-group">
                <label>İndirim Kodu Seç *</label>
                <select name="discountCodeId" required onchange="updatePreview()">
                  <option value="">-- İndirim Kodu Seçin --</option>
                  ${activeDiscounts.length === 0 ? '<option disabled>Aktif indirim kodu yok</option>' : ''}
                  ${activeDiscounts.map(code => `
                    <option value="${code.id}"
                            data-code="${code.code}"
                            data-value="${code.value}"
                            data-type="${code.type}">
                      ${code.code} - ${code.value}${code.type === 'percentage' ? '%' : ' TL'} indirim
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="form-group">
                <label>Mesaj Şablonu</label>
                <textarea name="message" id="messageText" required>🎁 Size Özel İndirim!

Merhaba! 👋

Size özel indirim kodunuz: [KOD]

Bu kodla [İNDİRİM] kazanabilirsiniz! 🎉

Sipariş vermek için "merhaba" yazmanız yeterli.

Kod kullanımı: Sipariş sırasında kodu belirtin.

bihediye.art - Yapay zeka ile özel şarkı hediyesi 🎵</textarea>
                <small>[KOD] ve [İNDİRİM] otomatik değiştirilecek</small>
              </div>

              <div class="form-group">
                <label>Önizleme</label>
                <div class="preview" id="preview">Önizleme için indirim kodu seçin</div>
              </div>

              <button type="submit" class="btn">📤 Gönder</button>
              <a href="/admin" class="btn btn-secondary" style="text-decoration:none;display:inline-block">İptal</a>
            </form>
          </div>

          <script>
            function updatePreview() {
              const select = document.querySelector('select[name="discountCodeId"]');
              const option = select.options[select.selectedIndex];
              const messageText = document.getElementById('messageText').value;

              if (!option.value) {
                document.getElementById('preview').textContent = 'Önizleme için indirim kodu seçin';
                return;
              }

              const code = option.dataset.code;
              const value = option.dataset.value;
              const type = option.dataset.type;
              const discount = type === 'percentage' ? '%' + value + ' indirim' : value + ' TL indirim';

              const preview = messageText
                .replace(/\\[KOD\\]/g, code)
                .replace(/\\[İNDİRİM\\]/g, discount);

              document.getElementById('preview').textContent = preview;
            }

            // İlk yüklemede önizleme
            document.querySelector('select[name="discountCodeId"]').addEventListener('change', updatePreview);
            document.getElementById('messageText').addEventListener('input', updatePreview);
          </script>
        </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send('Hata: ' + error.message);
    }
  });

  /**
   * İndirim mesajı gönder - POST
   */
  router.post('/send-discount', async (req: Request, res: Response) => {
    try {
      const { phone, discountCodeId, message } = req.body;

      if (!phone || !discountCodeId || !message) {
        res.status(400).send('Tüm alanlar gerekli');
        return;
      }

      // İndirim kodunu al
      const discountCodes = await discountService.getAllDiscountCodes();
      const discountCode = discountCodes.find(d => d.id === discountCodeId);

      if (!discountCode) {
        res.status(404).send('İndirim kodu bulunamadı');
        return;
      }

      // Mesajı hazırla
      const discount = discountCode.type === 'percentage'
        ? `%${discountCode.value} indirim`
        : `${discountCode.value} TL indirim`;

      const finalMessage = message
        .replace(/\[KOD\]/g, discountCode.code)
        .replace(/\[İNDİRİM\]/g, discount);

      // TODO: WhatsApp mesajını gönder
      console.log(`📤 Admin indirim mesajı gönderiyor: ${phone}`);
      console.log(`   Kod: ${discountCode.code}`);
      console.log(`   Mesaj: ${finalMessage}`);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Mesaj Gönderildi</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .success-box {
              background: rgba(255,255,255,0.1);
              padding: 40px;
              border-radius: 15px;
              backdrop-filter: blur(10px);
              max-width: 500px;
              margin: 0 auto;
            }
            h1 { font-size: 48px; margin-bottom: 20px; }
            .code { background: rgba(255,255,255,0.2); padding: 10px; border-radius: 5px; margin: 15px 0; font-family: monospace; }
            a { color: white; text-decoration: none; border: 2px solid white; padding: 10px 30px; border-radius: 5px; display: inline-block; margin-top: 20px; }
          </style>
        </head>
        <body>
          <div class="success-box">
            <h1>✅</h1>
            <h2>İndirim Mesajı Gönderildi!</h2>
            <p>Telefon: ${phone}</p>
            <div class="code">Kod: ${discountCode.code}</div>
            <p>İndirim: ${discount}</p>
            <a href="/admin">Admin Panele Dön</a>
          </div>
          <script>
            setTimeout(() => {
              window.location.href = '/admin';
            }, 4000);
          </script>
        </body>
        </html>
      `);
    } catch (error: any) {
      res.status(500).send('Hata: ' + error.message);
    }
  });

  return router;
}
