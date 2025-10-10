import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Minimax.io Configuration
  minimax: {
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat',
  },

  // OpenAI Configuration
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
  },

  // Bird.com WhatsApp API Configuration
  bird: {
    accessKey: process.env.BIRD_ACCESS_KEY || '',
    workspaceId: process.env.BIRD_WORKSPACE_ID || '',
    channelId: process.env.BIRD_CHANNEL_ID || '',
  },

  // Firebase Configuration
  firebase: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || path.join(process.cwd(), 'serviceAccount.json'),
  },

  // PayTR Payment Gateway Configuration
  paytr: {
    merchantId: process.env.PAYTR_MERCHANT_ID || '',
    merchantKey: process.env.PAYTR_MERCHANT_KEY || '',
    merchantSalt: process.env.PAYTR_MERCHANT_SALT || '',
    testMode: process.env.PAYTR_TEST_MODE === '1',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },

  // Pricing Configuration
  pricing: {
    songBasePrice: parseInt(process.env.SONG_BASE_PRICE || '350', 10),
  },

  // Google Analytics 4 Configuration
  ga4: {
    measurementId: process.env.GA4_MEASUREMENT_ID || '',
    apiSecret: process.env.GA4_API_SECRET || '',
  },

  // Admin Panel Configuration
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'changeme123',
  },
};

export const validateConfig = (): void => {
  const errors: string[] = [];

  if (!config.minimax.apiKey) {
    errors.push('MINIMAX_API_KEY is required');
  }

  if (!config.openai.apiKey) {
    errors.push('OPENAI_API_KEY is required');
  }

  if (!config.bird.accessKey) {
    errors.push('BIRD_ACCESS_KEY is required');
  }

  // Firebase is optional if using default credentials
  // if (!config.firebase.serviceAccountPath) {
  //   errors.push('FIREBASE_SERVICE_ACCOUNT_PATH is required');
  // }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
};
