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
    type: string | null; // Artık sadece tek tür değil, sentezlenmiş türler de olabilir
    response: string;
    artistStyleDescription?: string;
  }> {
    const prompt = `Sen bir müzik stili çevirme uzmanısın. Kullanıcı şarkı türü seçiyor: "${userMessage}"

Müsait şarkı türleri: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik

ÖNEMLİ: Kullanıcı birden fazla tür yazabilir (örn: "pop arabesk", "jazz rock")
Bu durumda türleri SENTEZLE ve İngilizce müzikal tanıma çevir!

===========================================
GÖREV 1: TÜR SENTEZİ (GENRE SYNTHESIS)
===========================================

Kullanıcı birden fazla tür yazarsa:
- "pop arabesk" → artistStyleDescription: "modern Turkish pop with arabesque influences"
- "jazz rock" → artistStyleDescription: "jazz-rock fusion with smooth melodies and guitar riffs"
- "rap metal" → artistStyleDescription: "rap-metal fusion with aggressive vocals and heavy guitars"

Bu durumda "type" olarak ilk türü döndür, ama artistStyleDescription'da sentezi yaz.

===========================================
GÖREV 2: SANATÇI İSİMLERİNİ MÜZİKAL TARZA ÇEVİR
===========================================

SENİN SORUMLULUĞUN:
Eğer kullanıcı bir sanatçı ismi yazıyorsa (örn: "Dua Lipa", "Tarkan", "Melike Şahin"):
1. O sanatçının müzikal özelliklerini İngilizce olarak tanımla
2. ASLA sanatçı ismini yazma - sadece müzikal özellikleri yaz
3. Suno AI API'si sanatçı isimlerini reddediyor - sen çevirmelisin

ÖNEMLİ: Sanatçı isminde vokal cinsiyet BELİRTME!
- "Melike Şahin" → "indie pop with alternative influences" (female vocals YAZMA)
- "Tarkan" → "energetic Turkish pop with dance rhythms" (male vocals YAZMA)
Vokal tercihi daha önce soruldu, onu kullan!

SANATÇI İSMİ FORMATLAR:
- "Mabel Matiz" / "Dua Lipa" / "Tarkan" / "Melike Şahin"
- "X style" → "Dua Lipa style"
- "X tarzında" → "Tarkan tarzında"
- "X gibi" → "Adele gibi"

===========================================
ÖRNEKLER (DİKKATLE İNCELE):
===========================================

Girdi: "pop arabesk"
✅ DOĞRU:
{
  "type": "Pop",
  "artistStyleDescription": "modern Turkish pop with arabesque influences",
  "response": "Harika! Pop-Arabesk karışımı bir şarkı hazırlayacağız ✨"
}

---

Girdi: "Melike Şahin"
✅ DOĞRU:
{
  "type": "Pop",
  "artistStyleDescription": "indie pop with alternative influences",
  "response": "Harika! Melike Şahin tarzında bir şarkı hazırlayacağız 🎵"
}

❌ YANLIŞ (female vocals YAZMA):
{
  "artistStyleDescription": "indie pop with emotional female vocals"  // VOKAL BELİRTME! ❌
}

---

Girdi: "Tarkan tarzında"
✅ DOĞRU:
{
  "type": "Pop",
  "artistStyleDescription": "energetic Turkish pop with dance rhythms",
  "response": "Mükemmel! Tarkan tarzında bir şarkı yapacağız 🎶"
}

❌ YANLIŞ (male vocals YAZMA):
{
  "artistStyleDescription": "energetic Turkish pop with powerful male vocals"  // VOKAL BELİRTME! ❌
}

---

Girdi: "Pop"
✅ DOĞRU:
{
  "type": "Pop",
  "artistStyleDescription": null,
  "response": "Pop müzik seçildi! ✨"
}

===========================================
KRİTİK KURALLAR (MUTLAKA UYULACAK):
===========================================
1. artistStyleDescription içinde ASLA sanatçı ismi yazma (Türkçe veya İngilizce)
2. artistStyleDescription içinde ASLA vokal cinsiyet yazma (female/male vocals)
3. artistStyleDescription sadece müzikal özellikler (İngilizce)
4. "style", "like", "tarzında", "gibi" kelimelerini kullanma
5. Büyük harfle başlayan iki kelimelik isimler = sanatçı ismi (örn: Dua Lipa, Melike Şahin, Mabel Matiz)

YANLIŞ örnekler (ASLA YAPMA):
❌ "Dua Lipa style energetic pop"                    → İsim var! ❌
❌ "indie pop with emotional female vocals"          → Vokal var! ❌
❌ "energetic Turkish pop with powerful male vocals" → Vokal var! ❌
❌ "Tarkan tarzında pop"                             → İsim var! ❌

DOĞRU örnekler:
✅ "modern dance-pop with disco influences"
✅ "indie pop with alternative influences"
✅ "energetic Turkish pop with dance rhythms"
✅ "modern Turkish pop with arabesque influences"

===========================================
ÖNEMLİ: CEVAP VERMEDEN ÖNCE KONTROL ET
===========================================
artistStyleDescription yazdıysan, BU KONTROLÜ YAP:

1. İçinde sanatçı ismi var mı? → SİL!
2. İçinde "female vocals" veya "male vocals" var mı? → SİL!
3. İçinde "style", "like", "tarzında", "gibi" var mı? → SİL!
4. Sadece müzikal terimler mi var? → İYİ

===========================================
KRİTİK: SADECE JSON DÖNDÜR, BAŞKA HİÇBİR ŞEY YAZMA!
===========================================

CEVAP FORMATI (BAŞKA HİÇBİR ŞEY YAZMA):
{
  "type": "Pop",
  "artistStyleDescription": "müzikal özellikler (isim ve vokal YOK)" veya null,
  "response": "Kullanıcıya mesaj"
}

UYARI: JSON dışında TEK KELİME bile yazma! Açıklama yazma! Sadece JSON!`;

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

  /**
   * Parse lyrics review response (approve, revise, or reject)
   */
  async parseLyricsReview(userMessage: string): Promise<{
    action: 'approve' | 'revise' | null;
    revisionRequest?: string;
    response: string;
  }> {
    const message = userMessage.toLowerCase().trim();

    // Onayla kelimeleri
    const approveWords = ['onayla', 'onaylıyorum', 'tamam', 'evet', 'güzel', 'süper', 'harika', '1'];
    // Revize kelimeleri
    const reviseWords = ['revize', 'düzelt', 'değiştir', 'revize et', 'düzeltme', '2'];

    if (approveWords.some(word => message.includes(word))) {
      return {
        action: 'approve',
        response: '✅ Şarkı sözleri onaylandı! Devam ediyoruz...',
      };
    }

    if (reviseWords.some(word => message.includes(word)) || message.length > 15) {
      // Uzun mesaj = revizyon talebi
      return {
        action: 'revise',
        revisionRequest: userMessage,
        response: '✏️ Anlad ım! Şarkı sözlerini düzenliyoruz...',
      };
    }

    return {
      action: null,
      response: '❓ Şarkı sözlerini onaylıyor musunuz yoksa değişiklik mi istiyorsunuz?\n\n1️⃣ Onayla\n2️⃣ Değişiklik İstiyorum (ne değiştirmek istediğinizi yazın)',
    };
  }

  /**
   * Parse combined song settings (type + style + vocal)
   * Example: "Pop, Romantik, Kadın" or "Rap romantic female"
   * PROGRESSIVE: Remembers previously collected data
   */
  async parseSongSettings(
    userMessage: string,
    existingData?: { type?: string; style?: string; vocal?: string; artistStyleDescription?: string }
  ): Promise<{
    type: string | null;
    style: string | null;
    vocal: string | null;
    artistStyleDescription?: string;
    response: string;
  }> {
    // Start with existing data if available
    const existing = existingData || {};

    const prompt = `Kullanıcı şarkı ayarları veriyor: "${userMessage}"

MEVCUT BİLGİLER (daha önce alındı):
- Tür: ${existing.type || 'YOK'}
- Tarz: ${existing.style || 'YOK'}
- Vokal: ${existing.vocal || 'YOK'}
- Artist Style: ${existing.artistStyleDescription || 'YOK'}

GÖREV:
Kullanıcının yeni mesajından EKSİK olan bilgileri çıkar.
DOLU olanları KORU (değiştirme!).

ÖNEMLİ KURALLAR:
1. Kullanıcı "arabesk rock" derse → type: "Arabesk" AL (birden fazla tür = ilk türü al)
2. Kullanıcı "eğlenceli çoşturan" derse → style: "Eğlenceli" AL
3. Kullanıcı "fark etmez" derse → vocal: "Fark etmez" AL
4. Sanatçı ismi varsa (örn: "Melike Şahin tarzı") → artistStyleDescription'a müzikal tarza çevir
5. ESNEKLİK: Kullanıcı tam kelimeyi yazmasa da anla (örn: "coşkan" → "Eğlenceli")

TÜR SEÇENEKLERİ: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik
TARZ SEÇENEKLERİ: Romantik, Duygusal, Eğlenceli, Sakin
VOKAL SEÇENEKLERİ: Kadın, Erkek, Fark etmez

JSON CEVAP:
{
  "type": "çıkarılan tür veya mevcut tür veya null",
  "style": "çıkarılan tarz veya mevcut tarz veya null",
  "vocal": "çıkarılan vokal veya mevcut vokal veya null",
  "artistStyleDescription": "müzikal özellikler veya null",
  "response": "Samimi mesaj"
}

CEVAP KURALLARI:
- Eğer HERŞEYİ topladıysan: "Harika! Arabesk-Rock karışımı, eğlenceli bir şarkı hazırlıyoruz! 🎵"
- Eğer hala eksik varsa: "Eksik bilgiler: [sadece eksikleri listele]"
- ASLA dolu bilgiyi tekrar sorma!`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      const parsed = this.cleanAndParseJSON(result);

      // Merge with existing data (preserve what was already collected)
      return {
        type: parsed.type || existing.type || null,
        style: parsed.style || existing.style || null,
        vocal: parsed.vocal || existing.vocal || null,
        artistStyleDescription: parsed.artistStyleDescription || existing.artistStyleDescription,
        response: parsed.response,
      };
    } catch (error) {
      // Fallback: preserve existing data
      return {
        type: existing.type || null,
        style: existing.style || null,
        vocal: existing.vocal || null,
        artistStyleDescription: existing.artistStyleDescription,
        response: `Şarkınızı özelleştirelim! Eksik bilgiler:

${!existing.type ? '🎵 Tür: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik\n' : ''}${!existing.style ? '🎭 Tarz: Romantik, Duygusal, Eğlenceli, Sakin\n' : ''}${!existing.vocal ? '🎤 Vokal: Kadın, Erkek, Fark etmez\n' : ''}
Örnek: "Arabesk Rock, Eğlenceli"`,
      };
    }
  }

  /**
   * Parse combined recipient info (relation + name + include name)
   * Example: "Annem, Evet, Ayşe" or "Sevgilim Mehmet"
   */
  async parseRecipientInfo(userMessage: string): Promise<{
    relation: string | null;
    name: string | null;
    includeNameInSong: boolean | null;
    response: string;
  }> {
    const prompt = `Kullanıcı hediye bilgilerini veriyor: "${userMessage}"

3 bilgi almalıyız:
1. İlişki: Annem, Sevgilim, Arkadaşım, vb.
2. İsim geçsin mi: Evet/Hayır
3. İsim (eğer geçecekse): Ayşe, Mehmet, vb.

JSON cevap ver:
{
  "relation": "ilişki" veya null,
  "name": "isim" veya null (sadece geçecekse),
  "includeNameInSong": true/false/null,
  "response": "Kullanıcıya mesaj"
}

Eksik varsa response'da sor.
Eğer kullanıcı sadece ilişki yazdıysa, isim sorulsun.`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        relation: null,
        name: null,
        includeNameInSong: null,
        response: `Hediye bilgileri:

💝 Bu kişi sizin neyiniz? (Annem, Sevgilim, vb.)
📝 Şarkıda ismini geçirmek ister misiniz? (Evet/Hayır)
✏️ İsmi nedir? (Geçecekse)

Örnek: "Annem, Evet, Ayşe"`,
      };
    }
  }

  /**
   * Parse combined story and notes
   */
  async parseStoryAndNotes(userMessage: string): Promise<{
    story: string | null;
    notes: string | null;
    response: string;
  }> {
    if (userMessage.length > 1200) {
      return {
        story: null,
        notes: null,
        response: `Mesaj çok uzun (${userMessage.length} karakter). Lütfen 1200 karakter altında yazın.`,
      };
    }

    if (userMessage.length < 20) {
      return {
        story: null,
        notes: null,
        response: `Biraz daha detay verebilir misiniz? 😊

Hikayenizi ve varsa özel isteklerinizi yazın (en az birkaç cümle).`,
      };
    }

    const prompt = `Kullanıcı hikaye ve notları yazdı: "${userMessage}"

Kullanıcı "Not:" veya benzer ayırıcı kullanmış olabilir.
Ayırıcı yoksa tüm metni hikaye olarak al.

JSON cevap ver:
{
  "story": "hikaye kısmı",
  "notes": "not kısmı" veya null,
  "response": "Samimi onay mesajı"
}`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      const parsed = this.cleanAndParseJSON(result);

      // Eğer story yok ama notes varsa, hepsini story yap
      if (!parsed.story && parsed.notes) {
        parsed.story = parsed.notes;
        parsed.notes = null;
      }

      return parsed;
    } catch (error) {
      // Fallback: Tüm mesajı hikaye olarak al
      return {
        story: userMessage,
        notes: null,
        response: '✅ Hikayeniz alındı! Harika bir şarkı çıkacak 💝',
      };
    }
  }
}
