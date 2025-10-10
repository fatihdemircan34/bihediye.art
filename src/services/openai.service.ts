import axios, { AxiosInstance } from 'axios';
import { SongDetails } from '../models/order.model';

export interface OpenAIConfig {
  apiKey: string;
  model?: string;
}

export interface LyricsGenerationRequest {
  songDetails: SongDetails;
  story: string;
  recipientName?: string;
  recipientRelation?: string;
  includeNameInSong: boolean;
  notes?: string;
}

export class OpenAIService {
  private client: AxiosInstance;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.model = config.model || 'gpt-4-turbo-preview';
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    });
  }

  /**
   * Generate song lyrics using ChatGPT
   */
  async generateLyrics(request: LyricsGenerationRequest): Promise<string> {
    try {
      const prompt = this.buildLyricsPrompt(request);

      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `Sen profesyonel bir şarkı sözü yazarısın. Duygusal, anlamlı ve müzikal şarkı sözleri yazıyorsun.
            Şarkı sözleri kişiye özel olmalı, samimi ve içten olmalı. Türkçe dilbilgisi kurallarına dikkat et.

            ÖNEMLI FORMAT KURALI:
            Şarkı sözlerini MUTLAKA şu etiketlerle formatla:
            [intro] - Giriş kısmı
            [verse] - Kıta
            [pre-chorus] - Ön nakarat
            [chorus] - Nakarat
            [bridge] - Köprü
            [outro] - Çıkış

            Her satır kısa ve şarkı söylenebilir olmalı. Uzun cümleler YASAK.
            Şarkı EN AZ 2 dakika uzunluğunda olmalı, yeterince uzun ve detaylı şarkı sözleri yaz.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_completion_tokens: 2000,
      };

      // Only add temperature for models that support it (not gpt-5)
      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.8;
      }

      console.log('Sending OpenAI request with model:', this.model);

      const response = await this.client.post('/chat/completions', requestBody);

      console.log('OpenAI response received:', {
        model: response.data.model,
        choices: response.data.choices?.length,
        finishReason: response.data.choices?.[0]?.finish_reason,
        hasContent: !!response.data.choices?.[0]?.message?.content,
        contentLength: response.data.choices?.[0]?.message?.content?.length || 0,
      });

      const lyrics = response.data.choices?.[0]?.message?.content?.trim();

      if (!lyrics) {
        console.error('❌ Empty lyrics response from OpenAI');
        console.error('Full response:', JSON.stringify(response.data, null, 2));
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      console.log('✅ Lyrics generated successfully');
      console.log('- Length:', lyrics.length, 'characters');
      console.log('- Lines:', lyrics.split('\n').length);
      console.log('- Has tags:', /\[verse\]|\[chorus\]|\[bridge\]/.test(lyrics));

      return lyrics;
    } catch (error: any) {
      console.error('❌ OpenAI API Error Details:');
      console.error('- Message:', error.message);
      console.error('- Status:', error.response?.status);
      console.error('- Data:', error.response?.data);

      // User-friendly error message
      throw new Error('Şarkı sözü oluşturma işlemi şu anda gerçekleştirilemiyor. Lütfen daha sonra tekrar deneyin.');
    }
  }

  /**
   * Generate lyrics prompt based on request
   */
  private buildLyricsPrompt(request: LyricsGenerationRequest): string {
    const parts: string[] = [];

    parts.push(`Aşağıdaki özelliklere sahip bir şarkı sözü yaz:\n`);

    // Müzik türü ve tarzı
    parts.push(`**Müzik Türü:** ${request.songDetails.type}`);
    parts.push(`**Şarkı Tarzı:** ${request.songDetails.style}`);

    // Vokal
    if (request.songDetails.vocal && request.songDetails.vocal !== 'Fark etmez') {
      parts.push(`**Vokal:** ${request.songDetails.vocal} sesi`);
    }

    // Hediye edilen kişi
    if (request.recipientRelation) {
      parts.push(`**Şarkı kime:** ${request.recipientRelation}`);
    }

    // İsim kullanımı
    if (request.includeNameInSong && request.recipientName) {
      parts.push(`**Şarkıda geçmesi gereken isim:** ${request.recipientName}`);
      parts.push(`\nÖNEMLİ: Şarkı sözlerinde mutlaka "${request.recipientName}" ismini doğal bir şekilde kullan.`);
    } else {
      parts.push(`\nÖNEMLİ: Şarkı sözlerinde özel isim kullanma.`);
    }

    // Hikaye ve duygular
    parts.push(`\n**Şarkının konusu ve ilham alınacak hikaye:**`);
    parts.push(request.story);

    // Ek notlar
    if (request.notes) {
      parts.push(`\n**Ek notlar:**`);
      parts.push(request.notes);
    }

    // Talimatlar
    parts.push(`\n**Şarkı Yapısı (EN AZ 2 DAKİKALIK ŞARKI):**`);
    parts.push(`\n[intro]`);
    parts.push(`2-3 satır giriş`);
    parts.push(`\n[verse]`);
    parts.push(`8-10 satır, kısa cümleler`);
    parts.push(`\n[pre-chorus]`);
    parts.push(`3-4 satır`);
    parts.push(`\n[chorus]`);
    parts.push(`6-8 satır nakarat`);
    parts.push(`\n[verse]`);
    parts.push(`8-10 satır ikinci kıta`);
    parts.push(`\n[pre-chorus]`);
    parts.push(`3-4 satır (tekrar)`);
    parts.push(`\n[chorus]`);
    parts.push(`6-8 satır nakarat (tekrar)`);
    parts.push(`\n[bridge]`);
    parts.push(`6-8 satır köprü`);
    parts.push(`\n[chorus]`);
    parts.push(`6-8 satır final nakarat`);
    parts.push(`\n[outro]`);
    parts.push(`2-3 satır çıkış`);

    parts.push(`\n**ZORUNLU FORMAT KURALLARI:**`);
    parts.push(`1. Her bölüm MUTLAKA etiketle başlamalı: [intro], [verse], [chorus], vb.`);
    parts.push(`2. Her satır kısa olmalı (maksimum 10-12 kelime)`);
    parts.push(`3. Samimi, duygusal ve kişiye özel olmalı`);
    parts.push(`4. Türkçe dilbilgisi ve kafiye kurallarına dikkat et`);
    parts.push(`5. ${request.songDetails.style} bir atmosfer oluştur`);
    parts.push(`6. Şarkı ${request.songDetails.type} türüne uygun olmalı`);
    parts.push(`7. TOPLAM EN AZ 60-70 SATIR OLMALI (2+ dakikalık şarkı için)`);

    return parts.join('\n');
  }

  /**
   * Refine or improve existing lyrics
   */
  async refineLyrics(lyrics: string, feedback: string): Promise<string> {
    try {
      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Sen profesyonel bir şarkı sözü editörüsün. Geri bildirimlere göre şarkı sözlerini iyileştiriyorsun.',
          },
          {
            role: 'user',
            content: `Aşağıdaki şarkı sözlerini şu geri bildirimlere göre düzenle:\n\n**Şarkı Sözleri:**\n${lyrics}\n\n**Geri Bildirim:**\n${feedback}`,
          },
        ],
        max_completion_tokens: 1000,
      };

      // Only add temperature for models that support it (not gpt-5)
      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.7;
      }

      const response = await this.client.post('/chat/completions', requestBody);

      const refinedLyrics = response.data.choices[0]?.message?.content?.trim();

      if (!refinedLyrics) {
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      return refinedLyrics;
    } catch (error: any) {
      console.error('Error refining lyrics:', error.response?.data || error.message);
      throw new Error(`Şarkı sözü düzenleme hatası: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Generate a short prompt for video generation
   */
  async generateVideoPrompt(story: string, songType: string): Promise<string> {
    try {
      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Sen video oluşturma prompt uzmanısın. Kısa, açıklayıcı ve görsel promtlar yazıyorsun.',
          },
          {
            role: 'user',
            content: `Aşağıdaki hikaye ve müzik türü için bir video oluşturma prompt'u yaz (maksimum 100 kelime, İngilizce):\n\nMüzik Türü: ${songType}\n\nHikaye: ${story}`,
          },
        ],
        max_completion_tokens: 200,
      };

      // Only add temperature for models that support it (not gpt-5)
      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.7;
      }

      const response = await this.client.post('/chat/completions', requestBody);

      const prompt = response.data.choices[0]?.message?.content?.trim();

      if (!prompt) {
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      return prompt;
    } catch (error: any) {
      console.error('Error generating video prompt:', error.response?.data || error.message);
      throw new Error(`Video prompt oluşturma hatası: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Synthesize music genre/style for Suno AI V5
   * Combines user's genre selection + notes to create a rich, detailed style description
   */
  async synthesizeMusicGenre(request: LyricsGenerationRequest): Promise<string> {
    try {
      const parts: string[] = [];

      parts.push(`Sen müzik tür uzmanısın. Kullanıcının istediği müzik türünü ve notlarını analiz edip Suno AI V5 için detaylı bir tür açıklaması oluştur.`);
      parts.push(`\n**Kullanıcının seçtiği tür:** ${request.songDetails.type}`);
      parts.push(`**Kullanıcının seçtiği tarz:** ${request.songDetails.style}`);

      if (request.notes) {
        parts.push(`\n**Kullanıcının ek notları:** ${request.notes}`);
        parts.push(`\nÖNEMLİ: Eğer ek notlarda "Melike Şahin tarzı", "Norm Ender gibi", "Ceza rap" gibi sanatçı/tarz belirtmişse bunu MUTLAKA tür açıklamasına ekle.`);
      }

      parts.push(`\n**GÖREV:**`);
      parts.push(`Yukarıdaki bilgileri birleştirerek Suno AI için kısa ama zengin bir tür açıklaması oluştur.`);
      parts.push(`- Tür kombinasyonu yapabilirsin: "Jazz Rap", "Arabesk Pop", "Rock Ballad" vb.`);
      parts.push(`- Sanatçı tarzları ekle: "Melike Şahin tarzı indie", "Ceza tarzı rap", "Sezen Aksu tarzı türkü" vb.`);
      parts.push(`- Alt türleri kullan: "Turkish indie jazz", "conscious rap", "emotional arabesque" vb.`);
      parts.push(`- Enstrüman detayları ekle uygunsa: "with strings", "acoustic guitar", "heavy drums" vb.`);
      parts.push(`\n**FORMAT:**`);
      parts.push(`Sadece tür açıklamasını yaz, başka hiçbir şey ekleme. Maksimum 15-20 kelime, İngilizce.`);
      parts.push(`\nÖRNEKLER:`);
      parts.push(`- "Turkish indie jazz with melancholic vocals, Melike Şahin style"`);
      parts.push(`- "Conscious rap with heavy beats, Ceza and Norm Ender style"`);
      parts.push(`- "Emotional Turkish arabesque pop with strings"`);
      parts.push(`- "Nostalgic acoustic folk ballad with gentle guitar"`);

      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: parts.join('\n'),
          },
        ],
        max_completion_tokens: 100,
      };

      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.7;
      }

      const response = await this.client.post('/chat/completions', requestBody);
      const synthesizedGenre = response.data.choices[0]?.message?.content?.trim();

      if (!synthesizedGenre) {
        // Fallback to basic genre
        return `${request.songDetails.type} ${request.songDetails.style}`.toLowerCase();
      }

      console.log('✅ Music genre synthesized:', synthesizedGenre);
      return synthesizedGenre;
    } catch (error: any) {
      console.error('Error synthesizing music genre:', error.message);
      // Fallback to basic genre on error
      return `${request.songDetails.type} ${request.songDetails.style}`.toLowerCase();
    }
  }

  /**
   * Generic text generation method for conversational AI parsing
   */
  async generateText(prompt: string, options: { temperature?: number; maxTokens?: number } = {}): Promise<string> {
    try {
      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_completion_tokens: options.maxTokens || 500,
      };

      // Only add temperature for models that support it (not gpt-5)
      if (!this.model.includes('gpt-5') && options.temperature !== undefined) {
        requestBody.temperature = options.temperature;
      }

      const response = await this.client.post('/chat/completions', requestBody);

      const text = response.data.choices[0]?.message?.content?.trim();

      if (!text) {
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      return text;
    } catch (error: any) {
      console.error('Error generating text:', error.response?.data || error.message);
      throw new Error(`Metin oluşturma hatası: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}
