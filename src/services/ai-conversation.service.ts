import { OpenAIService } from './openai.service';

/**
 * AI-powered conversational interface for order collection
 * Makes the bot understand natural language and respond warmly
 */
export class AIConversationService {
  constructor(private openaiService: OpenAIService) {}

  /**
   * Clean AI response and extract JSON
   */
  private cleanAndParseJSON(rawResponse: string): any {
    let cleanResult = rawResponse.trim();

    // Remove markdown code blocks
    if (cleanResult.startsWith('```json')) {
      cleanResult = cleanResult.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
    } else if (cleanResult.startsWith('```')) {
      cleanResult = cleanResult.replace(/```\n?/g, '');
    }

    cleanResult = cleanResult.trim();
    return JSON.parse(cleanResult);
  }

  /**
   * Parse user message and extract song type selection
   * If user provides an artist name, detect it and describe the musical style
   */
  async parseSongType(userMessage: string): Promise<{
    type: 'Pop' | 'Rap' | 'Jazz' | 'Arabesk' | 'Klasik' | 'Rock' | 'Metal' | 'Nostaljik' | null;
    response: string;
    artistStyleDescription?: string;
  }> {
    const prompt = `Sen bir müzik stili çevirme uzmanısın. Kullanıcı şarkı türü seçiyor: "${userMessage}"

Müsait şarkı türleri: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik

===========================================
KRİTİK GÖREV: SANATÇI İSİMLERİNİ TESPİT ET VE TEMİZLE
===========================================

ADIM 1: Kullanıcı sanatçı ismi yazmış mı kontrol et
✅ Sanatçı ismi VARSA → Müzikal özellikleri yaz (sanatçı ismi OLMADAN)
❌ Sanatçı ismi YOKSA → Sadece müzik türünü döndür

SANATÇI İSMİ FORMATLAR:
- "Mabel Matiz" / "Dua Lipa" / "Tarkan"
- "X style" → "Dua Lipa style"
- "X tarzında" → "Tarkan tarzında"
- "X gibi" → "Adele gibi"

===========================================
ÖRNEKLER (DİKKATLE İNCELE):
===========================================

Girdi: "Dua Lipa style"
✅ DOĞRU Çıktı:
{
  "type": "Pop",
  "artistStyleDescription": "modern dance-pop with disco influences, catchy hooks and energetic female vocals",
  "response": "Harika! Dua Lipa tarzında bir şarkı hazırlayacağız ✨"
}

❌ YANLIŞ Çıktı (ASLA YAPMA):
{
  "artistStyleDescription": "Dua Lipa style modern pop"  // SANATÇI İSMİ VAR!
}

---

Girdi: "Mabel Matiz"
✅ DOĞRU:
{
  "type": "Jazz",
  "artistStyleDescription": "smooth Turkish jazz with emotional male vocals, melancholic melodies and modern arrangements",
  "response": "Mükemmel! Mabel Matiz tarzında bir şarkı yapacağız 🎵"
}

---

Girdi: "Pop"
✅ DOĞRU:
{
  "type": "Pop",
  "artistStyleDescription": null,  // Sanatçı yok, sadece tür
  "response": "Pop müzik seçildi! ✨"
}

===========================================
KRİTİK KURALLAR (MUTLAKA UYULACAK):
===========================================
1. artistStyleDescription içinde ASLA sanatçı ismi yazma
2. artistStyleDescription sadece müzikal özellikler (İngilizce)
3. "style", "tarzında", "gibi" kelimelerini kullanma
4. Sanatçı tespiti: isim varsa artistStyleDescription doldur, yoksa null

YANLIŞ örnekler (ASLA YAPMA):
❌ "Dua Lipa style energetic pop"
❌ "pop music like Dua Lipa"
❌ "Tarkan tarzında pop"

DOĞRU örnekler:
✅ "modern dance-pop with disco influences"
✅ "smooth Turkish jazz with emotional vocals"
✅ "energetic Turkish pop with dance rhythms"

JSON formatında cevap ver:
{
  "type": "Pop" (veya null),
  "artistStyleDescription": "sadece müzikal özellikler (İngilizce, isim YOK)" veya null,
  "response": "Kullanıcıya mesaj"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      console.log('AI parseSongType raw result:', result);

      const parsed = this.cleanAndParseJSON(result);
      console.log('AI parseSongType parsed:', parsed);

      // Log artist style description if present
      if (parsed.artistStyleDescription) {
        console.log('🎨 Artist style detected:', parsed.artistStyleDescription);
      }

      return parsed;
    } catch (error) {
      console.error('AI parse error:', error);
      return {
        type: null,
        response: `Üzgünüm, tam anlayamadım 😊 Hangi türde bir şarkı istersiniz?

Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal veya Nostaljik türlerinden birini seçebilirsiniz. İstediğiniz türü yazmanız yeterli!`,
      };
    }
  }

  /**
   * Parse song style selection
   */
  async parseSongStyle(userMessage: string, songType: string): Promise<{ style: 'Romantik' | 'Duygusal' | 'Eğlenceli' | 'Sakin' | null; response: string }> {
    const prompt = `Kullanıcı ${songType} şarkısı için tarz seçiyor. Mesajı: "${userMessage}"

Müsait tarzlar: Romantik, Duygusal, Eğlenceli, Sakin

Görevin:
1. Kullanıcının mesajından tarzı anlamaya çalış
2. Eğer net bir tarz belirtmişse, o tarzı döndür
3. Eğer anlaşılmıyorsa, null döndür ve nazikçe seçenekleri hatırlat

KURALLAR:
- "style" değeri MUTLAKA yukarıdaki tarzlardan TAM OLARAK biri olmalı (Romantik, Duygusal, Eğlenceli, Sakin)
- Kullanıcı "romantik bir şey", "romantik tarz" yazabilir - hepsini "Romantik" olarak algıla
- Esneklik göster ama sonuçta tam eşleşme döndür

JSON formatında cevap ver:
{
  "style": "Romantik" (veya başka bir tarz) veya null,
  "response": "Kullanıcıya gönderilecek sıcak, samimi mesaj"
}

Eğer style null ise, response'da şöyle bir mesaj ver:
"Hangi tarzı tercih edersiniz? 😊

Romantik, Duygusal, Eğlenceli veya Sakin tarzlarından birini seçebilirsiniz!"`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        style: null,
        response: `Hangi tarzı tercih edersiniz? 😊

Romantik, Duygusal, Eğlenceli veya Sakin tarzlarından birini seçebilirsiniz!`,
      };
    }
  }

