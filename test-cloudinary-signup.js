/**
 * Cloudinary Signup Test
 * 
 * This script checks if Cloudinary is configured correctly.
 * To get started:
 * 1. Go to https://cloudinary.com
 * 2. Sign up for free (no credit card needed)
 * 3. Copy your Cloud Name, API Key, and API Secret from the Dashboard
 * 4. Update .env file with those values
 */

// Load environment variables from .env file
require('dotenv').config();

console.log('=== Cloudinary Configuration Test ===\n');
console.log(`Checking: CLOUDINARY_CLOUD_NAME=${process.env.CLOUDINARY_CLOUD_NAME || '(not set)'}`);
console.log(`Checking: CLOUDINARY_API_KEY=${process.env.CLOUDINARY_API_KEY ? '(set)' : '(not set)'}`);
console.log(`Checking: CLOUDINARY_API_SECRET=${process.env.CLOUDINARY_API_SECRET ? '(set)' : '(not set)'}`);
console.log('');

const hasConfig = process.env.CLOUDINARY_CLOUD_NAME && 
                  process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name_here';

if (!hasConfig) {
  console.log('❌ Cloudinary NOT configured. To get started:');
  console.log('');
  console.log('  Step 1: Go to https://cloudinary.com and sign up (free)');
  console.log('  Step 2: From your Dashboard, copy:');
  console.log('     - Cloud name');
  console.log('     - API Key');
  console.log('     - API Secret');
  console.log('  Step 3: Open .env file and replace:');
  console.log('     CLOUDINARY_CLOUD_NAME=your_cloud_name_here');
  console.log('     CLOUDINARY_API_KEY=your_api_key_here');
  console.log('     CLOUDINARY_API_SECRET=your_api_secret_here');
  console.log('');
  console.log('  Step 4: Run this test again: node test-cloudinary-signup.js');
  console.log('');
  process.exit(1);
} else {
  // Test actual connection
  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  cloudinary.api.ping()
    .then(() => {
      console.log('✅ Cloudinary connection successful!');
      console.log(`   Cloud Name: ${process.env.CLOUDINARY_CLOUD_NAME}`);
      console.log('');
      console.log('Your system is ready to upload files to Cloudinary.');
      process.exit(0);
    })
    .catch(err => {
      console.log('❌ Cloudinary connection failed:', err.message);
      console.log('Double-check your .env values from https://cloudinary.com/dashboard');
      process.exit(1);
    });
}