import { Router, Request, Response } from 'express';
import { PaytrService } from '../services/paytr.service';
import { OrderService } from '../services/order.service';

export function createPaymentRouter(
  paytrService: PaytrService,
  orderService: OrderService
): Router {
  const router = Router();

  /**
   * Başarılı ödeme sonrası yönlendirme sayfası
   * NOT: Bu route /:orderId'den ÖNCE olmalı!
   */
  router.get('/success', async (req: Request, res: Response) => {
    const { orderId } = req.query;

    // Get order details for gtag event parameters
    let orderAmount = 0;
    let orderCurrency = 'TRY';
    if (orderId && typeof orderId === 'string') {
      try {
        const order = await orderService.getOrder(orderId);
        if (order) {
          orderAmount = order.totalPrice;
        }
      } catch (error) {
        console.error('Error fetching order for gtag:', error);
      }
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ödeme Başarılı</title>

        <!-- Google tag (gtag.js) -->
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-NKJFSX6SYY"></script>
        <script>
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-NKJFSX6SYY');

          // Purchase event
          gtag('event', 'purchase', {
            transaction_id: '${orderId || ''}',
            value: ${orderAmount},
            currency: '${orderCurrency}',
            items: [{
              item_id: '${orderId || ''}',
              item_name: 'AI Generated Song',
              item_category: 'Music',
              price: ${orderAmount},
              quantity: 1
            }]
          });
        </script>

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
            padding: 60px 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            max-width: 600px;
            margin: 0 auto;
          }
          .success-icon {
            font-size: 80px;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 32px;
            margin-bottom: 20px;
          }
          p {
            font-size: 18px;
            line-height: 1.6;
            margin: 15px 0;
          }
          .order-id {
            background: rgba(255,255,255,0.2);
            padding: 15px;
            border-radius: 10px;
            margin: 20px 0;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="success-box">
          <div class="success-icon">✅</div>
          <h1>Ödeme Başarılı!</h1>
          <p>Ödemeniz başarıyla alındı.</p>
          ${orderId ? `<div class="order-id">Sipariş No: ${orderId}</div>` : ''}
          <p>Şarkınızın hazırlanmasına başlandı!</p>
          <p>WhatsApp üzerinden süreç hakkında bilgilendirileceksiniz.</p>
          <p style="margin-top: 30px; font-size: 16px;">🎵 bihediye.art ekibi olarak teşekkür ederiz!</p>
        </div>
      </body>
      </html>
    `);
  });

  /**
   * Başarısız ödeme sonrası yönlendirme sayfası
   * NOT: Bu route /:orderId'den ÖNCE olmalı!
   */
  router.get('/fail', (req: Request, res: Response) => {
    const { orderId } = req.query;
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ödeme Başarısız</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 50px;
            background: linear-gradient(135deg, #eb3349 0%, #f45c43 100%);
            color: white;
          }
          .fail-box {
            background: rgba(255,255,255,0.1);
            padding: 60px 40px;
            border-radius: 20px;
            backdrop-filter: blur(10px);
            max-width: 600px;
            margin: 0 auto;
          }
          .fail-icon {
            font-size: 80px;
            margin-bottom: 20px;
          }
          h1 {
            font-size: 32px;
            margin-bottom: 20px;
          }
          p {
            font-size: 18px;
            line-height: 1.6;
            margin: 15px 0;
          }
          .retry-button {
            display: inline-block;
            margin-top: 30px;
            padding: 15px 40px;
            background: white;
            color: #eb3349;
            text-decoration: none;
            border-radius: 10px;
            font-weight: bold;
            font-size: 18px;
          }
        </style>
      </head>
      <body>
        <div class="fail-box">
          <div class="fail-icon">❌</div>
          <h1>Ödeme Başarısız</h1>
          <p>Ödemeniz gerçekleştirilemedi.</p>
          <p>Lütfen kart bilgilerinizi kontrol edip tekrar deneyin.</p>
          ${orderId ? `<a href="/payment/${orderId}" class="retry-button">Tekrar Dene</a>` : ''}
          <p style="margin-top: 30px; font-size: 14px;">Sorun devam ederse destek@bihediye.art ile iletişime geçin.</p>
        </div>
      </body>
      </html>
    `);
  });

  /**
   * PayTR Callback/Webhook Endpoint
   * PayTR buraya ödeme sonucunu POST eder
   */
  router.post('/callback', async (req: Request, res: Response): Promise<void> => {
    try {
      console.log('📥 PayTR callback received:', {
        merchant_oid: req.body.merchant_oid,
        status: req.body.status,
      });

      const callback = req.body;

      // Hash doğrula
      const isValid = paytrService.verifyCallback(callback);

      if (!isValid) {
        console.error('❌ PayTR callback hash verification failed');
        res.status(400).send('OK'); // Yine de "OK" dön (PayTR için)
        return;
      }

      // Ödeme başarılı mı?
      if (paytrService.isPaymentSuccessful(callback)) {
        console.log(`✅ Payment successful for order: ${callback.merchant_oid}`);

        // Ödemeyi işle ve siparişi başlat
        await orderService.handlePaymentSuccess(callback.merchant_oid);

        // Transaction ID kaydet
        const amount = paytrService.convertToTL(callback.total_amount);
        console.log(`💰 Payment amount: ${amount} TL`);

      } else {
        console.error(`❌ Payment failed for order: ${callback.merchant_oid}`, {
          reason_code: callback.failed_reason_code,
          reason_msg: callback.failed_reason_msg,
        });

        // Başarısız ödeme durumunda sipariş iptal edilmeli
        // (opsiyonel: kullanıcıya bildirim gönder)
      }

      // PayTR'ye MUTLAKA "OK" yanıtı ver (plain text)
      res.send('OK');
    } catch (error: any) {
      console.error('PayTR callback error:', error.message);
      // Hata olsa bile "OK" dön (PayTR için)
      res.send('OK');
    }
  });

  /**
   * Ödeme sayfası (iframe gösterir)
   * GET /payment/:orderId
   */
  router.get('/:orderId', async (req: Request, res: Response): Promise<void> => {
    try {
      const { orderId } = req.params;

      // Siparişi getir
      const order = await orderService.getOrder(orderId);

      if (!order) {
        res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sipariş Bulunamadı</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .error-box {
                background: rgba(255,255,255,0.1);
                padding: 40px;
                border-radius: 15px;
                backdrop-filter: blur(10px);
              }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h1>❌ Sipariş Bulunamadı</h1>
              <p>Bu sipariş mevcut değil veya silinmiş.</p>
            </div>
          </body>
          </html>
        `);
        return;
      }

      // Ödeme token kontrolü
      if (!order.paymentToken) {
        res.status(400).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ödeme Hatası</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                text-align: center;
                padding: 50px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
              }
              .error-box {
                background: rgba(255,255,255,0.1);
                padding: 40px;
                border-radius: 15px;
                backdrop-filter: blur(10px);
              }
            </style>
          </head>
          <body>
            <div class="error-box">
              <h1>⚠️ Ödeme Token Bulunamadı</h1>
              <p>Bu sipariş için ödeme linki oluşturulmamış.</p>
            </div>
          </body>
          </html>
        `);
        return;
      }

      // Ödeme zaten tamamlanmış mı?
      if (order.status !== 'payment_pending') {
        res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Ödeme Tamamlandı</title>
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
              }
            </style>
          </head>
          <body>
            <div class="success-box">
              <h1>✅ Ödeme Tamamlandı</h1>
              <p>Bu sipariş için ödeme zaten alınmış.</p>
              <p>Sipariş Durumu: <strong>${order.status}</strong></p>
            </div>
          </body>
          </html>
        `);
        return;
      }

      // PayTR iframe URL
      const iframeUrl = paytrService.getIframeUrl(order.paymentToken);

      // Ödeme sayfası HTML
      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Ödeme - bihediye.art</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            html, body {
              height: 100%;
              overflow: hidden;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
              background: #667eea;
            }
            .container {
              width: 100%;
              height: 100vh;
              display: flex;
              flex-direction: column;
            }
            .top-bar {
              background: rgba(255,255,255,0.15);
              backdrop-filter: blur(10px);
              padding: 8px 15px;
              display: flex;
              justify-content: space-between;
              align-items: center;
              color: white;
              font-size: 12px;
              flex-shrink: 0;
            }
            .top-bar .left {
              font-weight: 600;
            }
            .top-bar .right {
              opacity: 0.9;
            }
            .payment-container {
              flex: 1;
              background: white;
              overflow: hidden;
            }
            iframe {
              width: 100%;
              height: 100%;
              border: none;
            }
            @media (max-width: 768px) {
              .top-bar {
                font-size: 11px;
                padding: 6px 12px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="top-bar">
              <div class="left">🎵 bihediye.art - ${order.orderData.song1.type} Şarkı (${order.totalPrice} TL)</div>
              <div class="right">🔒 PayTR Güvenli Ödeme</div>
            </div>

            <div class="payment-container">
              <iframe src="${iframeUrl}" id="paytriframe"></iframe>
            </div>
          </div>

          <script>
            // iframe yükleme kontrolü
            window.addEventListener('message', function(event) {
              if (event.data === 'payment_success') {
                alert('✅ Ödeme başarılı! WhatsApp üzerinden bilgilendirileceksiniz.');
                window.location.href = '/payment/success?orderId=${order.id}';
              }
            });
          </script>
        </body>
        </html>
      `);
    } catch (error: any) {
      console.error('Payment page error:', error);
      res.status(500).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Hata</title>
        </head>
        <body>
          <h1>Bir hata oluştu</h1>
          <p>${error.message}</p>
        </body>
        </html>
      `);
    }
  });

  return router;
}
