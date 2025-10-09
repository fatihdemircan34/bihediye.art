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
      timeout: 30000,
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
        audio_setting: {
          sample_rate: 44100,
          bitrate: 256000,
          format: 'mp3',
        },
      });

      console.log('Minimax response:', response.data);

      // Minimax music-1.5 returns audio directly in hex format
      if (response.data.data && response.data.data.audio) {
        // Save audio from hex
        const audioHex = response.data.data.audio;
        const audioBuffer = Buffer.from(audioHex, 'hex');

        // For now, we'll return a mock task response
        // In production, you'd upload this buffer to cloud storage
        return {
          task_id: `music_${Date.now()}`,
          status: 'Success',
          base_resp: {
            status_code: 0,
            status_msg: 'Success',
          },
        };
      }

      // If it's async task-based
      return {
        task_id: response.data.task_id || response.data.data?.task_id,
        status: response.data.status || 'Processing',
        base_resp: response.data.base_resp,
      };
    } catch (error: any) {
      console.error('Error generating music:', error.response?.data || error.message);
      throw new Error(`Minimax müzik oluşturma hatası: ${error.response?.data?.base_resp?.status_msg || error.message}`);
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
      const response = await this.client.get('/v1/query/task_status', {
        params: { task_id: taskId },
      });

      return {
        task_id: response.data.task_id,
        status: response.data.status,
        file_id: response.data.file_id,
        audio_file: response.data.audio_file,
        video_file: response.data.video_file,
        file_url: response.data.file_url,
      };
    } catch (error: any) {
      console.error('Error checking task status:', error.response?.data || error.message);
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
    maxAttempts: number = 60,
    pollInterval: number = 5000
  ): Promise<MinimaxTaskStatus> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const status = await this.checkTaskStatus(taskId);

      if (status.status === 'Success') {
        return status;
      }

      if (status.status === 'Failed') {
        throw new Error(`Task başarısız oldu: ${taskId}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Task timeout: ${taskId} - ${maxAttempts * pollInterval / 1000} saniye içinde tamamlanamadı`);
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
