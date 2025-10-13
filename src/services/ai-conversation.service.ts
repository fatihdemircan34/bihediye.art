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
   * MAXIMUM FLEXIBILITY: Accepts people, businesses, cities, concepts, themes!
   */
  async parseRecipientRelation(userMessage: string): Promise<{ relation: string | null; response: string }> {
    const prompt = `Kullanıcı hediye/şarkı için ne/kim hakkında olduğunu söylüyor. Mesajı: "${userMessage}"

=========================================
MAKSIMUM ESNEKLİK - HER ŞEYİ KABUL ET!
=========================================

Bu şarkı HERHANGİ BİR ŞEY HAKKINDA olabilir:
✅ Kişiler: Annem, Sevgilim, Arkadaşım
✅ İşletmeler: İşletmem, Firmam, Bi Hediye, Cafe XYZ
✅ Projeler: Projem, Ürünüm
✅ Şehirler: İstanbul, Ankara, Paris
✅ Kavramlar: Aşk, Dostluk, Bir Şehir Aşkı, Özlem
✅ Temalar: Doğa, Deniz, Yolculuk

ÖRNEKLER:

Kullanıcı: "bir sehir aski"
✅ {
  "relation": "Bir Şehir Aşkı",
  "response": "Harika! 'Bir Şehir Aşkı' temasında özel bir şarkı hazırlayacağız 🎵"
}

Kullanıcı: "istanbul"
✅ {
  "relation": "İstanbul",
  "response": "Mükemmel! İstanbul için özel bir şarkı hazırlıyoruz 🎶"
}

Kullanıcı: "işletmem"
✅ {
  "relation": "İşletmem",
  "response": "Harika! İşletmeniz için özel bir şarkı hazırlayacağız 🎵"
}

Kullanıcı: "annem"
✅ {
  "relation": "Annem",
  "response": "Ne güzel! Anneniz için çok özel bir şarkı hazırlayacağız 💝"
}

GÖREV:
1. Kullanıcının mesajından NE/KİM olduğunu çıkar
2. AŞIRI ESNEK OL - kullanıcı ne demişse AYNEN kabul et
3. Samimi ve sıcak bir onay mesajı yaz
4. Sadece tamamen anlamsızsa null döndür

JSON formatında cevap ver:
{
  "relation": "çıkarılan şey/kişi/tema" veya null,
  "response": "Samimi onay mesajı"
}

KRİTİK: Kullanıcı NE DEMİŞSE kabul et! Şehir, kavram, kişi, işletme - hepsi geçerli!`;

    try {
      const result = await this.openaiService.generateText(prompt, { temperature: 0.5 });
      return this.cleanAndParseJSON(result);
    } catch (error) {
      return {
        relation: null,
        response: `Bu şarkı ne/kim hakkında? 😊

(Kişi, işletme, şehir, kavram - her şey olabilir!)`,
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

**KRİTİK İSTİSNA: DÜZELTME (CORRECTION) ALGILA!**
Eğer kullanıcı "değil", "demedim", "yanlış", "hayır öyle değil" gibi kelimeler kullanıyorsa:
→ Bu bir DÜZELTME! Mevcut veriyi DEĞİŞTİR!

Örnekler:
- "sakin demedim pozitif dedim" → style'ı "Sakin"den "Eğlenceli"ye DEĞİŞTİR
- "kadın değil erkek olsun" → vocal'i "Kadın"dan "Erkek"e DEĞİŞTİR

=========================================
ÇOK ÖNEMLİ: ESNEKLİK!
=========================================

TÜR: HERHANGİ BİR MÜZİK TÜRÜ KABULEDİLİR!
✅ Önerilen: Pop, Rap, Jazz, Arabesk, Klasik, Rock, Metal, Nostaljik
✅ Ama bunlarla sınırlı değil! Kullanıcı başka tür yazarsa KABUL ET:
  - "Reggae" → type: "Reggae"
  - "Türkü" → type: "Türkü"
  - "EDM" → type: "EDM"
  - "Blues" → type: "Blues"
  - "Folk" → type: "Folk"

TARZ: HERHANGİ BİR TARZ/MOOD KABULEDİLİR!
✅ Önerilen: Romantik, Duygusal, Eğlenceli, Sakin
✅ Ama bunlarla sınırlı değil! Kullanıcı başka tarz yazarsa AYNEN KABUL ET:
  - "pozitif" → style: "Pozitif" (aynen kullan!)
  - "çoşturan" → style: "Çoşturan" (aynen kullan!)
  - "hareketli" → style: "Hareketli" (aynen kullan!)
  - "neşeli" → style: "Neşeli" (aynen kullan!)

KRİTİK: Kullanıcı NE DEMİŞSE, AYNEN style'a yaz!
Mapping YAPMA! Suno AI zaten anlayacak.
Kullanıcı "pozitif" dediyse → style: "Pozitif" (not "Eğlenceli"!)
Kullanıcı "rahatlatıcı" dediyse → style: "Rahatlatıcı" (not "Sakin"!)

VOKAL:
✅ Kadın, Erkek, Fark etmez
✅ "farketmez", "önemli değil", "상관없어" → "Fark etmez"

TÜRK MÜZİK TERİMLERİ:
- "arabesk rock", "pop arabesk" → type: ilk tür, artistStyleDescription: fusion açıklaması
- "anadolu rock" → type: "Rock", artistStyleDescription: "Anatolian rock"
- "türkü", "halk müziği" → type: "Türkü" veya "Nostaljik"

KRİTİK KURAL:
- Kullanıcı BİLİNMEYEN bir müzik türü/tarzı yazarsa → REDDETME, KABUL ET!
- Eğer müzik ile ilgili bir terim görürsen → tür veya tarz olarak al
- Sadece tamamen anlamsızsa (örn: "asdasd", "123") → null döndür

Mevcut bilgileri ASLA değiştirme, sadece EKSİK olanları ekle!

CONCRETE ÖRNEKLER:

Örnek 1: Normal progression
Mevcut: type=YOK, style=YOK, vocal=YOK
Kullanıcı: "Arabesk Rock türü olsun anadolu ateşi gibi"
✅ DOĞRU CEVAP:
{
  "type": "Arabesk",
  "style": null,
  "vocal": null,
  "artistStyleDescription": "energetic Anatolian rock with arabesque-rock fusion",
  "response": "Harika! Arabesk-Rock tarzı seçildi 🎸 Şimdi tarz olarak Romantik, Duygusal, Eğlenceli veya Sakin hangisi olsun?"
}

Örnek 2: Filling missing data
Mevcut: type="Newage", style="Sakin", vocal=YOK
Kullanıcı: "kadın olsun"
✅ DOĞRU CEVAP:
{
  "type": "Newage",
  "style": "Sakin",
  "vocal": "Kadın",
  "response": "Mükemmel! Newage tarzında Sakin bir şarkı, Kadın sesiyle hazırlıyoruz! 🎵"
}

Örnek 3: DÜZELTME - User corrects wrong data
Mevcut: type="Newage", style="Sakin", vocal=YOK
Kullanıcı: "sakin demedim pozitif dedim kadın olsun"
✅ DOĞRU CEVAP:
{
  "type": "Newage",
  "style": "Pozitif",
  "vocal": "Kadın",
  "response": "Anladım! Newage tarzında Pozitif bir şarkı, Kadın sesiyle hazırlıyoruz! 🎵"
}

Örnek 4: DÜZELTME - Simple correction
Mevcut: type="Pop", style="Romantik", vocal="Kadın"
Kullanıcı: "kadın değil erkek olsun"
✅ DOĞRU CEVAP:
{
  "type": "Pop",
  "style": "Romantik",
  "vocal": "Erkek",
  "response": "Düzeltildi! Pop tarzında Romantik bir şarkı, Erkek sesiyle hazırlıyoruz! 🎵"
}

JSON CEVAP FORMATI:
{
  "type": "çıkarılan tür veya mevcut tür veya null",
  "style": "çıkarılan tarz veya mevcut tarz veya null",
  "vocal": "çıkarılan vokal veya mevcut vokal veya null",
  "artistStyleDescription": "müzikal özellikler veya null",
  "response": "Samimi mesaj"
}

CEVAP KURALLARI:
- Eğer HERŞEYİ topladıysan:
  Kullanıcının seçtiği tür ve tarzı kullanarak samimi bir mesaj yaz.
  Örnek: "Harika! Arabesk tarzında Eğlenceli bir şarkı hazırlıyoruz! 🎵"

- Eğer hala eksik varsa, SAMİMİ ve DOĞAL bir şekilde sor:

  ✅ DOĞRU ÖRNEKLER:
  - "Harika başlangıç! Bir de hangi seste olsun? Kadın, Erkek veya Fark etmez 😊"
  - "Pop müzik güzel seçim! Peki tarz olarak Romantik mi, Duygusal mı, Eğlenceli mi yoksa Sakin mi istersiniz? 🎵"
  - "Süper! Son olarak vokal tercihiniz? Kadın sesi, Erkek sesi veya Fark etmez 🎤"

  ❌ YANLIŞ ÖRNEKLER (ASLA KULLANMA):
  - "Eksik bilgiler: [vocal, style]" ❌ TEKNİK GÖRÜNÜYOR
  - "Lütfen vocal ve style belirtin" ❌ ROBOT GİBİ
  - "Eksik: Vokal" ❌ KISA VE KURU

- Eğer kullanıcı TAMAMEN ANLAMSIZ bir şey yazdıysa (örn: "asdasd"):
  ✅ DOĞRU: "Üzgünüm, anlamadım 😊 Hangi müzik türünü istersiniz? (Pop, Rock, Arabesk gibi)"
  ✅ DOĞRU: "Böyle bir müzik tarzı bulamadım. Başka bir tür deneyelim mi? 🎵"

- ASLA dolu bilgiyi tekrar sorma!
- ASLA teknik terimler kullanma (vocal, style, type yerine: ses, tarz, tür)
- Emoji kullan ama fazla abartma (1-2 tane yeterli)`;

    try {
      console.log('🔍 parseSongSettings INPUT:', {
        userMessage,
        existing
      });

      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      console.log('🤖 OpenAI raw response:', result);

      const parsed = this.cleanAndParseJSON(result);
      console.log('📊 Parsed JSON:', parsed);

      // Merge with existing data (preserve what was already collected)
      const merged = {
        type: parsed.type || existing.type || null,
        style: parsed.style || existing.style || null,
        vocal: parsed.vocal || existing.vocal || null,
        artistStyleDescription: parsed.artistStyleDescription || existing.artistStyleDescription,
        response: parsed.response,
      };

      console.log('✅ parseSongSettings OUTPUT:', merged);
      return merged;
    } catch (error) {
      console.error('❌ parseSongSettings ERROR:', error);
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
   * FLEXIBLE: Accepts personal relations, businesses, and projects
   * PROGRESSIVE: Remembers previously collected data
   */
  async parseRecipientInfo(
    userMessage: string,
    existingData?: { relation?: string; includeNameInSong?: boolean | null; name?: string }
  ): Promise<{
    relation: string | null;
    name: string | null;
    includeNameInSong: boolean | null;
    response: string;
  }> {
    const existing = existingData || {};

    const prompt = `Kullanıcı hediye/şarkı bilgilerini veriyor: "${userMessage}"

MEVCUT BİLGİLER (daha önce alındı):
- İlişki/Hedef: ${existing.relation || 'YOK'}
- İsim geçsin mi: ${existing.includeNameInSong === true ? 'Evet' : existing.includeNameInSong === false ? 'Hayır' : 'YOK'}
- İsim: ${existing.name || 'YOK'}

=========================================
ÇOK ÖNEMLİ: MAKSIMUM ESNEKLİK!
=========================================

Bu şarkı HERHANGİ BİR ŞEY İÇİN olabilir:
✅ Kişiler: Annem, Sevgilim, Arkadaşım
✅ İşletmeler: İşletmem, Firmam, Markam, Bi Hediye
✅ Projeler: Projem, Ürünüm
✅ Şehirler: İstanbul, Ankara, İzmir
✅ Kavramlar: Aşk, Dostluk, Özlem, Bir Şehir Aşkı
✅ Temalar: Doğa, Deniz, Yolculuk

3 bilgi almalıyız:
1. İlişki/Hedef/Tema: NE HAKKINDA? (çok geniş kabul et!)
2. İsim geçsin mi: Evet/Hayır
3. İsim: Hangi isim geçecek?

GÖREV:
Kullanıcının yeni mesajından EKSİK olan bilgileri çıkar.
DOLU olanları KORU (değiştirme!).

KRİTİK: AŞIRI ESNEK OL!
- "bir sehir aski" → relation: "Bir Şehir Aşkı" (kabul et!)
- "istanbul için" → relation: "İstanbul", name: "İstanbul" (kabul et!)
- "proje" → relation: "Proje" (kabul et!)
- Kullanıcı NE DEMİŞSE, onu al! SORGULAMADAN kabul et!

ÖRNEKLER (PROGRESSIVE):

Örnek 1: Şehir için şarkı
Mevcut: relation=YOK, includeNameInSong=YOK, name=YOK
Kullanıcı: "bir sehir istanbul için sarki içinde istanbul geçsin"
✅ DOĞRU CEVAP:
{
  "relation": "İstanbul",
  "name": "İstanbul",
  "includeNameInSong": true,
  "response": "Harika! İstanbul için özel bir şarkı hazırlıyoruz ve ismi şarkıda geçecek! 🎶"
}

Örnek 2: Kavram/Tema
Mevcut: relation=YOK, includeNameInSong=YOK, name=YOK
Kullanıcı: "bir sehir aski"
✅ DOĞRU CEVAP:
{
  "relation": "Bir Şehir Aşkı",
  "name": null,
  "includeNameInSong": null,
  "response": "Harika! 'Bir Şehir Aşkı' temasında bir şarkı hazırlıyoruz! Şarkıda özel bir isim geçsin mi? 🎵"
}

Örnek 3: Proje + İsim
Mevcut: relation="Proje", includeNameInSong=true, name=YOK
Kullanıcı: "istanbul"
✅ DOĞRU CEVAP:
{
  "relation": "Proje",
  "name": "İstanbul",
  "includeNameInSong": true,
  "response": "Mükemmel! Projeniz 'İstanbul' için şarkı hazırlıyoruz! 🎶"
}

Örnek 4: İşletme
Mevcut: relation=YOK, includeNameInSong=YOK, name=YOK
Kullanıcı: "evet işletmem için bir sarki yapamk istiyorum isim geçsin firmam ise bi hediye"
✅ DOĞRU CEVAP:
{
  "relation": "İşletmem",
  "name": "Bi Hediye",
  "includeNameInSong": true,
  "response": "Mükemmel! İşletmeniz 'Bi Hediye' için şarkı hazırlıyoruz ve ismi şarkıda geçecek! 🎶"
}

Örnek 5: TEK KELİME - relation eksik
Mevcut: relation=YOK, includeNameInSong=YOK, name=YOK
Kullanıcı: "Öykü"
✅ DOĞRU CEVAP:
{
  "relation": "Öykü",
  "name": null,
  "includeNameInSong": null,
  "response": "Harika! Öykü için bir şarkı hazırlayacağız! Şarkıda isim geçsin mi? (Evet/Hayır)"
}

Örnek 6: TEK KELİME - includeNameInSong eksik
Mevcut: relation="Öykü", includeNameInSong=YOK, name=YOK
Kullanıcı: "Evet"
✅ DOĞRU CEVAP:
{
  "relation": "Öykü",
  "name": null,
  "includeNameInSong": true,
  "response": "Süper! Öykü'nün ismi şarkıda geçecek! Son olarak, tam ismi nedir?"
}

Örnek 7: TEK KELİME - name eksik
Mevcut: relation="Sevgilim", includeNameInSong=true, name=YOK
Kullanıcı: "Ayşe"
✅ DOĞRU CEVAP:
{
  "relation": "Sevgilim",
  "name": "Ayşe",
  "includeNameInSong": true,
  "response": "Mükemmel! Sevgiliniz Ayşe için şarkı hazırlıyoruz! 💝"
}

JSON CEVAP:
{
  "relation": "çıkarılan ilişki/hedef/tema veya mevcut veya null",
  "name": "çıkarılan isim veya mevcut veya null",
  "includeNameInSong": true/false veya mevcut veya null,
  "response": "Kullanıcıya mesaj"
}

KRİTİK KURALLAR:
- Mevcut bilgileri ASLA değiştirme, sadece EKSİK olanları ekle!
- Kullanıcı NE DEMİŞSE kabul et! (şehir, kavram, proje, kişi, işletme - hepsi geçerli)
- "bir sehir aski" → relation: "Bir Şehir Aşkı" (kabul et, SORMA!)
- "istanbul" → Eğer daha önce "için şarkı" denmişse, relation VE name olarak kabul et
- "evet", "geçsin", "olsun" → includeNameInSong: true
- "hayır", "gerek yok", "istemiyorum" → includeNameInSong: false

**ÖNEMLİ: TEK KELİME CEVAPLAR (SINGLE WORD ANSWERS):**
Eğer kullanıcı tek kelime yazdıysa, CONTEXT'e bak:

1. Eğer relation=YOK → Tek kelime = relation
   - "Öykü" → relation: "Öykü"
   - "annem" → relation: "Annem"

2. Eğer relation=DOLU, includeNameInSong=YOK → Tek kelime = Yes/No kontrolü
   - "Öykü" → includeNameInSong: true, name: "Öykü"
   - "Evet" → includeNameInSong: true
   - "Hayır" → includeNameInSong: false

3. Eğer relation=DOLU, includeNameInSong=true, name=YOK → Tek kelime = name
   - "Öykü" → name: "Öykü"
   - "Ali" → name: "Ali"

CEVAP VERMEDE:
- Eğer relation DOLU ve anlamlıysa, ASLA "hangi ilişki/hedef" SORMA!
- Sadece eksik varsa (relation=null VEYA includeNameInSong=null VEYA name=null) sor
- Soru sorarken SAMİMİ ve KISA ol, "ilişki/hedef/proje" gibi teknik terimler kullanma!

✅ DOĞRU SORULAR:
- "Harika! Şarkıda özel bir isim geçsin mi? 😊"
- "Süper! Son olarak isim nedir?"

❌ YANLIŞ SORULAR:
- "Hangi ilişki/hedef için bu şarkıyı hazırlıyoruz?" (ÇOK TEKNİK!)
- "Kişi, İşletme, Proje?" (KULLANICI KARIŞIR!)`;

    try {
      console.log('🔍 parseRecipientInfo INPUT:', {
        userMessage,
        existing
      });

      const result = await this.openaiService.generateText(prompt, { temperature: 0.3 });
      console.log('🤖 OpenAI raw response:', result);

      const parsed = this.cleanAndParseJSON(result);
      console.log('📊 Parsed JSON:', parsed);

      // Merge with existing data (preserve what was already collected)
      const merged = {
        relation: parsed.relation || existing.relation || null,
        name: parsed.name || existing.name || null,
        includeNameInSong: parsed.includeNameInSong ?? existing.includeNameInSong ?? null,
        response: parsed.response,
      };

      console.log('✅ parseRecipientInfo OUTPUT:', merged);
      return merged;
    } catch (error) {
      console.error('❌ parseRecipientInfo ERROR:', error);
      // Fallback: preserve existing data
      return {
        relation: existing.relation || null,
        name: existing.name || null,
        includeNameInSong: existing.includeNameInSong ?? null,
        response: `Bu şarkı kimin/neyin için? 😊

Kişi (Annem, Sevgilim...), İşletme (Firmam, Markam...), veya Proje olabilir.

${!existing.includeNameInSong && existing.includeNameInSong !== false ? 'Şarkıda isim geçsin mi? (Evet/Hayır)\n' : ''}${existing.includeNameInSong === true && !existing.name ? 'İsim nedir?\n' : ''}`,
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
