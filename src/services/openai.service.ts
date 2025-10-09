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

      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `Sen profesyonel bir şarkı sözü yazarısın. Duygusal, anlamlı ve müzikal şarkı sözleri yazıyorsun.
            Şarkı sözleri kişiye özel olmalı, samimi ve içten olmalı. Türkçe dilbilgisi kurallarına dikkat et.
            Şarkı sözlerini verse-chorus-verse-chorus-bridge-chorus yapısında oluştur.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.8,
        max_tokens: 1000,
      });

      const lyrics = response.data.choices[0]?.message?.content?.trim();

      if (!lyrics) {
        throw new Error('OpenAI boş yanıt döndürdü');
      }

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
    parts.push(`\n**Şarkı Yapısı:**`);
    parts.push(`- Verse 1 (8 satır)`);
    parts.push(`- Chorus/Nakarat (4-6 satır)`);
    parts.push(`- Verse 2 (8 satır)`);
    parts.push(`- Chorus/Nakarat (tekrar)`);
    parts.push(`- Bridge/Köprü (4 satır)`);
    parts.push(`- Final Chorus (tekrar)`);

    parts.push(`\n**Önemli Kurallar:**`);
    parts.push(`1. Samimi, duygusal ve kişiye özel olmalı`);
    parts.push(`2. Türkçe dilbilgisi ve kafiye kurallarına dikkat et`);
    parts.push(`3. Hikayeden ilham al ama birebir kopyalama`);
    parts.push(`4. ${request.songDetails.style} bir atmosfer oluştur`);
    parts.push(`5. Şarkı ${request.songDetails.type} türüne uygun olmalı`);

    return parts.join('\n');
  }

  /**
   * Refine or improve existing lyrics
   */
  async refineLyrics(lyrics: string, feedback: string): Promise<string> {
    try {
      const response = await this.client.post('/chat/completions', {
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
        temperature: 0.7,
        max_tokens: 1000,
      });

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
      const response = await this.client.post('/chat/completions', {
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
        temperature: 0.7,
        max_tokens: 200,
      });

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
