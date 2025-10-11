import axios, { AxiosInstance } from 'axios';
import { SongDetails } from '../models/order.model';

export interface SunoConfig {
  apiKey: string;
  baseUrl?: string;
}

export interface MusicGenerationRequest {
  lyrics: string;
  songType: string;     // Pop, Rap, Jazz, etc.
  style: string;        // Romantik, Duygusal, etc.
  vocal?: string;       // Kadın, Erkek, Fark etmez
  duration?: number;
  artistStyleDescription?: string; // Optional artist style description (NO artist names!)
}

export interface VideoGenerationRequest {
  prompt: string;
  imageUrl?: string;
  duration?: number;
}

export interface SunoTaskResponse {
  task_id: string;
  status: string;
  file_url?: string;
  base_resp?: {
    status_code: number;
    status_msg: string;
  };
}

export interface SunoTaskStatus {
  task_id: string;
  status: 'Processing' | 'Success' | 'Failed';
  file_id?: string;
  audio_file?: string;
  video_file?: string;
  file_url?: string;
}

export class SunoService {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: SunoConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.sunoapi.org',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 300000, // 5 dakika - müzik üretimi uzun sürebilir
    });
  }

  /**
   * Generate music using Suno AI V5
   * Suno API V5 model için optimize edilmiş
   */
  async generateMusic(request: MusicGenerationRequest): Promise<SunoTaskResponse> {
    try {
      // Şarkı türüne göre style ve prompt oluştur
      const musicStyle = this.buildMusicStyle(request);
      const vocalGender = this.getVocalGender(request.vocal);

      console.log('🎵 Generating music with Suno AI V5...');
      console.log('   Style:', musicStyle);
      console.log('   Lyrics length:', request.lyrics.length);
      console.log('   Vocal:', vocalGender);

      // Get base URL from environment or use default
      const baseUrl = process.env.BASE_URL || 'https://payment.bihediye.art';
      const callbackUrl = `${baseUrl}/webhook/suno/callback`;

      const response = await this.client.post('/api/v1/generate', {
        model: 'V5',
        customMode: true,
        prompt: request.lyrics,  // Lyrics will be strictly used as lyrics
        style: musicStyle,       // Music style/genre
        title: this.generateTitle(request),
        instrumental: false,     // We want vocals with lyrics
        vocalGender: vocalGender,
        callBackUrl: callbackUrl, // Required by Suno API
      });

      console.log('✅ Suno API response received');

      // Suno API returns task ID for async processing
      if (response.data.code === 200 && response.data.data?.taskId) {
        const taskId = response.data.data.taskId;

        console.log('✅ Music generation task created!');
        console.log(`   Task ID: ${taskId}`);
        console.log(`   Status: Processing`);
        console.log(`   Expected duration: 2-3 minutes`);

        return {
          task_id: taskId,
          status: 'Processing',
          base_resp: {
            status_code: 200,
            status_msg: 'Task created successfully',
          },
        };
      }

      console.error('❌ Unexpected Suno API response format');
      console.error('Response:', JSON.stringify(response.data, null, 2));
      throw new Error('Suno API beklenmeyen yanıt formatı döndürdü');

    } catch (error: any) {
      console.error('❌ Suno API Error Details:');
      console.error('- Message:', error.message);
      console.error('- Status:', error.response?.status);
      console.error('- Response:', JSON.stringify(error.response?.data, null, 2));

      // User-friendly error message (no technical details)
      throw new Error('Müzik oluşturma işlemi şu anda gerçekleştirilemiyor. Lütfen daha sonra tekrar deneyin.');
    }
  }

  /**
   * Generate video using Suno AI
   * Video için fotoğraf ve müzik birleştirme
   */
  async generateVideo(request: VideoGenerationRequest): Promise<SunoTaskResponse> {
    try {
      const response = await this.client.post('/api/v1/video/generate', {
        prompt: request.prompt,
        imageUrl: request.imageUrl,
      });

      if (response.data.code === 200 && response.data.data?.taskId) {
        return {
          task_id: response.data.data.taskId,
          status: 'Processing',
          base_resp: {
            status_code: 200,
            status_msg: 'Video generation task created',
          },
        };
      }

      throw new Error('Suno video generation failed');
    } catch (error: any) {
      console.error('Error generating video:', error.response?.data || error.message);
      throw new Error(`Suno video oluşturma hatası: ${error.response?.data?.msg || error.message}`);
    }
  }

  /**
   * Check the status of a generation task
   */
  async checkTaskStatus(taskId: string): Promise<SunoTaskStatus> {
    try {
      console.log(`⏳ Checking Suno task status for: ${taskId}`);

      // Correct endpoint: /api/v1/generate/record-info?taskId={taskId}
      const response = await this.client.get(`/api/v1/generate/record-info?taskId=${taskId}`);

      // Log full response for debugging
      if (response.data.data?.status === 'SUCCESS') {
        console.log('✅ SUCCESS status received - Full task data:', JSON.stringify(response.data.data, null, 2));
      }

      console.log('Task status response:', {
        taskId,
        status: response.data.data?.status,
        hasAudioUrl: !!response.data.data?.audio_url,
      });

      // Suno API returns task status and audio URL when complete
      if (response.data.code === 200 && response.data.data) {
        const taskData = response.data.data;
        const status = taskData.status; // "PENDING", "SUCCESS", "SENSITIVE_WORD_ERROR", etc.

        // SUCCESS - task completed with audio URL
        if (status === 'SUCCESS') {
          // Suno API V5 returns audio URLs in response.sunoData array
          const sunoData = taskData.response?.sunoData;

          if (sunoData && Array.isArray(sunoData) && sunoData.length > 0) {
            // Get the first generated song (or we could use all of them)
            const firstSong = sunoData[0];
            const audioUrl = firstSong.audioUrl || firstSong.sourceAudioUrl;

            if (audioUrl) {
              console.log(`🎵 Audio URL found: ${audioUrl}`);
              console.log(`   Generated ${sunoData.length} song(s)`);
              console.log(`   Duration: ${firstSong.duration}s`);

              return {
                task_id: taskId,
                status: 'Success',
                file_url: audioUrl,
                audio_file: audioUrl,
              };
            }
          }

          // Fallback: Check other possible locations
          const audioUrl = taskData.audio_url ||
                          taskData.audioUrl ||
                          taskData.url ||
                          taskData.file_url;

          if (audioUrl) {
            console.log(`🎵 Audio URL found (fallback): ${audioUrl}`);
            return {
              task_id: taskId,
              status: 'Success',
              file_url: audioUrl,
              audio_file: audioUrl,
            };
          }

          console.error('⚠️ SUCCESS status but no audio URL found in response');
          console.error('Available fields:', Object.keys(taskData));
          // Continue waiting - audio might be generated soon
          return {
            task_id: taskId,
            status: 'Processing',
          };
        }

        // SENSITIVE_WORD_ERROR - content moderation issue
        if (status === 'SENSITIVE_WORD_ERROR') {
          console.error('❌ Suno content moderation error: Lyrics contain sensitive words');
          console.error('📋 Full Suno response data:', JSON.stringify(taskData, null, 2));

          // Check if Suno provides details about which word was flagged
          if (taskData.error_message || taskData.error || taskData.message || taskData.fail_reason) {
            console.error('🔍 Error details:', {
              error_message: taskData.error_message,
              error: taskData.error,
              message: taskData.message,
              fail_reason: taskData.fail_reason,
            });
          }

          return {
            task_id: taskId,
            status: 'Failed',
          };
        }

        // Any other failed status
        if (status.includes('ERROR') || status === 'FAILED') {
          return {
            task_id: taskId,
            status: 'Failed',
          };
        }

        // Still processing
        return {
          task_id: taskId,
          status: 'Processing',
        };
      }

      return {
        task_id: taskId,
        status: 'Processing',
      };
    } catch (error: any) {
      console.error('❌ Error checking Suno task status:', error.response?.data || error.message);
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
   * Suno API is async, so we poll until completion
   */
  async waitForTaskCompletion(
    taskId: string,
    maxAttempts: number = 60,  // 60 attempts
    pollInterval: number = 5000  // 5 seconds
  ): Promise<SunoTaskStatus> {
    console.log(`⏳ Waiting for Suno task completion: ${taskId}`);
    console.log(`   Max attempts: ${maxAttempts}`);
    console.log(`   Poll interval: ${pollInterval}ms`);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const status = await this.checkTaskStatus(taskId);

      console.log(`   Attempt ${attempt}/${maxAttempts} - Status: ${status.status}`);

      if (status.status === 'Success') {
        console.log('✅ Task completed successfully!');
        return status;
      }

      if (status.status === 'Failed') {
        console.log('❌ Task failed!');
        throw new Error('Suno music generation task failed');
      }

      // Wait before next poll
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }

    console.error('❌ Task timeout - max attempts reached');
    throw new Error('Müzik oluşturma işlemi zaman aşımına uğradı');
  }

  /**
   * Build music style based on song details
   * Combines genre, style, and vocal characteristics
   * If artistStyleDescription is provided, use it INSTEAD of translateMusicType
   */
  private buildMusicStyle(request: MusicGenerationRequest): string {
    const parts: string[] = [];

    // If artist style description provided, use it directly
    // ChatGPT is responsible for converting artist names to musical descriptions
    if (request.artistStyleDescription) {
      console.log('🎨 Using artist style description:', request.artistStyleDescription);
      parts.push(request.artistStyleDescription);
    } else {
      // Normal flow: translate music type
      parts.push(this.translateMusicType(request.songType));
    }

    // Tarz/Ruh hali
    parts.push(this.translateStyle(request.style));

    // Vokal tercihi - Çeşitli ses karakteristikleri ile
    if (request.vocal && request.vocal !== 'Fark etmez') {
      const vocalCharacteristics = this.selectVocalCharacteristics(
        request.vocal,
        request.songType,
        request.style
      );
      parts.push(vocalCharacteristics);
    }

    return parts.join(', ');
  }

  /**
   * Generate a title based on song details
   */
  private generateTitle(request: MusicGenerationRequest): string {
    const types: Record<string, string> = {
      'Pop': 'Pop Song',
      'Rap': 'Rap Song',
      'Jazz': 'Jazz Melody',
      'Arabesk': 'Arabesk Ballad',
      'Klasik': 'Classical Piece',
      'Rock': 'Rock Anthem',
      'Metal': 'Metal Track',
      'Nostaljik': 'Nostalgic Song',
    };

    return types[request.songType] || 'Song';
  }

  /**
   * Get vocal gender for Suno API (m/f)
   */
  private getVocalGender(vocal?: string): 'm' | 'f' | undefined {
    if (!vocal || vocal === 'Fark etmez') {
      return undefined; // Let Suno decide
    }
    return vocal === 'Kadın' ? 'f' : 'm';
  }

  /**
   * Müzik türü ve tarza göre ses karakteristiği seç
   * Her çağrıda farklı ses çeşitliliği için randomize eder
   */
  private selectVocalCharacteristics(vocal: string, songType: string, style: string): string {
    const isFemale = vocal === 'Kadın';

    // Ses tonu çeşitleri (her türde kullanılabilir)
    const femaleVoiceTypes = [
      'soft female vocals',
      'powerful female vocals',
      'gentle female vocals',
      'strong female vocals',
      'sweet female vocals',
      'soulful female vocals',
      'clear female vocals',
      'warm female vocals',
    ];

    const maleVoiceTypes = [
      'soft male vocals',
      'powerful male vocals',
      'gentle male vocals',
      'strong male vocals',
      'deep male vocals',
      'soulful male vocals',
      'clear male vocals',
      'warm male vocals',
    ];

    // Müzik türüne göre özel ses karakteristikleri
    const genreSpecificVocals: Record<string, string[]> = {
      'Pop': ['energetic', 'catchy', 'bright', 'modern'],
      'Rap': ['rhythmic', 'dynamic', 'urban', 'confident'],
      'Jazz': ['smooth', 'sultry', 'rich', 'jazzy'],
      'Arabesk': ['emotional', 'passionate', 'expressive', 'traditional'],
      'Klasik': ['operatic', 'elegant', 'refined', 'classical'],
      'Rock': ['powerful', 'edgy', 'raw', 'energetic'],
      'Metal': ['intense', 'aggressive', 'powerful', 'heavy'],
      'Nostaljik': ['nostalgic', 'vintage', 'retro', 'classic'],
    };

    // Tarza göre özel ses karakteristikleri
    const styleSpecificVocals: Record<string, string[]> = {
      'Romantik': ['tender', 'loving', 'intimate', 'heartfelt'],
      'Duygusal': ['emotional', 'touching', 'sentimental', 'expressive'],
      'Eğlenceli': ['upbeat', 'cheerful', 'lively', 'joyful'],
      'Sakin': ['calm', 'peaceful', 'soothing', 'gentle'],
    };

    // Rastgele ses tipi seç
    const voiceTypes = isFemale ? femaleVoiceTypes : maleVoiceTypes;
    const baseVoice = voiceTypes[Math.floor(Math.random() * voiceTypes.length)];

    // Tür ve tarza özel karakteristikler ekle
    const characteristics: string[] = [];

    if (genreSpecificVocals[songType]) {
      const genreChar = genreSpecificVocals[songType];
      characteristics.push(genreChar[Math.floor(Math.random() * genreChar.length)]);
    }

    if (styleSpecificVocals[style]) {
      const styleChar = styleSpecificVocals[style];
      characteristics.push(styleChar[Math.floor(Math.random() * styleChar.length)]);
    }

    // Sonuç: "soft female vocals, emotional, tender" gibi
    return characteristics.length > 0
      ? `${baseVoice}, ${characteristics.join(', ')}`
      : baseVoice;
  }

  /**
   * Translate Turkish music types to English for better AI understanding
   * IMPORTANT: Do NOT include artist names - Suno API rejects them
   */
  private translateMusicType(type: string): string {
    const translations: Record<string, string> = {
      'Pop': 'Modern pop with catchy melodies',
      'Rap': 'Hip-hop with rhythmic flow',
      'Jazz': 'Smooth jazz with soulful melodies',
      'Arabesk': 'Turkish traditional music with emotional vocals',
      'Klasik': 'Classical orchestral',
      'Rock': 'Rock with electric guitars',
      'Metal': 'Heavy metal with powerful riffs',
      'Nostaljik': 'Nostalgic retro vibes',
    };
    return translations[type] || type;
  }

  /**
   * Translate Turkish styles to English
   */
  private translateStyle(style: string): string {
    const translations: Record<string, string> = {
      'Romantik': 'romantic, emotional, heartfelt',
      'Duygusal': 'emotional, touching, sentimental',
      'Eğlenceli': 'fun, upbeat, energetic, cheerful',
      'Sakin': 'calm, peaceful, relaxing, gentle',
    };
    return translations[style] || style;
  }
}
