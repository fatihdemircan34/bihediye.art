require('dotenv').config();
const axios = require('axios');

async function testOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

  console.log('🧪 Testing OpenAI API...');
  console.log('Model:', model);
  console.log('API Key:', apiKey ? '✓ Found' : '✗ Missing');
  console.log('');

  if (!apiKey) {
    console.error('❌ OPENAI_API_KEY not found in .env');
    process.exit(1);
  }

  try {
    console.log('📤 Sending test request...');

    const requestBody = {
      model: model,
      messages: [
        {
          role: 'system',
          content: 'Sen profesyonel bir şarkı sözü yazarısın.'
        },
        {
          role: 'user',
          content: 'Kısa bir aşk şarkısı yaz (4 satır)'
        }
      ],
      max_completion_tokens: 200
    };

    // Only add temperature for models that support it (not gpt-5)
    if (!model.includes('gpt-5')) {
      requestBody.temperature = 0.8;
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      requestBody,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    console.log('✅ Success!');
    console.log('');
    console.log('📊 Response:');
    console.log('- Model:', response.data.model);
    console.log('- Tokens used:', response.data.usage?.total_tokens);
    console.log('');
    const generatedText = response.data.choices[0].message.content;

    console.log('🎵 Generated lyrics:');
    console.log('---');
    console.log(generatedText || '(empty response)');
    console.log('---');
    console.log('');

    if (!generatedText || generatedText.trim().length === 0) {
      console.warn('⚠️  Warning: GPT-5 returned empty content');
      console.log('Full response:', JSON.stringify(response.data, null, 2));
    } else {
      console.log('✅ Test completed successfully!');
    }

  } catch (error) {
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

testOpenAI();