  /**
   * Parse vocal preference
   */
  async parseVocal(userMessage: string): Promise<{ vocal: 'Kadın' | 'Erkek' | 'Fark etmez' | null; response: string }> {
    const prompt = `Kullanıcı vokal tercihi belirtiyor. Mesajı: "${userMessage}"

Seçenekler: Kadın, Erkek, Fark etmez

Görevin:
1. Kullanıcının mesajından vokal tercihini anla
2. Eğer net bir tercih belirtmişse, onu döndür
3. Eğer anlaşılmıyorsa, null döndür

KURALLAR:
- "vocal" değeri MUTLAKA: "Kadın", "Erkek" veya "Fark etmez" olmalı
- Kullanıcı "kadın sesi", "bayan", "kız" yazabilir - hepsini "Kadın" olarak algıla
- "erkek sesi", "bay" → "Erkek"
- "farketmez", "fark etmez", "önemli değil" → "Fark etmez"

JSON formatında cevap ver:
{
  "vocal": "Kadın" (veya diğer seçenekler) veya null,
  "response": "Kullanıcıya gönderilecek sıcak mesaj"
}

Eğer vocal null ise, response'da:
"Şarkıyı hangi seste dinlemek istersiniz? 😊

Kadın sesi, Erkek sesi veya Fark etmez diyebilirsiniz!"`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        vocal: null,
        response: `Şarkıyı hangi seste dinlemek istersiniz? 😊

Kadın sesi, Erkek sesi veya Fark etmez diyebilirsiniz!`,
      };
    }
  }

  /**
   * Parse recipient relation
   */
  async parseRecipientRelation(userMessage: string): Promise<{ relation: string | null; response: string }> {
    const prompt = `Kullanıcı hediye edeceği kişinin kim olduğunu söylüyor. Mesajı: "${userMessage}"

Örnekler: Annem, Babam, Sevgilim, Eşim, Arkadaşım, Kardeşim, vb.

Görevin:
1. Kullanıcının mesajından ilişkiyi (kim olduğunu) çıkar
2. Samimi ve sıcak bir onay mesajı yaz
3. Eğer anlaşılmıyorsa null döndür

JSON formatında cevap ver:
{
  "relation": "çıkarılan ilişki (örn: Sevgilim, Annem)" veya null,
  "response": "Samimi onay mesajı"
}

Eğer relation null ise, response'da:
"Bu şarkıyı hediye edeceğiniz kişi sizin neyiniz? 😊

Örneğin: Annem, Sevgilim, En yakın arkadaşım gibi..."`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.5 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        relation: null,
        response: `Bu şarkıyı hediye edeceğiniz kişi sizin neyiniz? 😊

Örneğin: Annem, Sevgilim, En yakın arkadaşım gibi...`,
      };
    }
  }

  /**
   * Parse yes/no for name in song
   */
  async parseNameInSong(userMessage: string): Promise<{ answer: boolean | null; response: string }> {
    const prompt = `Kullanıcı şarkıda isim geçip geçmeyeceğini söylüyor. Mesajı: "${userMessage}"

Evet mi diyor, Hayır mı?

Görevin:
1. Kullanıcı "evet" diyorsa → true döndür
2. Kullanıcı "hayır" diyorsa → false döndür
3. Anlaşılmıyorsa → null döndür

KURALLAR:
- "evet", "olsun", "geçsin", "istiyorum" → true
- "hayır", "hayir", "gerek yok", "istemiyorum" → false
- Samimi ve sıcak mesaj yaz

JSON formatında cevap ver:
{
  "answer": true veya false veya null,
  "response": "Samimi onay veya açıklama mesajı"
}

Eğer answer null ise:
"Şarkıda hediye edeceğiniz kişinin ismi geçsin mi? 😊

Evet veya Hayır yazabilirsiniz!"`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        answer: null,
        response: `Şarkıda hediye edeceğiniz kişinin ismi geçsin mi? 😊

Evet veya Hayır yazabilirsiniz!`,
      };
    }
  }

  /**
   * Validate and provide feedback on recipient name
   */
  async parseRecipientName(userMessage: string): Promise<{ name: string | null; response: string }> {
    const prompt = `Kullanıcı hediye edeceği kişinin ismini söylüyor. Mesajı: "${userMessage}"

Görevin:
1. Mesajdan ismi çıkar (genellikle tek kelime veya iki kelime)
2. Samimi ve sıcak bir onay mesajı yaz
3. Eğer isim yoksa veya anlamsızsa null döndür

KURALLAR:
- Sadece ismi al (örn: "Ahmet", "Ayşe", "Mehmet Ali")
- Gereksiz kelimeleri atla (örn: "İsmi Ahmet" → "Ahmet")

JSON formatında cevap ver:
{
  "name": "temiz isim" veya null,
  "response": "Samimi onay mesajı (örn: 'Harika! Ahmet için özel bir şarkı hazırlayacağız 💝')"
}

Eğer name null ise:
"Hediye edeceğiniz kişinin adı nedir? 😊

İsmini yazabilirsiniz:"`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        name: null,
        response: `Hediye edeceğiniz kişinin adı nedir? 😊

İsmini yazabilirsiniz:`,
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
        response: `Hikayeniz çok uzun oldu 😊

Lütfen 900 karakteri geçmeyecek şekilde özetleyebilir misiniz? Şu anda ${userMessage.length} karakter.`,
      };
    }

    if (userMessage.length < 20) {
      return {
        isValid: false,
        response: `Biraz daha detay verebilir misiniz? 😊

Şarkının özel olması için duygularınızı, anılarınızı paylaşın. En az birkaç cümle yazmanız yeterli!`,
      };
    }

    const prompt = `Kullanıcı şarkı için hikaye yazdı. Hikaye: "${userMessage}"

Bu hikaye şarkı sözü yazmak için uygun mu? Duygusal içerik var mı? Yeterli detay var mı?

Görevin:
1. Eğer hikaye uygunsa ve duygusal içerik varsa → isValid: true
2. Eğer çok genel, anlamsız veya içerik yoksa → isValid: false
3. Samimi ve sıcak bir mesaj yaz

JSON formatında cevap ver:
{
  "isValid": true veya false,
  "response": "Samimi onay mesajı (örn: 'Harika! Çok güzel bir hikaye 💝 Bundan muhteşem bir şarkı çıkacak!')"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.5 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        isValid: true,
        response: '✅ Teşekkürler! Hikayenizi aldık 💝',
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
