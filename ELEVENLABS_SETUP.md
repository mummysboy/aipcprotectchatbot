# ElevenLabs TTS Setup Guide

## Quick Start

1. **Sign up for ElevenLabs** (free tier available)
   - Visit: https://elevenlabs.io
   - Create an account (free tier includes 10,000 characters/month)

2. **Get your API Key**
   - Go to your profile/settings
   - Copy your API key

3. **Add to .env file**
   ```
   ELEVENLABS_API_KEY=your_api_key_here
   ```

4. **Choose a Voice**
   - Visit: https://elevenlabs.io/app/voice-library
   - Browse and test voices
   - Copy the voice ID (found in URL or voice details)

5. **Update script.js**
   ```javascript
   const voiceOptions = {
       ttsProvider: 'elevenlabs',
       elevenLabsVoiceId: 'YOUR_VOICE_ID_HERE'
   };
   ```

## Popular Voice IDs

| Voice Name | Voice ID | Description |
|------------|----------|-------------|
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Professional, clear female |
| Domi | `AZnzlk1XvdvUeBnXmlld` | Confident, energetic female |
| Bella | `EXAVITQu4vr4xnSDxMaL` | Soft, warm female |
| Antoni | `ErXwobaYiN019PkySvjV` | Warm, friendly male |
| Elli | `MF3mGyEYCl7XYWbV9V6O` | Friendly, conversational female |
| Josh | `TxGEqnHWrfWFTfGW9XjX` | Deep, authoritative male |
| Arnold | `VR6AewLTigWG4xSOukaG` | Strong, confident male |
| Adam | `pNInz6obpgDQGcFmaJgB` | Calm, professional male |
| Sam | `yoZ06aMxZJJ28mfd3POQ` | Young, energetic male |

## Testing Voices

1. Visit https://elevenlabs.io/app/voice-library
2. Click on any voice to hear samples
3. Click "Use Voice" to see the voice ID
4. Copy the voice ID and use it in your configuration

## Pricing

- **Free Tier**: 10,000 characters/month
- **Starter**: $5/month - 30,000 characters
- **Creator**: $22/month - 100,000 characters
- **Pro**: $99/month - 500,000 characters

## Troubleshooting

**Voice not working?**
- Check that `ELEVENLABS_API_KEY` is set in `.env`
- Restart the server after adding the API key
- Check browser console for errors
- App will automatically fall back to browser TTS if ElevenLabs fails

**Out of characters?**
- Check your usage at https://elevenlabs.io/app/usage
- Upgrade your plan or wait for monthly reset
- App will automatically fall back to browser TTS

**Want to switch back to browser TTS?**
```javascript
const voiceOptions = {
    ttsProvider: 'browser',
    voice: 'Samantha',
    voiceLang: 'en-US'
};
```

