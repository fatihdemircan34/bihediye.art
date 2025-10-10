import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { config, validateConfig } from './config/config';
import { SunoService } from './services/suno.service';
import { OpenAIService } from './services/openai.service';
import { WhatsAppService } from './services/whatsapp.service';
import { FirebaseService } from './services/firebase.service';
import { FirebaseQueueService } from './services/firebase-queue.service';
import { PaytrService } from './services/paytr.service';
import { OrderService } from './services/order.service';
import { DiscountService } from './services/discount.service';
import { OrderRoutes } from './api/order.routes';
import { WebhookRoutes } from './api/webhook.routes';
import { createPaymentRouter } from './routes/payment.routes';
import { createAdminRouter } from './routes/admin.routes';

class App {
  private app: Express;
  private sunoService: SunoService;
  private openaiService: OpenAIService;
  private whatsappService: WhatsAppService;
  private firebaseService: FirebaseService;
  private queueService: FirebaseQueueService;
  private paytrService?: PaytrService;
  private orderService: OrderService;
  private discountService: DiscountService;

  constructor() {
    this.app = express();
    this.validateEnvironment();
    this.initializeMiddlewares();
    this.initializeServices();
    this.initializeRoutes();
  }

  private validateEnvironment(): void {
    try {
      validateConfig();
      console.log('✅ Configuration validated successfully');
    } catch (error) {
      console.error('❌ Configuration error:', error);
      process.exit(1);
    }
  }

