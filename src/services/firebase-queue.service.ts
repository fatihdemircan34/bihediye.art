import { SunoService, MusicGenerationRequest } from './suno.service';
import { FirebaseService } from './firebase.service';
import { WhatsAppService } from './whatsapp.service';
import { OpenAIService } from './openai.service';

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
  contentModerationRetries?: number; // Track content moderation retries separately
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
  private openaiService: OpenAIService;
  private processingJobs: Set<string> = new Set(); // Track concurrent jobs
  private processingInterval?: NodeJS.Timeout;
  private readonly COLLECTION = 'bihediye_music_queue';
  private readonly POLL_INTERVAL = 2000; // 2 seconds
  private readonly MAX_ATTEMPTS = 3;
  private readonly MAX_CONTENT_MODERATION_RETRIES = 2; // Max retries for content moderation
  private readonly MAX_CONCURRENT_JOBS = 10; // Suno API limit: 20/10s, using 10 for safety

  constructor(
    sunoService: SunoService,
    firebaseService: FirebaseService,
    whatsappService: WhatsAppService,
    openaiService: OpenAIService
  ) {
    this.sunoService = sunoService;
    this.firebaseService = firebaseService;
    this.whatsappService = whatsappService;
    this.openaiService = openaiService;

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
    console.log(`🔄 Starting Firebase queue processor (max ${this.MAX_CONCURRENT_JOBS} concurrent jobs)...`);

    this.processingInterval = setInterval(async () => {
      // Check if we can process more jobs
      if (this.processingJobs.size >= this.MAX_CONCURRENT_JOBS) {
        return; // Max concurrent jobs reached
      }

      try {
        // Try to process multiple jobs up to MAX_CONCURRENT_JOBS
        const availableSlots = this.MAX_CONCURRENT_JOBS - this.processingJobs.size;
        for (let i = 0; i < availableSlots; i++) {
          await this.processNextJob();
        }
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

    // Add to processing set
    this.processingJobs.add(job.id);

    // Mark as processing
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

    console.log(`▶️  Processing job ${job.id} (attempt ${job.attempts}) [${this.processingJobs.size}/${this.MAX_CONCURRENT_JOBS} concurrent]`);

    // Process async (don't block)
    this.processMusicGeneration(job)
      .catch(async (error: any) => {
        console.error(`❌ Job ${job.id} failed:`, error.message);
        await this.handleJobFailure(job, error);
      })
      .finally(() => {
        // Remove from processing set
        this.processingJobs.delete(job.id);
        console.log(`✅ Job ${job.id} finished [${this.processingJobs.size}/${this.MAX_CONCURRENT_JOBS} concurrent]`);
      });
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
      } else {
        // Generate music (first attempt or no existing audio)
        const musicTask = await this.sunoService.generateMusic(request);

        console.log(`✅ Music generation task created for job ${job.id}: ${musicTask.task_id}`);

        // Wait for music generation to complete (Suno is async, polls every 5 seconds)
        let musicResult;

        try {
          musicResult = await this.sunoService.waitForTaskCompletion(
            musicTask.task_id,
            60,  // max attempts (60 * 5s = 5 minutes)
            5000 // poll interval (5 seconds)
          );
        } catch (error: any) {
          // Check if it's a content moderation error (lyrics or tags/style)
          if (error.message && error.message.includes('SENSITIVE_WORD_ERROR')) {
            console.error(`⚠️ Content moderation error detected for job ${job.id}`);
            console.error(`   Error: ${error.message}`);

            // Check if it's an artist name error in tags/style
            const artistNameMatch = error.message.match(/artist name:\s*(.+?)(?:\n|$)/i);

            if (artistNameMatch) {
              // Artist name found in style/tags - remove it and retry
              const artistName = artistNameMatch[1].trim();
              console.log(`🎨 Artist name detected in style: "${artistName}"`);
              console.log(`   Current style: "${job.request.style}"`);

              // Remove artist name from style
              const cleanedStyle = job.request.style
                .replace(new RegExp(artistName, 'gi'), '')
                .replace(/\s*,\s*,\s*/g, ', ') // Clean up double commas
                .replace(/^,\s*|,\s*$/g, '')    // Clean up leading/trailing commas
                .trim();

              console.log(`   Cleaned style: "${cleanedStyle}"`);

              // Update job request with cleaned style
              job.request.style = cleanedStyle;

              // Also clear artistStyleDescription if it exists
              if (job.request.artistStyleDescription) {
                console.log(`   Clearing artistStyleDescription: "${job.request.artistStyleDescription}"`);
                job.request.artistStyleDescription = undefined;
              }

              // Save updated job and mark as pending for immediate retry
              // IMPORTANT: Reset attempts to 0 since this is a correction, not a retry
              await db.collection(this.COLLECTION).doc(job.id).update({
                'request.style': cleanedStyle,
                'request.artistStyleDescription': null,
                status: 'pending',
                attempts: 0, // Reset attempts - this is a correction, not a failed attempt
                error: `Artist name removed from style: ${artistName}`,
                updatedAt: new Date().toISOString(),
              });

              console.log(`✅ Job ${job.id} queued for retry with cleaned style (attempts reset to 0)`);
              return; // Exit and let the queue retry this job
            }

            // Initialize content moderation retries if not exists (for lyrics issues)
            const contentRetries = job.contentModerationRetries || 0;

            if (contentRetries < this.MAX_CONTENT_MODERATION_RETRIES) {
              // Regenerate lyrics with stricter content filtering
              console.log(`🔄 Fixing lyrics with content moderation (attempt ${contentRetries + 1}/${this.MAX_CONTENT_MODERATION_RETRIES})`);

              const order = await this.firebaseService.getOrder(orderId);
              if (!order) {
                throw new Error('Order not found');
              }

              const currentLyrics = job.request.lyrics;

              // Analyze current lyrics to find sensitive words
              console.log('🔍 Analyzing lyrics for sensitive content...');
              const analysis = await this.openaiService.analyzeLyricsForSensitiveContent(currentLyrics);

              console.log('📊 Content analysis result:', {
                hasSensitiveWords: analysis.hasSensitiveWords,
                flaggedWords: analysis.flaggedWords,
                suggestions: analysis.suggestions,
              });

              let newLyrics: string;
              let tokenUsage: any;

              if (analysis.hasSensitiveWords && analysis.flaggedWords.length > 0) {
                // Clean the existing lyrics by replacing sensitive words/sentences
                console.log(`🧹 Cleaning lyrics - removing ${analysis.flaggedWords.length} sensitive words/phrases`);
                newLyrics = await this.openaiService.cleanLyrics(currentLyrics, analysis.flaggedWords);
                console.log(`✅ Lyrics cleaned (flagged: ${analysis.flaggedWords.join(', ')})`);
              } else {
                // If we can't identify specific words, regenerate with ultra-strict filter
                console.log('⚠️ Could not identify specific words, regenerating with ultra-strict filter');

                const lyricsRequest = {
                  songDetails: order.orderData.song1,
                  story: order.orderData.story,
                  recipientName: order.orderData.recipientName,
                  recipientRelation: order.orderData.recipientRelation,
                  includeNameInSong: order.orderData.includeNameInSong,
                  notes: order.orderData.notes,
                };

                const lyricsResult = await this.openaiService.generateLyrics(lyricsRequest, true);
                newLyrics = lyricsResult.lyrics;
                tokenUsage = lyricsResult.tokenUsage;

                // Log token usage for content moderation retry
                if (tokenUsage) {
                  await this.firebaseService.logAnalytics('openai_token_usage', {
                    orderId,
                    phone: phoneNumber,
                    operation: 'lyrics_regeneration_content_moderation',
                    retryNumber: contentRetries + 1,
                    promptTokens: tokenUsage.promptTokens,
                    completionTokens: tokenUsage.completionTokens,
                    totalTokens: tokenUsage.totalTokens,
                    timestamp: new Date().toISOString(),
                  });
                }

                console.log(`✅ New ultra-safe lyrics generated (length: ${newLyrics.length})`);
              }

              // Update order with new lyrics
              await this.firebaseService.updateOrder(orderId, { song1Lyrics: newLyrics });

              // Update job request with new lyrics
              job.request.lyrics = newLyrics;
              job.contentModerationRetries = contentRetries + 1;

              // Save updated job and mark as pending for retry
              // IMPORTANT: Reset attempts to 0 since this is lyrics regeneration, not a failed attempt
              await db.collection(this.COLLECTION).doc(job.id).update({
                'request.lyrics': newLyrics,
                contentModerationRetries: job.contentModerationRetries,
                status: 'pending',
                attempts: 0, // Reset attempts - this is lyrics regeneration, not a failed attempt
                error: `Content moderation retry ${contentRetries + 1}/${this.MAX_CONTENT_MODERATION_RETRIES}`,
                updatedAt: new Date().toISOString(),
              });

              console.log(`✅ Job ${job.id} queued for retry with new lyrics (attempts reset to 0)`);
              return; // Exit and let the queue retry this job
            } else {
              console.error(`❌ Max content moderation retries reached for job ${job.id}`);
              throw new Error(`Content moderation failed after ${this.MAX_CONTENT_MODERATION_RETRIES} retries - lyrics keep getting rejected`);
            }
          }

          // Re-throw if not content moderation error
          throw error;
        }

        console.log(`✅ Music generation completed for job ${job.id}`);

        // Check if music generation was successful
        if (musicResult.status !== 'Success' || !musicResult.file_url) {
          throw new Error('Music generation failed - no file URL returned');
        }

        // Download audio from Suno URL
        console.log(`📥 Downloading audio from Suno...`);
        const audioBuffer = await this.sunoService.downloadFile(musicResult.file_url);
        console.log(`✅ Audio downloaded: ${(audioBuffer.length / 1024 / 1024).toFixed(2)} MB`);

        // Upload to Firebase Storage
        console.log(`📤 Uploading audio to Firebase Storage...`);
        storageUrl = await this.firebaseService.uploadAudio(orderId, songIndex, audioBuffer);
        console.log(`✅ Audio uploaded to Storage: ${storageUrl}`);

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

      // Send music file to user via WhatsApp (using Storage URL)
      console.log(`📤 Sending music file to user via WhatsApp...`);
      await this.whatsappService.sendAudioMessage(phoneNumber, storageUrl);

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

      // IMPORTANT: Delete conversation so user can start a new order
      await this.firebaseService.deleteConversation(phoneNumber);
      console.log(`🗑️ Conversation deleted for ${phoneNumber} (order completed)`);

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

      // IMPORTANT: Delete conversation so user can start a new order
      await this.firebaseService.deleteConversation(job.phoneNumber);
      console.log(`🗑️ Conversation deleted for ${job.phoneNumber} (order failed)`);

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
