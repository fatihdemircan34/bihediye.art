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
            Şarkı sözlerini verse-chorus-verse-chorus-bridge-chorus yapısında oluştur.
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
        console.error('Empty lyrics response. Full response:', JSON.stringify(response.data, null, 2));
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      console.log('Lyrics generated successfully, length:', lyrics.length);
      return lyrics;
    } catch (error: any) {
      console.error('Error generating lyrics:', error.response?.data || error.message);
      throw new Error(`Şarkı sözü oluşturma hatası: ${error.response?.data?.error?.message || error.message}`);
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
    parts.push(`- Intro (2-4 satır)`);
    parts.push(`- Verse 1 (12-16 satır)`);
    parts.push(`- Pre-Chorus (4 satır)`);
    parts.push(`- Chorus/Nakarat (8-10 satır)`);
    parts.push(`- Verse 2 (12-16 satır)`);
    parts.push(`- Pre-Chorus (4 satır - tekrar)`);
    parts.push(`- Chorus/Nakarat (8-10 satır - tekrar)`);
    parts.push(`- Bridge/Köprü (8-10 satır)`);
    parts.push(`- Final Chorus (8-10 satır - güçlü final)`);
    parts.push(`- Outro (2-4 satır)`);

    parts.push(`\n**Önemli Kurallar:**`);
    parts.push(`1. Samimi, duygusal ve kişiye özel olmalı`);
    parts.push(`2. Türkçe dilbilgisi ve kafiye kurallarına dikkat et`);
    parts.push(`3. Hikayeden ilham al ama birebir kopyalama`);
    parts.push(`4. ${request.songDetails.style} bir atmosfer oluştur`);
    parts.push(`5. Şarkı ${request.songDetails.type} türüne uygun olmalı`);
    parts.push(`6. TOPLAM EN AZ 80-100 SATIR OLMALI (2+ dakikalık şarkı için)`);
    parts.push(`7. Her bölüm yeterince detaylı ve uzun olmalı`);

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
}