  private initializeMiddlewares(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private initializeServices(): void {
    // Initialize Suno AI service
    this.sunoService = new SunoService({
      apiKey: config.suno.apiKey,
      baseUrl: config.suno.baseUrl,
    });

    // Initialize OpenAI service
    this.openaiService = new OpenAIService({
      apiKey: config.openai.apiKey,
      model: config.openai.model,
    });

    // Initialize Bird.com WhatsApp service
    this.whatsappService = new WhatsAppService({
      accessKey: config.bird.accessKey,
      workspaceId: config.bird.workspaceId,
      channelId: config.bird.channelId,
    });

    // Initialize Firebase service
    this.firebaseService = new FirebaseService(config.firebase.serviceAccountPath);

    // Initialize Firebase Queue service (for async music generation)
    // Uses Firebase for persistence - no Redis required!
    console.log('🔄 Initializing Firebase Queue service...');
    this.queueService = new FirebaseQueueService(
      this.sunoService,
      this.firebaseService,
      this.whatsappService
    );
    console.log('✅ Firebase Queue service initialized - async mode enabled');

    // Initialize PayTR service (if credentials provided)
    if (config.paytr.merchantId && config.paytr.merchantId !== 'your_merchant_id') {
      this.paytrService = new PaytrService({
        merchantId: config.paytr.merchantId,
        merchantKey: config.paytr.merchantKey,
        merchantSalt: config.paytr.merchantSalt,
        testMode: config.paytr.testMode,
      });
      console.log('✅ PayTR service initialized (payment gateway enabled)');
      console.log(`   Merchant ID: ${config.paytr.merchantId}`);
      console.log(`   Test Mode: ${config.paytr.testMode}`);
      console.log(`   Base URL: ${config.paytr.baseUrl}`);
    } else {
      console.warn('⚠️  PayTR credentials not configured - payment gateway disabled');
      console.warn('   Orders will be processed without payment');
      console.warn('   Set PAYTR_MERCHANT_ID, PAYTR_MERCHANT_KEY, PAYTR_MERCHANT_SALT in .env');
    }

    // Initialize Discount service
    this.discountService = new DiscountService(this.firebaseService);

    // Initialize Order service (manages conversations and orders)
    this.orderService = new OrderService(
      this.sunoService,
      this.openaiService,
      this.whatsappService,
      this.firebaseService,
      this.queueService,
      this.paytrService
    );

    console.log('✅ Services initialized successfully');
    console.log('📊 Firebase collections:');
    console.log('   - bihediye_orders');
    console.log('   - bihediye_conversations');
    console.log('   - bihediye_users');
    console.log('   - bihediye_analytics');
    console.log('   - bihediye_music_queue (async job processing)');
  }

  private initializeRoutes(): void {
    // Serve static files from public directory
    this.app.use(express.static('public'));

    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          suno: !!config.suno.apiKey,
          openai: !!config.openai.apiKey,
          bird: !!config.bird.accessKey,
          firebase: true,
        },
      });
    });

    // Webhook routes
    const webhookRoutes = new WebhookRoutes();
    webhookRoutes.setOrderService(this.orderService); // Connect webhook to order service
    this.app.use('/webhook', webhookRoutes.router);

    // Payment routes (PayTR callback and payment pages)
    if (this.paytrService) {
      const paymentRouter = createPaymentRouter(this.paytrService, this.orderService);
      this.app.use('/payment', paymentRouter);
      console.log('✅ Payment routes initialized (/payment/*)');
    }

    // Admin panel routes
    const adminRouter = createAdminRouter(this.orderService, this.discountService, this.whatsappService);
    this.app.use('/admin', adminRouter);
    console.log('✅ Admin panel initialized (/admin)');

    // API routes (for manual order creation if needed)
    const orderRoutes = new OrderRoutes(
      this.sunoService,
      this.openaiService,
      this.whatsappService
    );
    this.app.use('/api/orders', orderRoutes.router);

    // Admin endpoints
    this.app.get('/admin/orders', async (req: Request, res: Response) => {
      try {
        const orders = await this.orderService.getAllOrders();
        res.json({
          total: orders.length,
          orders: orders.map(o => ({
            id: o.id,
            phone: o.whatsappPhone,
            status: o.status,
            totalPrice: o.totalPrice,
            createdAt: o.createdAt,
          })),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/admin/conversations', async (req: Request, res: Response) => {
      try {
        const conversations = await this.orderService.getAllConversations();
        res.json({
          total: conversations.length,
          conversations: conversations.map(c => ({
            phone: c.phone,
            step: c.step,
            lastUpdated: c.lastUpdated,
          })),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get('/admin/stats', async (req: Request, res: Response) => {
      try {
        const stats = await this.orderService.getStats();

        // Add queue stats
        const queueStats = await this.queueService.getQueueStats();
        stats.queue = queueStats;

        res.json(stats);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        error: 'Not found',
        path: req.path,
      });
    });

    // Error handler
    this.app.use((err: Error, req: Request, res: Response, next: any) => {
      console.error('Error:', err);
      res.status(500).json({
        error: 'Internal server error',
        message: config.nodeEnv === 'development' ? err.message : undefined,
      });
    });

    console.log('✅ Routes initialized successfully');
  }

  public listen(): void {
    this.app.listen(config.port, () => {
      console.log('\n🎁 ================================================');
      console.log('🎵 bihediye.art - AI-Powered Music Gift Service');
      console.log('================================================');
      console.log(`🌍 Environment: ${config.nodeEnv}`);
      console.log(`🚀 Server running on port ${config.port}`);
      console.log(`📍 Health check: http://localhost:${config.port}/health`);
      console.log(`📱 Bird.com webhook: http://localhost:${config.port}/webhook/bird`);
      if (this.paytrService) {
        console.log(`💳 PayTR callback: http://localhost:${config.port}/payment/callback`);
      }
      console.log(`👨‍💼 Admin:`)
      console.log(`   - Orders: http://localhost:${config.port}/admin/orders`);
      console.log(`   - Conversations: http://localhost:${config.port}/admin/conversations`);
      console.log(`   - Stats: http://localhost:${config.port}/admin/stats`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);
      console.log('\n💬 WhatsApp Bot Ready!');
      console.log('   Müşteriler "merhaba" yazarak sipariş başlatabilir');
      console.log('   🔥 Firebase ile state yönetimi aktif');
      console.log('================================================\n');
    });
  }
}

// Start the application
const app = new App();
app.listen();

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  console.log('Closing Firebase queue service...');
  await app['queueService'].close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  console.log('Closing Firebase queue service...');
  await app['queueService'].close();
  process.exit(0);
});
