import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

dotenv.config();

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
  // There's no direct listModels in the SDK easily accessible this way, 
  // but we can try to fetch a known model or use the REST API.
  // Actually, I'll just try gemini-1.5-pro and gemini-1.5-flash.
  
  console.log('Checking models...');
  const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-2.0-flash-exp'];
  for (const modelName of models) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent('ping');
      console.log(`Model ${modelName} is available.`);
    } catch (e: any) {
      console.log(`Model ${modelName} is NOT available: ${e.message}`);
    }
  }
}

listModels().catch(console.error);
