// Test .env loading
require('dotenv').config();

console.log('=== Environment Variables Test ===\n');

console.log('PayTR Configuration:');
console.log('PAYTR_MERCHANT_ID:', process.env.PAYTR_MERCHANT_ID || 'NOT SET');
console.log('PAYTR_MERCHANT_KEY:', process.env.PAYTR_MERCHANT_KEY ? '***' + process.env.PAYTR_MERCHANT_KEY.slice(-4) : 'NOT SET');
console.log('PAYTR_MERCHANT_SALT:', process.env.PAYTR_MERCHANT_SALT ? '***' + process.env.PAYTR_MERCHANT_SALT.slice(-4) : 'NOT SET');
console.log('PAYTR_TEST_MODE:', process.env.PAYTR_TEST_MODE || 'NOT SET');
console.log('BASE_URL:', process.env.BASE_URL || 'NOT SET');

console.log('\n=== Check ===');
const isConfigured = process.env.PAYTR_MERCHANT_ID && process.env.PAYTR_MERCHANT_ID !== 'your_merchant_id';
console.log('PayTR Configured:', isConfigured ? '✅ YES' : '❌ NO');

if (!isConfigured) {
  console.log('\n⚠️ PayTR is NOT configured!');
  console.log('Reason:', !process.env.PAYTR_MERCHANT_ID ? 'PAYTR_MERCHANT_ID not set' : 'PAYTR_MERCHANT_ID is placeholder');
}
