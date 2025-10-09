import { MinimaxService, MusicGenerationRequest } from './minimax.service';
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
  private minimaxService: MinimaxService;
  private firebaseService: FirebaseService;
  private whatsappService: WhatsAppService;
  private isProcessing: boolean = false;
  private processingInterval?: NodeJS.Timeout;
  private readonly COLLECTION = 'bihediye_music_queue';
  private readonly POLL_INTERVAL = 2000; // 2 seconds
  private readonly MAX_ATTEMPTS = 3;

  constructor(
    minimaxService: MinimaxService,
    firebaseService: FirebaseService,
    whatsappService: WhatsAppService
  ) {
    this.minimaxService = minimaxService;
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

    // Notify user
    await this.whatsappService.sendProgressUpdate(
      jobData.phoneNumber,
      jobData.orderId,
      `Şarkı ${jobData.songIndex} hazırlanmaya başlandı...`,
      jobData.songIndex === 1 ? 25 : 75
    );

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
    const snapshot = await db
      .collection(this.COLLECTION)
      .where('status', '==', 'pending')
      .orderBy('createdAt', 'asc')
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
      // Update progress: 10%
      await this.updateJobProgress(job.id, 10);

      // Send status update to user
      await this.whatsappService.sendProgressUpdate(
        phoneNumber,
        orderId,
        `Şarkı ${songIndex} için müzik oluşturuluyor...`,
        songIndex === 1 ? 30 : 80
      );

      // Generate music using Minimax (sync mode - returns hex audio)
      await this.updateJobProgress(job.id, 30);
      const musicResult = await this.minimaxService.generateMusic(request);

      console.log(`✅ Music generated successfully for job ${job.id}`);

      // Check if music generation was successful
      if (musicResult.status !== 'Success' || !musicResult.file_url) {
        throw new Error('Music generation failed - no file URL returned');
      }

      await this.updateJobProgress(job.id, 50);

      // Convert data URL to buffer and upload to Firebase Storage
      console.log(`📤 Uploading audio to Firebase Storage...`);
      let audioBuffer: Buffer;

      if (musicResult.file_url.startsWith('data:audio/mp3;base64,')) {
        // Extract base64 data and convert to buffer
        const base64Data = musicResult.file_url.replace('data:audio/mp3;base64,', '');
        audioBuffer = Buffer.from(base64Data, 'base64');
      } else {
        throw new Error('Invalid audio format from Minimax');
      }

      // Upload to Firebase Storage
      const storageUrl = await this.firebaseService.uploadAudio(orderId, songIndex, audioBuffer);
      console.log(`✅ Audio uploaded to Storage: ${storageUrl}`);

      await this.updateJobProgress(job.id, 70);

      // Update order in Firebase with Storage URL
      const order = await this.firebaseService.getOrder(orderId);
      if (!order) {
        throw new Error(`Order ${orderId} not found`);
      }

      // Save Storage URL to order
      if (songIndex === 1) {
        order.song1AudioUrl = storageUrl;
      }

      order.status = 'completed';
      await this.firebaseService.updateOrder(orderId, {
        song1AudioUrl: storageUrl,
        status: 'completed',
      });

      await this.updateJobProgress(job.id, 90);

      // Send music file to user via WhatsApp (using Storage URL)
      console.log(`📤 Sending music file to user via WhatsApp...`);
      await this.whatsappService.sendAudioMessage(phoneNumber, storageUrl);

      await this.updateJobProgress(job.id, 100);

      // Send completion message
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
   */
  async cleanup(): Promise<void> {
    const db = this.firebaseService.getDb();

    // Delete completed jobs older than 1 hour
    const oneHourAgo = new Date(Date.now() - 3600000);
    const completedSnapshot = await db
      .collection(this.COLLECTION)
      .where('status', '==', 'completed')
      .where('completedAt', '<', oneHourAgo.toISOString())
      .get();

    const batch = db.batch();
    completedSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    // Delete failed jobs older than 24 hours
    const oneDayAgo = new Date(Date.now() - 86400000);
    const failedSnapshot = await db
      .collection(this.COLLECTION)
      .where('status', '==', 'failed')
      .where('updatedAt', '<', oneDayAgo.toISOString())
      .get();

    failedSnapshot.docs.forEach(doc => {
      batch.delete(doc.ref);
    });

    await batch.commit();
    console.log(`🗑️ Cleaned up ${completedSnapshot.size + failedSnapshot.size} old jobs`);
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
