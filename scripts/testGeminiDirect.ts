import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

async function testGeminiDirect() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const model = 'gemini-3-flash-preview';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  
  console.log(`Testing ${model} via direct REST API...`);
  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: 'ping' }] }]
    });
    console.log('Success!', JSON.stringify(response.data, null, 2));
  } catch (e: any) {
    console.log(`Failed: ${e.response?.status} ${e.response?.statusText}`);
    console.log(JSON.stringify(e.response?.data, null, 2));
  }
}

testGeminiDirect().catch(console.error);
