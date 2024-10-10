Porcupine in the Smart Mirror System

1. What is Porcupine?
   - Porcupine is a wake word detection engine developed by Picovoice
   - It's designed for on-device, low-power wake word detection
   - Supports multiple programming languages, including JavaScript for Node.js

2. Why use Porcupine?
   - Efficient local wake word detection
   - Reduces cloud API usage and improves privacy
   - Customizable wake words

3. Integration with npm:
   - Porcupine is available as an npm package
   - Install using: `npm install @picovoice/porcupine-node`

4. Basic Porcupine Setup:
   ```javascript
   const { Porcupine } = require("@picovoice/porcupine-node");
   const { PvRecorder } = require("@picovoice/pvrecorder-node");

   const accessKey = "YOUR_PICOVOICE_ACCESS_KEY";
   const keywordPath = "path/to/hey-mirror_en_raspberry-pi_v2_2_0.ppn";

   const porcupine = new Porcupine(accessKey, [keywordPath]);
   const recorder = new PvRecorder(porcupine.frameLength);
   ```

5. Continuous Listening Loop:
   ```javascript
   recorder.start();
   console.log("Listening for wake word 'Hey Mirror'...");

   while (true) {
     const frame = await recorder.read();
     const keywordIndex = porcupine.process(frame);
     
     if (keywordIndex !== -1) {
       console.log("Wake word detected!");
       // Activate OpenAI Realtime API session here
       break;
     }
   }
   ```

6. Integration with OpenAI Realtime API:
   - Use Porcupine to trigger the start of a Realtime API session
   - Example:
     ```javascript
     if (keywordIndex !== -1) {
       console.log("Wake word detected!");
       startRealtimeSession();
     }

     function startRealtimeSession() {
       // Initialize and start OpenAI Realtime API session
       const client = new RealtimeClient({ apiKey: process.env.OPENAI_API_KEY });
       // ... rest of the Realtime API setup
     }
     ```

7. Customization:
   - Create custom wake words using Picovoice Console
   - Adjust sensitivity for better accuracy in your environment

8. Considerations:
   - Porcupine requires a Picovoice access key (free for personal use)
   - Ensure proper error handling and resource management
   - Test wake word detection in various noise conditions

By incorporating Porcupine, your smart mirror can efficiently detect the wake word locally, enhancing privacy and reducing unnecessary API calls to OpenAI's Realtime API.