import axios, { AxiosInstance } from 'axios';
import { SongDetails } from '../models/order.model';

export interface MinimaxConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface MusicGenerationRequest {
  lyrics: string;
  songType: string;     // Pop, Rap, Jazz, etc.
  style: string;        // Romantik, Duygusal, etc.
  vocal?: string;       // Kadın, Erkek, Fark etmez
  duration?: number;
}

export interface VideoGenerationRequest {
  prompt: string;
  imageUrl?: string;
  duration?: number;
}

export interface MinimaxTaskResponse {
  task_id: string;
  status: string;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

export interface MinimaxTaskStatus {
  task_id: string;
  status: 'Processing' | 'Success' | 'Failed';
  file_id?: string;
  audio_file?: string;
  video_file?: string;
  file_url?: string;
}

export class MinimaxService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: MinimaxConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.minimax.io',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 dakika - müzik üretimi uzun sürebilir
    });
  }

  /**
   * Generate music using Minimax AI
   * Minimax.io music-01 model için optimize edilmiş
   */
  async generateMusic(request: MusicGenerationRequest): Promise<MinimaxTaskResponse> {
    try {
      // Şarkı türüne göre prompt oluştur
      const musicPrompt = this.buildMusicPrompt(request);

      console.log('Generating music with Minimax...');
      console.log('Prompt:', musicPrompt);
      console.log('Lyrics length:', request.lyrics.length);

      const response = await this.client.post('/v1/music_generation', {
        model: 'music-1.5',
        prompt: musicPrompt,
        lyrics: request.lyrics,
        invoke_method: 'async-invoke', // Async task-based generation
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: 'mp3',
        },
      });

      console.log('✅ Minimax API response received');
      console.log('Response structure:', {
        hasData: !!response.data.data,
        hasAudio: !!response.data.data?.audio,
        hasTaskId: !!response.data.task_id,
        dataKeys: response.data ? Object.keys(response.data) : []
      });

      // Minimax music-1.5 returns audio directly in hex format (synchronous)
      if (response.data.data && response.data.data.audio) {
        console.log('✅ Received audio data directly (sync response)');
        const audioHex = response.data.data.audio;
        const audioBuffer = Buffer.from(audioHex, 'hex');
        console.log(`Audio size: ${audioBuffer.length} bytes`);

        // TODO: Upload to cloud storage and return actual URL
        // For now, we'll return a mock task response
        return {
          task_id: `music_${Date.now()}`,
          status: 'Success',
          base_resp: {
            status_code: 0,
            status_msg: 'Success',
          },
        };
      }

      // If it's async task-based (returns task_id for polling)
      if (response.data.task_id || response.data.data?.task_id) {
        const taskId = response.data.task_id || response.data.data.task_id;
        console.log('✅ Received task ID (async response):', taskId);

        return {
          task_id: taskId,
          status: response.data.status || 'Processing',
          base_resp: response.data.base_resp,
        };
      }

      console.error('❌ Unexpected Minimax response format:', JSON.stringify(response.data, null, 2));
      throw new Error('Minimax beklenmeyen yanıt formatı döndürdü');

    } catch (error: any) {
      console.error('❌ Minimax API Error Details:');
      console.error('- Message:', error.message);
      console.error('- Status:', error.response?.status);
      console.error('- Response:', error.response?.data);

      // User-friendly error message (no technical details)
      throw new Error('Müzik oluşturma işlemi şu anda gerçekleştirilemiyor. Lütfen daha sonra tekrar deneyin.');
    }
  }

  /**
   * Generate video using Minimax AI
   * Video için fotoğraf ve müzik birleştirme
   */
  async generateVideo(request: VideoGenerationRequest): Promise<MinimaxTaskResponse> {
    try {
      const response = await this.client.post('/v1/video/generation', {
        model: 'video-01',
        prompt: request.prompt,
        image_url: request.imageUrl,
        video_setting: {
          duration: request.duration || 30,
          resolution: '1080p',
          fps: 30,
        },
      });

      return {
        task_id: response.data.task_id,
        status: response.data.status || 'Processing',
        base_resp: response.data.base_resp,
      };
    } catch (error: any) {
      console.error('Error generating video:', error.response?.data || error.message);
      throw new Error(`Minimax video oluşturma hatası: ${error.response?.data?.base_resp?.status_msg || error.message}`);
    }
  }

  /**
   * Check the status of a generation task
   */
  async checkTaskStatus(taskId: string): Promise<MinimaxTaskStatus> {
    try {
      console.log(`⏳ Checking task status for: ${taskId}`);

      const response = await this.client.get(`/v1/music_generation/query/${taskId}`);

      console.log('Task status response:', {
        taskId,
        status: response.data.status,
        hasAudio: !!response.data.data?.audio,
        hasFileUrl: !!response.data.file_url
      });

      // Check if completed and has audio
      if (response.data.status === 'Success' && response.data.data?.audio) {
        // Convert hex audio to base64 or URL
        return {
          task_id: taskId,
          status: 'Success',
          file_url: `data:audio/mp3;base64,${Buffer.from(response.data.data.audio, 'hex').toString('base64')}`,
        };
      }

      return {
        task_id: taskId,
        status: response.data.status || 'Processing',
        file_id: response.data.file_id,
        audio_file: response.data.audio_file,
        video_file: response.data.video_file,
        file_url: response.data.file_url,
      };
    } catch (error: any) {
      console.error('❌ Error checking task status:', error.response?.data || error.message);
      throw new Error(`Task durum kontrolü hatası: ${error.message}`);
    }
  }

  /**
   * Download generated file
   */
  async downloadFile(fileUrl: string): Promise<Buffer> {
    try {
      const response = await axios.get(fileUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
      });

      return Buffer.from(response.data);
    } catch (error: any) {
      console.error('Error downloading file:', error.message);
      throw new Error(`Dosya indirme hatası: ${error.message}`);
    }
  }

  /**
   * Wait for task completion with polling
   */
  async waitForTaskCompletion(
    taskId: string,
    maxAttempts: number = 180, // 180 attempts = 15 minutes
    pollInterval: number = 5000 // Poll every 5 seconds
  ): Promise<MinimaxTaskStatus> {
    console.log(`🔄 Starting task polling for: ${taskId}`);
    console.log(`Max wait time: ${(maxAttempts * pollInterval) / 1000 / 60} minutes`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`📊 Poll attempt ${attempt}/${maxAttempts}`);

      const status = await this.checkTaskStatus(taskId);

      if (status.status === 'Success') {
        console.log(`✅ Task completed successfully: ${taskId}`);
        return status;
      }

      if (status.status === 'Failed') {
        console.error(`❌ Task failed: ${taskId}`);
        throw new Error(`Task başarısız oldu: ${taskId}`);
      }

      // Still processing
      console.log(`⏳ Task still processing... (${status.status})`);

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.error(`⏰ Task timeout: ${taskId}`);
    throw new Error(`Task timeout: ${taskId} - ${(maxAttempts * pollInterval) / 1000 / 60} dakika içinde tamamlanamadı`);
  }

  /**
   * Build music generation prompt based on song details
   */
  private buildMusicPrompt(request: MusicGenerationRequest): string {
    const parts: string[] = [];

    // Müzik türü
    parts.push(`Müzik Türü: ${this.translateMusicType(request.songType)}`);

    // Tarz/Ruh hali
    parts.push(`Tarz: ${this.translateStyle(request.style)}`);

    // Vokal tercihi
    if (request.vocal && request.vocal !== 'Fark etmez') {
      parts.push(`Vokal: ${request.vocal === 'Kadın' ? 'Female vocals' : 'Male vocals'}`);
    }

    // Süre
    if (request.duration) {
      parts.push(`Süre: ${request.duration} saniye`);
    }

    return parts.join(', ');
  }

  /**
   * Translate Turkish music types to English for better AI understanding
   */
  private translateMusicType(type: string): string {
    const translations: Record<string, string> = {
      'Pop': 'Pop',
      'Rap': 'Rap/Hip-hop',
      'Jazz': 'Jazz',
      'Arabesk': 'Turkish Arabesk',
      'Klasik': 'Classical',
      'Rock': 'Rock',
      'Metal': 'Heavy Metal',
      'Nostaljik': 'Nostalgic/Retro',
    };
    return translations[type] || type;
  }

  /**
   * Translate Turkish styles to English
   */
  private translateStyle(style: string): string {
    const translations: Record<string, string> = {
      'Romantik': 'Romantic, emotional, heartfelt',
      'Duygusal': 'Emotional, touching, sentimental',
      'Eğlenceli': 'Fun, upbeat, energetic, cheerful',
      'Sakin': 'Calm, peaceful, relaxing, gentle',
    };
    return translations[style] || style;
  }
}
