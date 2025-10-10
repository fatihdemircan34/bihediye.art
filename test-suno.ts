/**
 * Suno API Integration Test
 *
 * This script tests the complete Suno API flow:
 * 1. Generate music with lyrics
 * 2. Poll for task completion
 * 3. Verify audio URL is returned
 */

import { SunoService } from './src/services/suno.service';
import { OpenAIService } from './src/services/openai.service';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testSunoIntegration() {
  console.log('🧪 Testing Suno API Integration\n');
  console.log('='.repeat(50));

  // Initialize services
  const sunoService = new SunoService({
    apiKey: process.env.SUNO_API_KEY || '',
    baseUrl: process.env.SUNO_BASE_URL || 'https://api.sunoapi.org',
  });

  const openaiService = new OpenAIService({
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o',
  });

  try {
    // Step 1: Generate test lyrics
    console.log('\n📝 Step 1: Generating test lyrics...');
    const lyricsRequest = {
      songDetails: {
        type: 'Pop',
        style: 'Eğlenceli',
        vocal: 'Erkek',
      },
      story: 'Bir arkadaşıma doğum günü hediyesi olarak eğlenceli bir şarkı yazmak istiyorum.',
      includeNameInSong: false,
    };

    const lyrics = await openaiService.generateLyrics(lyricsRequest);
    console.log('✅ Lyrics generated successfully');
    console.log(`   Length: ${lyrics.length} characters`);
    console.log(`   Lines: ${lyrics.split('\n').length}`);

    // Step 2: Synthesize music genre
    console.log('\n🎼 Step 2: Synthesizing music genre...');
    const synthesizedGenre = await openaiService.synthesizeMusicGenre(lyricsRequest);
    console.log('✅ Genre synthesized:', synthesizedGenre);

    // Step 3: Generate music
    console.log('\n🎵 Step 3: Generating music with Suno AI V5...');
    const musicRequest = {
      lyrics,
      songType: synthesizedGenre,
      style: lyricsRequest.songDetails.style,
      vocal: lyricsRequest.songDetails.vocal,
    };

    const taskResponse = await sunoService.generateMusic(musicRequest);
    console.log('✅ Music generation task created!');
    console.log(`   Task ID: ${taskResponse.task_id}`);
    console.log(`   Status: ${taskResponse.status}`);

    // Step 4: Wait for completion
    console.log('\n⏳ Step 4: Waiting for music generation to complete...');
    console.log('   This may take 2-3 minutes...');

    const result = await sunoService.waitForTaskCompletion(
      taskResponse.task_id,
      60,   // max 60 attempts
      5000  // check every 5 seconds
    );

    // Step 5: Verify result
    console.log('\n✅ Step 5: Music generation completed!');
    console.log(`   Task ID: ${result.task_id}`);
    console.log(`   Status: ${result.status}`);
    console.log(`   Audio URL: ${result.file_url || 'N/A'}`);

    if (result.file_url) {
      console.log('\n🎉 SUCCESS! Suno API integration is working correctly!');
      console.log('='.repeat(50));
      console.log('\n📊 Test Summary:');
      console.log('   ✅ Lyrics generation: PASS');
      console.log('   ✅ Genre synthesis: PASS');
      console.log('   ✅ Music generation: PASS');
      console.log('   ✅ Task status polling: PASS');
      console.log('   ✅ Audio URL returned: PASS');
      console.log('\n' + '='.repeat(50));
      return true;
    } else {
      throw new Error('No audio URL returned');
    }

  } catch (error: any) {
    console.error('\n❌ TEST FAILED!');
    console.error('='.repeat(50));
    console.error('\nError details:');
    console.error('   Message:', error.message);
    console.error('   Status:', error.response?.status);
    console.error('   Response:', JSON.stringify(error.response?.data, null, 2));
    console.error('\n' + '='.repeat(50));
    return false;
  }
}

// Run test
testSunoIntegration()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
