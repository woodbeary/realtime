import { RealtimeRelay } from './lib/relay.js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config({ override: true });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error(
    `Environment variable "OPENAI_API_KEY" is required.\n` +
      `Please set it in your .env file.`
  );
  process.exit(1);
}

const PORT = parseInt(process.env.PORT) || 8081;

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const relay = new RealtimeRelay(OPENAI_API_KEY);

relay.on('connection', (socket) => {
  socket.on('analyzeImage', async (imageData) => {
    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "What's in this image?" },
              {
                type: "image_url",
                image_url: {
                  url: imageData,
                },
              },
            ],
          },
        ],
      });
      socket.emit('imageAnalysis', response.choices[0].message.content);
    } catch (error) {
      console.error('Error analyzing image:', error);
      socket.emit('error', 'Failed to analyze image');
    }
  });
});

relay.listen(PORT);
