// @ts-nocheck
import Bull, { Queue, Job } from 'bull';
import { MinimaxService, MusicGenerationRequest } from './minimax.service';
import { FirebaseService } from './firebase.service';
import { WhatsAppService } from './whatsapp.service';

export interface MusicGenerationJob {
  orderId: string;
  phoneNumber: string;
  songIndex: number;
  request: MusicGenerationRequest;
}

export class QueueService {
  private musicQueue: Queue<MusicGenerationJob>;
  private minimaxService: MinimaxService;
  private firebaseService: FirebaseService;
  private whatsappService: WhatsAppService;

  constructor(
    minimaxService: MinimaxService,
    firebaseService: FirebaseService,
    whatsappService: WhatsAppService,
    redisUrl?: string
  ) {
    this.minimaxService = minimaxService;
    this.firebaseService = firebaseService;
    this.whatsappService = whatsappService;

    // Initialize Bull queue with Redis
    this.musicQueue = new Bull<MusicGenerationJob>('music-generation', redisUrl || 'redis://127.0.0.1:6379', {
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 10000, // 10 seconds
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });

    // Set up queue event handlers
    this.setupQueueHandlers();

    // Process jobs in the queue
    this.musicQueue.process(this.processMusicGeneration.bind(this));
  }

  /**
   * Add music generation job to queue
   */
  async addMusicGenerationJob(jobData: MusicGenerationJob): Promise<Job<MusicGenerationJob>> {
    console.log(`📥 Adding music generation job to queue:`, {
      orderId: jobData.orderId,
      songIndex: jobData.songIndex,
    });

    const job = await this.musicQueue.add(jobData, {
      jobId: `${jobData.orderId}-song${jobData.songIndex}`,
      timeout: 600000, // 10 minutes max per job
    });

    // Notify user that job is queued
    await this.whatsappService.sendProgressUpdate(
      jobData.phoneNumber,
      jobData.orderId,
      `Şarkı ${jobData.songIndex} hazırlanmaya başlandı...`,
      jobData.songIndex === 1 ? 25 : 75
    );

    return job;
  }

  /**
   * Process music generation job
   */
  private async processMusicGeneration(job: Job<MusicGenerationJob>): Promise<void> {
    const { orderId, phoneNumber, songIndex, request } = job.data;

    console.log(`🎵 Processing music generation job:`, {
      jobId: job.id,
      orderId,
      songIndex,
      attempt: job.attemptsMade + 1,
    });

    try {
      // Update progress
      await job.progress(10);

      // Send status update to user
      await this.whatsappService.sendProgressUpdate(
        phoneNumber,
        orderId,
        `Şarkı ${songIndex} için müzik oluşturuluyor...`,
        songIndex === 1 ? 30 : 80
      );

      // Generate music using Minimax
      await job.progress(30);
      const musicResult = await this.minimaxService.generateMusic(request);

      console.log(`✅ Music generated successfully for job ${job.id}`);

      // Check if music generation was successful
      if (musicResult.status !== 'Success' || !musicResult.file_url) {
        throw new Error('Music generation failed - no file URL returned');
      }

      await job.progress(70);

      // Update order in Firebase
      const order = await this.firebaseService.getOrder(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Save music URL to order
      if (songIndex === 1) {
        order.song1.audioUrl = musicResult.file_url;
        order.song1.status = 'completed';
      }

      order.status = 'completed';
      await this.firebaseService.updateOrder(orderId, order);

      await job.progress(90);

      // Send music file to user via WhatsApp
      console.log(`📤 Sending music file to user...`);
      await this.whatsappService.sendAudioMessage(phoneNumber, musicResult.file_url);

      await job.progress(100);

      // Send completion message
      await this.whatsappService.sendOrderCompletion(phoneNumber, orderId);

      console.log(`🎉 Job ${job.id} completed successfully`);

    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, {
        error: error.message,
        orderId,
        songIndex,
        attempt: job.attemptsMade + 1,
      });

      // If this is the last attempt, notify user
      if (job.attemptsMade + 1 >= 3) {
        console.error(`❌ Job ${job.id} failed after 3 attempts - notifying user`);
        await this.whatsappService.sendErrorMessage(
          phoneNumber,
          orderId,
          'Music generation failed after multiple attempts'
        );

        // Update order status to failed
        await this.firebaseService.updateOrder(orderId, {
          status: 'failed',
          error: error.message,
        });
      }

      throw error; // Re-throw to trigger Bull's retry mechanism
    }
  }

  /**
   * Setup queue event handlers for monitoring
   */
  private setupQueueHandlers(): void {
    this.musicQueue.on('completed', (job: Job) => {
      console.log(`✅ Queue: Job ${job.id} completed`);
    });

    this.musicQueue.on('failed', (job: Job, error: Error) => {
      console.error(`❌ Queue: Job ${job.id} failed:`, {
        error: error.message,
        attempts: job.attemptsMade,
      });
    });

    this.musicQueue.on('stalled', (job: Job) => {
      console.warn(`⚠️ Queue: Job ${job.id} stalled`);
    });

    this.musicQueue.on('progress', (job: Job, progress: number) => {
      console.log(`📊 Queue: Job ${job.id} progress: ${progress}%`);
    });

    this.musicQueue.on('waiting', (jobId: string) => {
      console.log(`⏳ Queue: Job ${jobId} waiting to be processed`);
    });

    this.musicQueue.on('active', (job: Job) => {
      console.log(`▶️ Queue: Job ${job.id} started processing`);
    });
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<Job<MusicGenerationJob> | null> {
    return await this.musicQueue.getJob(jobId);
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.musicQueue.getWaitingCount(),
      this.musicQueue.getActiveCount(),
      this.musicQueue.getCompletedCount(),
      this.musicQueue.getFailedCount(),
      this.musicQueue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  /**
   * Clean up old jobs
   */
  async cleanup(): Promise<void> {
    await this.musicQueue.clean(3600000); // Remove completed jobs older than 1 hour
    await this.musicQueue.clean(86400000, 'failed'); // Remove failed jobs older than 24 hours
  }

  /**
   * Close queue connection
   */
  async close(): Promise<void> {
    await this.musicQueue.close();
  }
}
