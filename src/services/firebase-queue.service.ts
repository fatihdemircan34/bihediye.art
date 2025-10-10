import { SunoService, MusicGenerationRequest } from './suno.service';
import { FirebaseService } from './firebase.service';
import { WhatsAppService } from './whatsapp.service';

export interface MusicGenerationJob {
  id: string;
  orderId: string;
  phoneNumber: string;
  songIndex: number;
  request: MusicGenerationRequest;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  attempts: number;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  processingStartedAt?: Date;
  completedAt?: Date;
}

/**
 * Firebase-based queue service for music generation
 * Uses Firestore for persistence and state management
 * No Redis required - restart-safe with Firebase
 */
export class FirebaseQueueService {
  private sunoService: SunoService;
  private firebaseService: FirebaseService;
  private whatsappService: WhatsAppService;
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;
  private readonly COLLECTION = 'bihediye_music_queue';
  private readonly POLL_INTERVAL = 2000; // 2 seconds
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    sunoService: SunoService,
    firebaseService: FirebaseService,
    whatsappService: WhatsAppService
  ) {
    this.sunoService = sunoService;
    this.firebaseService = firebaseService;
    this.whatsappService = whatsappService;

    // Start processing jobs
    this.startProcessing();
  }

  /**
   * Add music generation job to queue
   */
  async addMusicGenerationJob(jobData: Omit<MusicGenerationJob, 'id' | 'status' | 'progress' | 'attempts' | 'createdAt' | 'updatedAt'>): Promise<MusicGenerationJob> {
    const job: MusicGenerationJob = {
      ...jobData,
      id: `${jobData.orderId}-song${jobData.songIndex}`,
      status: 'pending',
      progress: 0,
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    console.log(`📥 Adding music generation job to Firebase queue:`, {
      jobId: job.id,
      orderId: job.orderId,
      songIndex: job.songIndex,
    });

    // Save to Firebase
    const db = this.firebaseService.getDb();
    await db.collection(this.COLLECTION).doc(job.id).set({
      ...job,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // NO user notification here - will be sent when processing starts
    console.log(`✅ Job added to queue: ${job.id}`);

    return job;
  }

  /**
   * Start processing jobs from Firebase queue
   */
  private startProcessing(): void {
    console.log('🔄 Starting Firebase queue processor...');

    this.processingInterval = setInterval(async () => {
      if (this.isProcessing) {
        return; // Already processing a job
      }

      try {
        await this.processNextJob();
      } catch (error: any) {
        console.error('Queue processor error:', error.message);
      }
    }, this.POLL_INTERVAL);
  }

  /**
   * Process next pending job from queue
   */
  private async processNextJob(): Promise<void> {
    const db = this.firebaseService.getDb();

    // Get next pending job (oldest first)
    // NOTE: Removed orderBy to avoid composite index requirement
    // Jobs are processed in the order they are returned (fast enough for our use case)
    const snapshot = await db
      .collection(this.COLLECTION)
      .where('status', '==', 'pending')
      .limit(1)
      .get();

    if (snapshot.empty) {
      return; // No pending jobs
    }

    const jobDoc = snapshot.docs[0];
    const job = jobDoc.data() as MusicGenerationJob;
    job.createdAt = new Date(job.createdAt);
    job.updatedAt = new Date(job.updatedAt);

    // Mark as processing
    this.isProcessing = true;
    job.status = 'processing';
    job.processingStartedAt = new Date();
    job.attempts += 1;
    job.updatedAt = new Date();

    await db.collection(this.COLLECTION).doc(job.id).update({
      status: 'processing',
      processingStartedAt: job.processingStartedAt.toISOString(),
      attempts: job.attempts,
      updatedAt: job.updatedAt.toISOString(),
    });

    console.log(`▶️  Processing job ${job.id} (attempt ${job.attempts})`);

    try {
      await this.processMusicGeneration(job);
    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, error.message);
      await this.handleJobFailure(job, error);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process music generation job
   */
  private async processMusicGeneration(job: MusicGenerationJob): Promise<void> {
    const { orderId, phoneNumber, songIndex, request } = job;
    const db = this.firebaseService.getDb();

    try {
      // Check if music is already generated and uploaded (for retry scenarios)
      const order = await this.firebaseService.getOrder(orderId);
      let storageUrl: string;

      if (order && order.song1AudioUrl && job.attempts > 1) {
        // Music already exists, skip generation (retry scenario)
        storageUrl = order.song1AudioUrl;
        console.log(`♻️ Using existing music from previous attempt: ${storageUrl.substring(0, 100)}...`);
        await this.updateJobProgress(job.id, 70);
      } else {
        // Generate music (first attempt or no existing audio)
        await this.updateJobProgress(job.id, 10);

        // Send status update to user ONLY on first attempt (25% - after lyrics 10%)
        if (job.attempts === 1) {
          await this.whatsappService.sendProgressUpdate(
            phoneNumber,
            orderId,
            'Müzik oluşturuluyor...',
            25
          );
        }

        // Generate music using Suno AI (async mode - returns task ID)
        await this.updateJobProgress(job.id, 30);
        const musicTask = await this.sunoService.generateMusic(request);

        console.log(`✅ Music generation task created for job ${job.id}: ${musicTask.task_id}`);

        // Wait for music generation to complete (Suno is async, polls every 5 seconds)
        await this.updateJobProgress(job.id, 40);
        const musicResult = await this.sunoService.waitForTaskCompletion(
          musicTask.task_id,
          60,  // max attempts (60 * 5s = 5 minutes)
          5000 // poll interval (5 seconds)
        );

        console.log(`✅ Music generation completed for job ${job.id}`);

        // Check if music generation was successful
        if (musicResult.status !== 'Success' || !musicResult.file_url) {
          throw new Error('Music generation failed - no file URL returned');
        }

        await this.updateJobProgress(job.id, 60);

        // Send progress update: Music generated, downloading (60%) - ONLY on first attempt
        if (job.attempts === 1) {
          await this.whatsappService.sendProgressUpdate(
            phoneNumber,
            orderId,
            'Müzik oluşturuldu, indiriliyor...',
            60
          );
        }

        // Download audio from Suno URL
        console.log(`📥 Downloading audio from Suno...`);
        const audioBuffer = await this.sunoService.downloadFile(musicResult.file_url);
        console.log(`✅ Audio downloaded: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

        await this.updateJobProgress(job.id, 65);

        // Send progress update: Uploading to storage (65%) - ONLY on first attempt
        if (job.attempts === 1) {
          await this.whatsappService.sendProgressUpdate(
            phoneNumber,
            orderId,
            'Yükleniyor...',
            65
          );
        }

        // Upload to Firebase Storage
        console.log(`📤 Uploading audio to Firebase Storage...`);
        storageUrl = await this.firebaseService.uploadAudio(orderId, songIndex, audioBuffer);
        console.log(`✅ Audio uploaded to Storage: ${storageUrl}`);

        await this.updateJobProgress(job.id, 70);

        // Save Storage URL to order immediately (so retry can use it)
        await this.firebaseService.updateOrder(orderId, {
          song1AudioUrl: storageUrl,
        });
      }

      // Update order status to completed
      await this.firebaseService.updateOrder(orderId, {
        song1AudioUrl: storageUrl,
        status: 'completed',
      });

      await this.updateJobProgress(job.id, 80);

      // Send progress update: Sending to WhatsApp (80%) - ONLY on first attempt
      if (job.attempts === 1) {
        await this.whatsappService.sendProgressUpdate(
          phoneNumber,
          orderId,
          'Şarkınız hazır, gönderiliyor...',
          80
        );
      }

      // Send music file to user via WhatsApp (using Storage URL)
      console.log(`📤 Sending music file to user via WhatsApp...`);
      await this.whatsappService.sendAudioMessage(phoneNumber, storageUrl);

      await this.updateJobProgress(job.id, 100);

      // Send completion message (100%)
      await this.whatsappService.sendProgressUpdate(
        phoneNumber,
        orderId,
        'Tamamlandı! ✅',
        100
      );

      await this.whatsappService.sendOrderCompletion(phoneNumber, orderId);

      // Mark job as completed
      job.status = 'completed';
      job.completedAt = new Date();
      job.updatedAt = new Date();

      await db.collection(this.COLLECTION).doc(job.id).update({
        status: 'completed',
        progress: 100,
        completedAt: job.completedAt.toISOString(),
        updatedAt: job.updatedAt.toISOString(),
      });

      console.log(`🎉 Job ${job.id} completed successfully`);

      // Clean up completed job after 1 hour
      setTimeout(async () => {
        await db.collection(this.COLLECTION).doc(job.id).delete();
        console.log(`🗑️ Deleted completed job ${job.id}`);
      }, 3600000);

    } catch (error: any) {
      console.error(`❌ Job ${job.id} failed:`, {
        error: error.message,
        orderId,
        songIndex,
        attempt: job.attempts,
      });

      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Handle job failure
   */
  private async handleJobFailure(job: MusicGenerationJob, error: Error): Promise<void> {
    const db = this.firebaseService.getDb();

    if (job.attempts >= this.MAX_ATTEMPTS) {
      // Max attempts reached - mark as failed
      console.error(`❌ Job ${job.id} failed after ${this.MAX_ATTEMPTS} attempts - notifying user`);

      await this.whatsappService.sendErrorMessage(
        job.phoneNumber,
        job.orderId,
        'Music generation failed after multiple attempts'
      );

      // Update order status to failed
      await this.firebaseService.updateOrder(job.orderId, {
        status: 'failed',
        errorMessage: error.message,
      });

      // Mark job as failed
      await db.collection(this.COLLECTION).doc(job.id).update({
        status: 'failed',
        error: error.message,
        updatedAt: new Date().toISOString(),
      });

      // Clean up failed job after 24 hours
      setTimeout(async () => {
        await db.collection(this.COLLECTION).doc(job.id).delete();
        console.log(`🗑️ Deleted failed job ${job.id}`);
      }, 86400000);

    } else {
      // Retry - mark as pending again
      console.log(`🔄 Job ${job.id} will be retried (attempt ${job.attempts + 1}/${this.MAX_ATTEMPTS})`);

      await db.collection(this.COLLECTION).doc(job.id).update({
        status: 'pending',
        error: error.message,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Update job progress
   */
  private async updateJobProgress(jobId: string, progress: number): Promise<void> {
    const db = this.firebaseService.getDb();
    await db.collection(this.COLLECTION).doc(jobId).update({
      progress,
      updatedAt: new Date().toISOString(),
    });
    console.log(`📊 Job ${jobId} progress: ${progress}%`);
  }

  /**
   * Get job status
   */
  async getJobStatus(jobId: string): Promise<MusicGenerationJob | null> {
    const db = this.firebaseService.getDb();
    const doc = await db.collection(this.COLLECTION).doc(jobId).get();

    if (!doc.exists) {
      return null;
    }

    const job = doc.data() as MusicGenerationJob;
    job.createdAt = new Date(job.createdAt);
    job.updatedAt = new Date(job.updatedAt);

    return job;
  }

  /**
   * Get queue stats
   */
  async getQueueStats(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  }> {
    const db = this.firebaseService.getDb();

    const [pendingSnapshot, processingSnapshot, completedSnapshot, failedSnapshot] = await Promise.all([
      db.collection(this.COLLECTION).where('status', '==', 'pending').get(),
      db.collection(this.COLLECTION).where('status', '==', 'processing').get(),
      db.collection(this.COLLECTION).where('status', '==', 'completed').get(),
      db.collection(this.COLLECTION).where('status', '==', 'failed').get(),
    ]);

    return {
      pending: pendingSnapshot.size,
      processing: processingSnapshot.size,
      completed: completedSnapshot.size,
      failed: failedSnapshot.size,
    };
  }

  /**
   * Clean up old jobs
   * NOTE: Uses simple queries to avoid composite index requirements
   */
  async cleanup(): Promise<void> {
    const db = this.firebaseService.getDb();
    const batch = db.batch();
    let deleteCount = 0;

    // Delete completed jobs older than 1 hour
    const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
    const completedSnapshot = await db
      .collection(this.COLLECTION)
      .where('status', '==', 'completed')
      .get();

    completedSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.completedAt && data.completedAt < oneHourAgo) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    });

    // Delete failed jobs older than 24 hours
    const oneDayAgo = new Date(Date.now() - 86400000).toISOString();
    const failedSnapshot = await db
      .collection(this.COLLECTION)
      .where('status', '==', 'failed')
      .get();

    failedSnapshot.docs.forEach(doc => {
      const data = doc.data();
      if (data.updatedAt && data.updatedAt < oneDayAgo) {
        batch.delete(doc.ref);
        deleteCount++;
      }
    });

    if (deleteCount > 0) {
      await batch.commit();
      console.log(`🗑️ Cleaned up ${deleteCount} old jobs`);
    }
  }

  /**
   * Stop processing
   */
  async close(): Promise<void> {
    console.log('Stopping Firebase queue processor...');
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = undefined;
    }
  }
}
