# Netlify Deployment Guide

Your app is now configured to run entirely on Netlify using Netlify Functions for the backend API.

## Quick Deploy Steps

### 1. Push to GitHub (if not already done)

```bash
git add .
git commit -m "Add Netlify Functions"
git push
```

### 2. Deploy on Netlify

1. Go to [app.netlify.com](https://app.netlify.com)
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Netlify will auto-detect settings:
   - **Build command:** Leave empty (no build needed)
   - **Publish directory:** `.` (root directory)
   - **Functions directory:** `netlify/functions` (auto-detected)

### 3. Set Environment Variables

In your Netlify site dashboard:

1. Go to **Site settings** → **Environment variables**
2. Add these variables:
   - `OPENAI_API_KEY` = `your_openai_api_key`
   - `ELEVENLABS_API_KEY` = `your_elevenlabs_api_key` (optional)
   - `OPENAI_MODEL` = `gpt-4o-mini` (optional, defaults to gpt-4o-mini)

### 4. Redeploy

After adding environment variables:
1. Go to **Deploys** tab
2. Click **Trigger deploy** → **Deploy site**
3. Wait for deployment to complete

### 5. Test Your API

Visit: `https://your-site.netlify.app/api/test`

You should see:
```json
{
  "message": "Server is running!",
  "timestamp": "...",
  "platform": "Netlify Functions"
}
```

## How It Works

- **Frontend:** Served as static files from Netlify CDN
- **Backend:** Runs as Netlify Functions (serverless)
- **API Routes:** `/api/*` routes are automatically redirected to Netlify Functions via `netlify.toml`
- **Same Domain:** Everything runs on the same domain, so no CORS issues!

## File Structure

```
your-project/
├── netlify/
│   └── functions/
│       ├── api-chat.js          # ChatGPT API proxy
│       ├── api-tts.js           # ElevenLabs TTS
│       ├── api-tts-voices.js    # Get ElevenLabs voices
│       └── api-test.js           # Test endpoint
├── netlify.toml                 # Netlify configuration
├── index.html                   # Frontend
└── ... (other files)
```

## Troubleshooting

### Functions not working?

1. **Check environment variables:**
   - Go to Site settings → Environment variables
   - Make sure `OPENAI_API_KEY` is set
   - Redeploy after adding variables

2. **Check function logs:**
   - Go to Functions tab in Netlify dashboard
   - Click on a function to see logs
   - Check for errors

3. **Test functions directly:**
   - Visit: `https://your-site.netlify.app/.netlify/functions/api-test`
   - Should return JSON response

### 404 errors on /api/* routes?

- Make sure `netlify.toml` is in your repository root
- Check that redirects are configured correctly
- Redeploy after adding `netlify.toml`

### CORS errors?

- Netlify Functions handle CORS automatically
- If you see CORS errors, check function headers in the function files

## Local Development

To test Netlify Functions locally:

1. **Install Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   ```

2. **Run locally:**
   ```bash
   netlify dev
   ```

3. **Set environment variables locally:**
   Create a `.env` file (same as before):
   ```
   OPENAI_API_KEY=your_key
   ELEVENLABS_API_KEY=your_key
   ```

4. **Test:**
   - Visit `http://localhost:8888`
   - Functions will work at `http://localhost:8888/api/*`

## Benefits of Netlify Functions

✅ **Everything on one platform** - No separate backend hosting needed  
✅ **Automatic scaling** - Functions scale automatically  
✅ **Free tier** - 125,000 function invocations/month  
✅ **Fast** - Functions run close to users via CDN  
✅ **Simple** - No server management needed  

## Cost

- **Free tier:** 125,000 function invocations/month
- **Pro tier:** $19/month for 500,000 invocations
- **Pay-as-you-go:** $0.000025 per invocation after free tier

For most use cases, the free tier is sufficient!

