require('dotenv').config();
const axios = require('axios');

async function testMinimaxAsync() {
  const apiKey = process.env.MINIMAX_API_KEY;
  const baseURL = 'https://api.minimax.io';

  console.log('🧪 Testing Minimax Async Music Generation...\n');
  console.log('API Key:', apiKey ? '✓ Found' : '✗ Missing');
  console.log('Base URL:', baseURL);
  console.log('');

  if (!apiKey) {
    console.error('❌ MINIMAX_API_KEY not found in .env');
    process.exit(1);
  }

  const client = axios.create({
    baseURL: baseURL,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  try {
    console.log('📤 Step 1: Submitting async music generation task...');

    const testLyrics = `[verse]
Kalbimde bir his var
Seninle her şey güzel
Gözlerinde kayboluyorum
Her gün biraz daha

[chorus]
Sen benim her şeyimsin
Hayatımın anlamısın
Sensiz olmaz bu dünya
Sen benim aşkımsın`;

    const payload = {
      model: 'music-1.5',
      prompt: 'Pop, Romantic, emotional, heartfelt, Female vocals',
      lyrics: testLyrics,
      invoke_method: 'async-invoke',
      audio_setting: {
        sample_rate: 44100,
        bitrate: 256000,
        format: 'mp3'
      }
    };

    console.log('Request payload:');
    console.log(JSON.stringify(payload, null, 2));
    console.log('');

    const response = await client.post('/v1/music_generation', payload);

    console.log('✅ Task submitted successfully!');
    console.log('');
    console.log('Response:');
    console.log(JSON.stringify(response.data, null, 2));
    console.log('');

    // Extract task ID
    const taskId = response.data.task_id || response.data.data?.task_id;

    if (!taskId) {
      console.error('❌ No task_id in response');
      process.exit(1);
    }

    console.log(`📋 Task ID: ${taskId}`);
    console.log('');

    // Poll for completion
    console.log('⏳ Step 2: Polling for task completion...');
    console.log('Max wait time: 5 minutes');
    console.log('Poll interval: 5 seconds');
    console.log('');

    const maxAttempts = 60; // 5 minutes
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      console.log(`📊 Poll attempt ${attempt}/${maxAttempts}`);

      try {
        const statusResponse = await client.get(`/v1/music_generation/query/${taskId}`);

        console.log('Status:', statusResponse.data.status || 'Unknown');

        if (statusResponse.data.status === 'Success') {
          console.log('');
          console.log('🎉 Task completed successfully!');
          console.log('');
          console.log('Full response:');
          console.log(JSON.stringify(statusResponse.data, null, 2));

          if (statusResponse.data.data?.audio) {
            const audioHex = statusResponse.data.data.audio;
            const audioSize = audioHex.length / 2; // hex to bytes
            console.log('');
            console.log(`🎵 Audio received: ${audioSize} bytes`);
            console.log('Audio format: MP3 (hex encoded)');
          }

          process.exit(0);
        }

        if (statusResponse.data.status === 'Failed') {
          console.error('');
          console.error('❌ Task failed!');
          console.error('Response:', JSON.stringify(statusResponse.data, null, 2));
          process.exit(1);
        }

        // Still processing
        console.log('Status: Processing...');
        console.log('');

      } catch (pollError) {
        console.error('Error polling status:', pollError.message);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.error('');
    console.error('⏰ Timeout: Task did not complete within 5 minutes');
    process.exit(1);

  } catch (error) {
    console.error('');
    console.error('❌ Test failed!');
    console.error('');

    if (error.response) {
      console.error('Error response:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }

    process.exit(1);
  }
}

testMinimaxAsync();
