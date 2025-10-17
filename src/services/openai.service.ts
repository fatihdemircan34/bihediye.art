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

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LyricsGenerationResult {
  lyrics: string;
  tokenUsage?: TokenUsage;
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
   * @param retryForContentModeration - If true, adds extra strict content filtering instructions
   */
  async generateLyrics(request: LyricsGenerationRequest, retryForContentModeration: boolean = false): Promise<LyricsGenerationResult> {
    try {
      const prompt = this.buildLyricsPrompt(request);

      const systemPrompt = retryForContentModeration
        ? `Sen profesyonel bir şarkı sözü yazarısın. Duygusal, anlamlı ve müzikal şarkı sözleri yazıyorsun.
            Şarkı sözleri kişiye özel olmalı, samimi ve içten olmalı. Türkçe dilbilgisi kurallarına dikkat et.

            🚨 UYARI: ÖNCEKİ ŞARKI SÖZLERİ İÇERİK DENETİMİNDEN REDDEDİLDİ!

            ⚠️ ÇOK ÇOK ÇOK ÖNEMLİ - KATISIKLA İÇERİK KURALLARI:
            - Şarkı sözleri MUTLAKA çocuklar için uygun, temiz, pozitif olmalı
            - YASAK: Şiddet, uyuşturucu, alkol, içki, sigara, cinsellik, argo, küfür, hakaret
            - YASAK: Siyasi, dini, tartışmalı, üzücü, depresif konular
            - YASAK: Ölüm, ayrılık, hüzün, keder, pişmanlık temaları
            - SADECE İZİN VERİLEN: Sevgi, mutluluk, arkadaşlık, aile, çocukluk, anılar, umut, rüyalar
            - Tüm şarkı çocuk programlarında çalınabilecek kadar temiz olmalı
            - Her kelimenin pozitif ve neşeli olmasına DİKKAT ET
            - Şüpheli hiçbir kelime kullanma, %100 güvenli kal

            ÖNEMLI FORMAT KURALI:
            Şarkı sözlerini MUTLAKA şu etiketlerle formatla:
            [intro] - Giriş kısmı
            [verse] - Kıta
            [pre-chorus] - Ön nakarat
            [chorus] - Nakarat
            [bridge] - Köprü
            [outro] - Çıkış

            Her satır kısa ve şarkı söylenebilir olmalı. Uzun cümleler YASAK.
            Şarkı EN AZ 2 dakika uzunluğunda olmalı, yeterince uzun ve detaylı şarkı sözleri yaz.`
        : `Sen profesyonel bir şarkı sözü yazarısın. Duygusal, anlamlı ve müzikal şarkı sözleri yazıyorsun.
            Şarkı sözleri kişiye özel olmalı, samimi ve içten olmalı. Türkçe dilbilgisi kurallarına dikkat et.

            ⚠️ ÇOK ÖNEMLİ - İÇERİK KURALLARI:
            - Şarkı sözleri MUTLAKA temiz, pozitif ve uygun olmalı
            - Şiddet, uyuşturucu, alkol, cinsellik, argo, küfür içeren kelimeler YASAK
            - Siyasi, dini veya tartışmalı konular YASAK
            - Sadece sevgi, mutluluk, arkadaşlık, aile, anılar gibi pozitif temalar kullan
            - Her kelimeyi dikkatli seç - içerik denetiminden geçecek

            ÖNEMLI FORMAT KURALI:
            Şarkı sözlerini MUTLAKA şu etiketlerle formatla:
            [intro] - Giriş kısmı
            [verse] - Kıta
            [pre-chorus] - Ön nakarat
            [chorus] - Nakarat
            [bridge] - Köprü
            [outro] - Çıkış

            Her satır kısa ve şarkı söylenebilir olmalı. Uzun cümleler YASAK.
            Şarkı EN AZ 2 dakika uzunluğunda olmalı, yeterince uzun ve detaylı şarkı sözleri yaz.`;

      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
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

      // Track token usage
      const tokenUsage = response.data.usage;
      if (tokenUsage) {
        console.log('📊 OpenAI Token Usage:', {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        });
      }

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

      return {
        lyrics,
        tokenUsage: tokenUsage ? {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        } : undefined,
      };
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
   * Revise lyrics based on user feedback
   * Used for lyrics review system (max 2 revisions)
   */
  async reviseLyrics(originalLyrics: string, userFeedback: string): Promise<LyricsGenerationResult> {
    try {
      const systemPrompt = `Sen profesyonel bir şarkı sözü editörüsün. Kullanıcının geri bildirimlerine göre şarkı sözlerini düzenliyorsun.

ÖNEMLI KURALLAR:
1. Kullanıcının istediği değişiklikleri yap
2. Şarkının genel yapısını ve format etiketlerini ([intro], [verse], [chorus], vb.) koru
3. Şarkının ritmini ve kafiyesini koru
4. Şarkı sözlerini temiz, pozitif ve içerik denetiminden geçebilir tut
5. Sadece düzenlenmiş şarkı sözlerini döndür, açıklama yapma

FORMAT KURALI:
Şarkı sözlerini MUTLAKA etiketlerle formatla:
[intro], [verse], [pre-chorus], [chorus], [bridge], [outro]`;

      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Aşağıdaki şarkı sözlerini kullanıcının geri bildirimlerine göre düzenle:

**MEVCUT ŞARKI SÖZLERİ:**
${originalLyrics}

**KULLANICININ GERİ BİLDİRİMİ:**
${userFeedback}

Şarkı sözlerini düzenle ve sadece yeni versiyonu döndür:`,
          },
        ],
        max_completion_tokens: 2000,
      };

      // Only add temperature for models that support it (not gpt-5)
      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.7;
      }

      console.log('🔄 Revising lyrics based on user feedback...');

      const response = await this.client.post('/chat/completions', requestBody);

      // Track token usage
      const tokenUsage = response.data.usage;
      if (tokenUsage) {
        console.log('📊 OpenAI Token Usage (Revision):', {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        });
      }

      const revisedLyrics = response.data.choices[0]?.message?.content?.trim();

      if (!revisedLyrics) {
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      console.log('✅ Lyrics revised successfully');
      console.log('- Original length:', originalLyrics.length);
      console.log('- Revised length:', revisedLyrics.length);

      return {
        lyrics: revisedLyrics,
        tokenUsage: tokenUsage ? {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      console.error('❌ Error revising lyrics:', error.response?.data || error.message);
      throw new Error(`Şarkı sözü revizyonu hatası: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Format user-written lyrics to Suno AI format with proper tags
   * Used when user writes their own complete lyrics (option 3)
   */
  async formatUserLyrics(userLyrics: string): Promise<LyricsGenerationResult> {
    try {
      const systemPrompt = `Sen profesyonel bir şarkı sözü formatçısısın. Kullanıcının yazdığı şarkı sözlerini Suno AI formatına çeviriyorsun.

GÖREV:
1. Kullanıcının yazdığı sözleri analiz et
2. Şarkının yapısını belirle (giriş, kıtalar, nakarat, köprü, çıkış)
3. Uygun Suno AI etiketlerini ekle: [intro], [verse], [pre-chorus], [chorus], [bridge], [outro], [instrumental break]
4. Her satırın kısa ve şarkı söylenebilir olmasını sağla
5. Sözlerin anlamını ve sırasını DEĞIŞTIRME, sadece format ekle
6. İçerik denetiminden geçebilir olmasını sağla (temiz, pozitif)

FORMAT KURALLARI:
- Her bölüm MUTLAKA etiketle başlamalı
- Satırlar kısa olmalı (maksimum 10-12 kelime)
- Şarkı yapısı mantıklı olmalı
- En az 2 dakikalık şarkı için yeterli uzunlukta olmalı

Sadece formatlanmış şarkı sözlerini döndür, başka açıklama yapma.`;

      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: systemPrompt,
          },
          {
            role: 'user',
            content: `Aşağıdaki şarkı sözlerini Suno AI formatına çevir:

${userLyrics}`,
          },
        ],
        max_completion_tokens: 2000,
      };

      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.5;
      }

      console.log('📝 Formatting user-written lyrics to Suno AI format...');

      const response = await this.client.post('/chat/completions', requestBody);

      // Track token usage
      const tokenUsage = response.data.usage;
      if (tokenUsage) {
        console.log('📊 OpenAI Token Usage (Format User Lyrics):', {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        });
      }

      const formattedLyrics = response.data.choices[0]?.message?.content?.trim();

      if (!formattedLyrics) {
        throw new Error('OpenAI boş yanıt döndürdü');
      }

      console.log('✅ User lyrics formatted successfully');
      console.log('- Original length:', userLyrics.length);
      console.log('- Formatted length:', formattedLyrics.length);
      console.log('- Has tags:', /\[verse\]|\[chorus\]|\[bridge\]/.test(formattedLyrics));

      return {
        lyrics: formattedLyrics,
        tokenUsage: tokenUsage ? {
          promptTokens: tokenUsage.prompt_tokens,
          completionTokens: tokenUsage.completion_tokens,
          totalTokens: tokenUsage.total_tokens,
        } : undefined,
      };
    } catch (error: any) {
      console.error('❌ Error formatting user lyrics:', error.response?.data || error.message);
      throw new Error(`Şarkı sözü formatlama hatası: ${error.response?.data?.error?.message || error.message}`);
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
      }

      parts.push(`\n🚨 KRITIK KURAL - SANATÇI İSİMLERİ YASAK:`);
      parts.push(`Suno AI sanatçı isimlerini kabul etmiyor. Eğer notlarda sanatçı ismi varsa, ONU KULLANMA!`);
      parts.push(`Bunun yerine sanatçının MÜZİKAL ÖZELLİKLERİNİ yaz:`);
      parts.push(`- ❌ "Lvbel C5 style" → ✅ "fun Turkish rap with upbeat rhythms"`);
      parts.push(`- ❌ "Melike Şahin tarzı" → ✅ "melancholic Turkish indie with female vocals"`);
      parts.push(`- ❌ "Ceza and Norm Ender style" → ✅ "conscious rap with heavy beats and storytelling"`);
      parts.push(`- ❌ "Sezen Aksu tarzı" → ✅ "emotional Turkish pop with classic arrangements"`);

      parts.push(`\n**GÖREV:**`);
      parts.push(`Yukarıdaki bilgileri birleştirerek Suno AI için kısa ama zengin bir tür açıklaması oluştur.`);
      parts.push(`- Tür kombinasyonu yapabilirsin: "Jazz Rap", "Arabesk Pop", "Rock Ballad" vb.`);
      parts.push(`- SANATÇI İSMİ YERİNE MÜZİKAL ÖZELLİKLER kullan: "melancholic vocals", "heavy beats", "storytelling rap" vb.`);
      parts.push(`- Alt türleri kullan: "Turkish indie jazz", "conscious rap", "emotional arabesque" vb.`);
      parts.push(`- Enstrüman detayları ekle: "with strings", "acoustic guitar", "heavy drums" vb.`);
      parts.push(`\n**FORMAT:**`);
      parts.push(`Sadece tür açıklamasını yaz, başka hiçbir şey ekleme. Maksimum 15-20 kelime, İngilizce.`);
      parts.push(`HİÇBİR SANATÇI İSMİ OLMAMALI!`);
      parts.push(`\nÖRNEKLER (SANATÇI İSİMSİZ):`);
      parts.push(`- "Turkish indie jazz with melancholic vocals and soft instrumentation"`);
      parts.push(`- "Conscious rap with heavy beats and storytelling"`);
      parts.push(`- "Emotional Turkish arabesque pop with strings"`);
      parts.push(`- "Nostalgic acoustic folk ballad with gentle guitar"`);
      parts.push(`- "Fun Turkish rap with upbeat rhythms and energetic flow"`);

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
      let synthesizedGenre = response.data.choices[0]?.message?.content?.trim();

      if (!synthesizedGenre) {
        // Fallback to basic genre
        return `${request.songDetails.type} ${request.songDetails.style}`.toLowerCase();
      }

      // Double-check: Remove any potential artist names that slipped through
      synthesizedGenre = await this.removeArtistNames(synthesizedGenre);

      console.log('✅ Music genre synthesized:', synthesizedGenre);
      return synthesizedGenre;
    } catch (error: any) {
      console.error('Error synthesizing music genre:', error.message);
      // Fallback to basic genre on error
      return `${request.songDetails.type} ${request.songDetails.style}`.toLowerCase();
    }
  }

  /**
   * Remove artist names from style description using AI
   * This is a safety check to catch any artist names that slip through
   */
  private async removeArtistNames(styleDescription: string): Promise<string> {
    try {
      const cleaningPrompt = `Sen bir müzik tür uzmanısın. Aşağıdaki müzik tür açıklamasında SANATÇI İSİMLERİ var mı kontrol et.
Eğer varsa, sanatçı ismini ÇIKAR ve yerine o sanatçının MÜZİKAL ÖZELLİKLERİNİ yaz.

MEVCUT AÇIKLAMA:
${styleDescription}

GÖREV:
1. Sanatçı isimleri tespit et (Türk veya yabancı tüm sanatçılar)
2. Sanatçı ismi varsa çıkar
3. Yerine müzikal özellikleri yaz: "melancholic vocals", "heavy beats", "storytelling", "upbeat rhythms" vb.
4. Sanatçı ismi yoksa açıklamayı AYNEN döndür

Sadece temizlenmiş tür açıklamasını döndür, başka hiçbir şey yazma. Maksimum 20 kelime, İngilizce.`;

      const requestBody: any = {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: cleaningPrompt,
          },
        ],
        max_completion_tokens: 80,
      };

      if (!this.model.includes('gpt-5')) {
        requestBody.temperature = 0.5;
      }

      const response = await this.client.post('/chat/completions', requestBody);
      const cleanedGenre = response.data.choices[0]?.message?.content?.trim();

      if (!cleanedGenre) {
        return styleDescription; // Return original if cleaning fails
      }

      // Log if changes were made
      if (cleanedGenre !== styleDescription) {
        console.log('🧹 Artist name detected and removed:');
        console.log(`   Before: "${styleDescription}"`);
        console.log(`   After:  "${cleanedGenre}"`);
      }

      return cleanedGenre;
    } catch (error: any) {
      console.error('Error removing artist names:', error.message);
      return styleDescription; // Return original on error
    }
  }

  /**
   * Analyze lyrics and identify potentially sensitive words
   * Returns analysis with flagged words
   */
  async analyzeLyricsForSensitiveContent(lyrics: string): Promise<{
    hasSensitiveWords: boolean;
    flaggedWords: string[];
    suggestions: string;
  }> {
    try {
      const analysisPrompt = `Sen bir içerik moderasyon uzmanısın. Aşağıdaki şarkı sözlerini analiz et ve müzik platformları tarafından hassas olarak kabul edilebilecek kelimeleri tespit et.

ŞARKI SÖZLERİ:
${lyrics}

ÖNEMLİ: Aşağıdaki kategorilerdeki kelimeleri tespit et:
- Şiddet, silah, kavga, savaş
- Alkol, içki, sarhoşluk
- Uyuşturucu, sigara
- Cinsellik, romantik olmayan cinsel içerik
- Argo, küfür
- Ölüm, intihar, keder
- Siyasi, dini referanslar

JSON formatında yanıt ver:
{
  "hasSensitiveWords": true/false,
  "flaggedWords": ["kelime1", "kelime2"],
  "suggestions": "Bu kelimeleri şöyle değiştirebilirsin..."
}`;

      const response = await this.generateText(analysisPrompt, { temperature: 0.3, maxTokens: 500 });

      // Parse JSON response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]);
        return analysis;
      }

      // Fallback
      return {
        hasSensitiveWords: false,
        flaggedWords: [],
        suggestions: '',
      };
    } catch (error: any) {
      console.error('Error analyzing lyrics:', error.message);
      return {
        hasSensitiveWords: false,
        flaggedWords: [],
        suggestions: '',
      };
    }
  }

  /**
   * Clean lyrics by removing sensitive words
   */
  async cleanLyrics(lyrics: string, flaggedWords: string[]): Promise<string> {
    try {
      const cleaningPrompt = `Sen profesyonel bir şarkı sözü editörüsün. Aşağıdaki şarkı sözlerinden hassas kelimeleri çıkar ve yerine uygun alternatifler koy.

ŞARKI SÖZLERİ:
${lyrics}

HASSASİYET TESPİT EDİLEN KELİMELER:
${flaggedWords.join(', ')}

GÖREV:
1. Bu kelimeleri şarkının anlamını bozmadan değiştir
2. Şarkı akışını ve kafiyeyi koru
3. Pozitif, temiz alternatifler kullan
4. Format etiketlerini ([intro], [verse], vb.) koru

Sadece temizlenmiş şarkı sözlerini döndür, başka açıklama yapma.`;

      return await this.generateText(cleaningPrompt, { temperature: 0.7, maxTokens: 2000 });
    } catch (error: any) {
      console.error('Error cleaning lyrics:', error.message);
      throw error;
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
