import { OpenAIService } from './openai.service';

/**
 * AI-powered conversational interface for order collection
 * Makes the bot understand natural language and respond warmly
 */
export class AIConversationService {
  constructor(private openaiService: OpenAIService) {}

  /**
   * Parse user message and extract song type selection
   */
  async parseSongType(userMessage: string): Promise<{ type: 'Pop' | 'Rap' | 'Jazz' | 'Arabesk' | 'Klasik' | 'Rock' | 'Metal' | 'Nostaljik' | null; response: string }> {
    const prompt = `Kullanıcı şarkı türü seçiyor. Mesajı: "${userMessage}"

Müsait şarkı türleri: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik

Eğer kullanıcı bir tür seçtiyse (sayı veya isim), o türü döndür.
Eğer kararsızsa veya soru soruyorsa, yardımcı ol ve seçenekleri açıkla.

ÖNEMLI: "type" değeri MUTLAKA yukarıdaki şarkı türlerinden biri olmalı. Tam olarak aynı yazımla döndür (örn: "Pop", "Rap", "Jazz").

JSON formatında cevap ver:
{
  "type": "Pop" veya null (eğer seçim yapmadıysa),
  "response": "Kullanıcıya gönderilecek mesaj (sıcak, samimi, yardımsever)"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      console.log('AI parseSongType raw result:', result);
      const parsed = JSON.parse(result);
      console.log('AI parseSongType parsed:', parsed);
      return parsed;
    } catch (error) {
      console.error('AI parse error:', error);
      return {
        type: null,
        response: '❌ Üzgünüm, anlamadım. Lütfen 1-8 arası numara veya şarkı türü ismi yazın (örn: Pop, Jazz, Rap)',
      };
    }
  }

  /**
   * Parse song style selection
   */
  async parseSongStyle(userMessage: string, songType: string): Promise<{ style: 'Romantik' | 'Duygusal' | 'Eğlenceli' | 'Sakin' | null; response: string }> {
    const prompt = `Kullanıcı ${songType} şarkısı için tarz seçiyor. Mesajı: "${userMessage}"

Müsait tarzlar: Romantik, Duygusal, Eğlenceli, Sakin

JSON formatında cevap ver:
{
  "style": "Romantik" veya null,
  "response": "Kullanıcıya gönderilecek sıcak mesaj"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.7 });
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      return {
        style: null,
        response: '❌ Hangi tarzı tercih edersiniz? Romantik, Duygusal, Eğlenceli veya Sakin?',
      };
    }
  }

  /**
   * Parse vocal preference
   */
  async parseVocal(userMessage: string): Promise<{ vocal: 'Kadın' | 'Erkek' | 'Fark etmez' | null; response: string }> {
    const prompt = `Kullanıcı vokal tercihi belirtiyor. Mesajı: "${userMessage}"

Seçenekler: Kadın, Erkek, Fark etmez

JSON formatında cevap ver:
{
  "vocal": "Kadın" veya "Erkek" veya "Fark etmez" veya null,
  "response": "Kullanıcıya gönderilecek mesaj"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.7 });
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      return {
        vocal: null,
        response: '❌ Vokal tercihiniz nedir? Kadın sesi mi, Erkek sesi mi, yoksa Fark etmez mi?',
      };
    }
  }

  /**
   * Parse recipient relation
   */
  async parseRecipientRelation(userMessage: string): Promise<{ relation: string | null; response: string }> {
    const prompt = `Kullanıcı hediye edeceği kişinin kim olduğunu söylüyor. Mesajı: "${userMessage}"

Örnekler: Annem, Babam, Sevgilim, Eşim, Arkadaşım, Kardeşim

Kullanıcının mesajından ilişkiyi çıkar ve samimi bir onay mesajı yaz.

JSON formatında cevap ver:
{
  "relation": "çıkarılan ilişki" veya null,
  "response": "Onay mesajı ve sonraki soru"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.7 });
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      return {
        relation: null,
        response: '❌ Bu hediye kime? Örneğin: Annem, Sevgilim, Arkadaşım gibi...',
      };
    }
  }

  /**
   * Parse yes/no for name in song
   */
  async parseNameInSong(userMessage: string): Promise<{ answer: boolean | null; response: string }> {
    const prompt = `Kullanıcı şarkıda isim geçip geçmeyeceğini söylüyor. Mesajı: "${userMessage}"

Evet mi diyor, Hayır mı?

JSON formatında cevap ver:
{
  "answer": true (evet) veya false (hayır) veya null (emin değil),
  "response": "Mesaj"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.5 });
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      return {
        answer: null,
        response: '❌ Şarkıda hediye edeceğiniz kişinin ismi geçsin mi? Evet veya Hayır yazın.',
      };
    }
  }

  /**
   * Validate and provide feedback on recipient name
   */
  async parseRecipientName(userMessage: string): Promise<{ name: string | null; response: string }> {
    const prompt = `Kullanıcı hediye edeceği kişinin ismini söylüyor. Mesajı: "${userMessage}"

İsmi çıkar ve samimi bir onay mesajı yaz.

JSON formatında cevap ver:
{
  "name": "isim" veya null,
  "response": "Onay mesajı"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.5 });
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      return {
        name: null,
        response: '❌ Hediye edeceğiniz kişinin ismini yazın lütfen.',
      };
    }
  }

  /**
   * Validate story length and provide feedback
   */
  async validateStory(userMessage: string): Promise<{ isValid: boolean; response: string }> {
    if (userMessage.length > 900) {
      return {
        isValid: false,
        response: '❌ Hikaye çok uzun oldu. Lütfen 900 karakteri geçmeyecek şekilde özetleyin.',
      };
    }

    if (userMessage.length < 20) {
      return {
        isValid: false,
        response: '❌ Biraz daha detay verebilir misiniz? En az birkaç cümle yazın lütfen.',
      };
    }

    const prompt = `Kullanıcı şarkı için hikaye yazdı. Hikaye: "${userMessage}"

Bu hikaye şarkı sözü yazmak için uygun mu? Duygusal içerik var mı?

JSON formatında cevap ver:
{
  "isValid": true veya false,
  "response": "Samimi onay mesajı veya iyileştirme önerisi"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.7 });
      const parsed = JSON.parse(result);
      return parsed;
    } catch (error) {
      return {
        isValid: true,
        response: '✅ Teşekkürler! Hikayenizi aldık.',
      };
    }
  }

  /**
   * Parse notes or skip
   */
  async parseNotes(userMessage: string): Promise<{ hasNotes: boolean; notes: string | null; response: string }> {
    const message = userMessage.toLowerCase();

    if (message === 'hayır' || message === 'hayir' || message === 'yok' || message === 'gerek yok') {
      return {
        hasNotes: false,
        notes: null,
        response: '✅ Tamam, ek not yok.',
      };
    }

    if (userMessage.length > 300) {
      return {
        hasNotes: false,
        notes: null,
        response: '❌ Not çok uzun. Lütfen 300 karakter içinde yazın.',
      };
    }

    return {
      hasNotes: true,
      notes: userMessage,
      response: '✅ Notunuz alındı! Teşekkürler.',
    };
  }

  /**
   * Parse order confirmation (yes/no)
   */
  async parseConfirmation(userMessage: string): Promise<{ confirmed: boolean | null; response: string }> {
    const message = userMessage.toLowerCase();

    // Evet anlamına gelen kelimeler
    const yesWords = ['evet', 'tamam', 'onaylıyorum', 'onayla', 'sipariş ver', 'devam', 'ok', 'okay', '1'];
    // Hayır anlamına gelen kelimeler
    const noWords = ['hayır', 'hayir', 'iptal', 'vazgeçtim', 'istemiyorum', '2'];

    if (yesWords.some(word => message.includes(word))) {
      return {
        confirmed: true,
        response: '✅ Harika! Siparişinizi oluşturuyoruz...',
      };
    }

    if (noWords.some(word => message.includes(word))) {
      return {
        confirmed: false,
        response: '❌ Sipariş iptal edildi. Yeni sipariş için "merhaba" yazabilirsiniz.',
      };
    }

    return {
      confirmed: null,
      response: '❌ Siparişi onaylıyor musunuz? "Evet" veya "Hayır" yazın.',
    };
  }
}
