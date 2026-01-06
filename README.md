# PCProtect ChatBot

A chatbot application with ChatGPT integration for PC security assistance.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file** in the root directory with your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key_here
   OPENAI_MODEL=gpt-4o-mini
   ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   PORT=3000
   ```
   
   **Note:** `ELEVENLABS_API_KEY` is optional. If not provided, the app will use browser TTS (lower quality).

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser** and navigate to `http://localhost:3000`

## Configuration

- `OPENAI_API_KEY`: Your OpenAI API key (required)
- `OPENAI_MODEL`: The model to use (default: `gpt-4o-mini`)
- `ELEVENLABS_API_KEY`: Your ElevenLabs API key (optional, for premium TTS)
- `PORT`: Server port (default: `3000`)

## Voice Configuration

### Premium TTS with ElevenLabs (Recommended)

**ElevenLabs provides high-quality, natural-sounding voices** - much better than browser TTS!

#### Setup ElevenLabs:
1. Sign up at [elevenlabs.io](https://elevenlabs.io) (free tier available)
2. Get your API key from your account dashboard
3. Add `ELEVENLABS_API_KEY=your_key_here` to your `.env` file
4. Update `script.js` with your preferred voice ID:

```javascript
const voiceOptions = {
    ttsProvider: 'elevenlabs',
    elevenLabsVoiceId: '21m00Tcm4TlvDq8ikWAM' // Rachel - Professional female
};
```

#### Popular ElevenLabs Voices:
- **Rachel** (`21m00Tcm4TlvDq8ikWAM`) - Professional, clear female voice
- **Domi** (`AZnzlk1XvdvUeBnXmlld`) - Confident, energetic female voice
- **Bella** (`EXAVITQu4vr4xnSDxMaL`) - Soft, warm female voice
- **Antoni** (`ErXwobaYiN019PkySvjV`) - Warm, friendly male voice
- **Elli** (`MF3mGyEYCl7XYWbV9V6O`) - Friendly, conversational female voice

**To find more voices:**
1. Visit [elevenlabs.io/app/voice-library](https://elevenlabs.io/app/voice-library)
2. Browse and test voices
3. Copy the voice ID from the URL or API
4. Use it in your configuration

### Browser TTS (Free Fallback)

If you don't have an ElevenLabs API key, the app will automatically use browser TTS:

```javascript
const voiceOptions = {
    ttsProvider: 'browser',
    voice: 'Samantha',        // Specific voice name
    voiceGender: 'female',     // Optional: 'male' or 'female'
    voiceLang: 'en-US'         // Language code
};
```

#### Finding Browser Voices:
1. Open `voice-tester.html` in your browser
2. Browse all available voices with filters
3. Test voices and copy the configuration
4. Or use browser console: `listVoices()` to see all options

### Voice Selection Tips
- **ElevenLabs voices** are premium quality, natural-sounding, and professional
- **Browser voices** are free but lower quality (robotic)
- **ElevenLabs free tier** includes 10,000 characters/month
- The app automatically falls back to browser TTS if ElevenLabs fails

## Hosting Configuration

When hosting this application, you need to configure the API base URL so the frontend can communicate with your backend server.

### Option 1: Same Domain Hosting (Recommended)

If your frontend and backend are served from the same domain (e.g., both on `https://yourdomain.com`), no configuration is needed. The app will automatically use relative URLs.

### Option 2: Cross-Origin Hosting

If your frontend and backend are on different domains, you need to set the API base URL:

**Method A: Set in HTML (before scripts load)**
```html
<script>
    window.API_BASE_URL = 'https://your-backend-domain.com';
</script>
<script src="api-config.js"></script>
<!-- other scripts -->
```

**Method B: Use data attribute**
```html
<html data-api-base-url="https://your-backend-domain.com">
```

**Method C: Set dynamically in JavaScript**
```javascript
if (window.API_CONFIG) {
    window.API_CONFIG.setBaseUrl('https://your-backend-domain.com');
}
```

### Hosting Platforms

**For platforms like Vercel, Netlify, or Railway:**
1. Deploy your `server.js` as a serverless function or Node.js app
2. Set the API base URL to your backend URL
3. Make sure environment variables (`OPENAI_API_KEY`, `ELEVENLABS_API_KEY`) are set in your hosting platform

**Example for Vercel:**
- Deploy server.js as a serverless function
- Set `window.API_BASE_URL = 'https://your-app.vercel.app'` in your HTML

## Notes

- The API key is stored in `.env` and never exposed to the client
- Make sure to add `.env` to `.gitignore` (already included)
- The server proxies all API requests to OpenAI to keep your key secure
- Voice features work best in Chrome, Edge, or Safari browsers
- When hosted, ensure CORS is properly configured on your backend (already handled in `server.js`)

