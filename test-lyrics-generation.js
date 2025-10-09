require('dotenv').config();
const { OpenAIService } = require('./dist/services/openai.service');

async function testLyricsGeneration() {
  console.log('🧪 Testing Lyrics Generation...\n');

  const openaiService = new OpenAIService({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4o'
  });

  const testRequest = {
    songDetails: {
      type: 'Pop',
      style: 'Romantik',
      vocal: 'Kadın',
      duration: 180
    },
    story: 'Sevgilime doğum günü hediyesi. Birlikte geçirdiğimiz güzel anıları ve ona olan sevgimi anlatmak istiyorum.',
    recipientName: 'Ayşe',
    recipientRelation: 'Sevgilim',
    includeNameInSong: true,
    notes: 'Duygusal ama neşeli olsun'
  };

  console.log('📝 Test Request:');
  console.log(JSON.stringify(testRequest, null, 2));
  console.log('\n⏳ Generating lyrics...\n');

  try {
    const lyrics = await openaiService.generateLyrics(testRequest);

    console.log('✅ Success! Generated lyrics:\n');
    console.log('═'.repeat(60));
    console.log(lyrics);
    console.log('═'.repeat(60));
    console.log('\n📊 Stats:');
    console.log('- Length:', lyrics.length, 'characters');
    console.log('- Lines:', lyrics.split('\n').length);
    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed!');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

testLyricsGeneration();
