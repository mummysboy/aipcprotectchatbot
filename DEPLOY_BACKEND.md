# Backend Deployment Guide

Since your frontend is hosted on Netlify, you need to deploy your backend (`server.js`) separately. Here are the best options:

## Option 1: Railway (Recommended - Easiest)

Railway is the easiest way to deploy Node.js apps.

### Steps:

1. **Sign up at [railway.app](https://railway.app)** (free tier available)

2. **Create a new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or upload your code)

3. **Configure your project:**
   - Railway will auto-detect it's a Node.js app
   - Add environment variables in the "Variables" tab:
     ```
     OPENAI_API_KEY=your_openai_key
     ELEVENLABS_API_KEY=your_elevenlabs_key
     PORT=3000
     ```

4. **Deploy:**
   - Railway will automatically deploy
   - Once deployed, you'll get a URL like: `https://your-app-name.up.railway.app`

5. **Update your frontend:**
   - In `index.html`, set:
     ```javascript
     window.API_BASE_URL = 'https://your-app-name.up.railway.app';
     ```

**Your backend URL will be:** `https://your-app-name.up.railway.app`

---

## Option 2: Render (Free Tier Available)

### Steps:

1. **Sign up at [render.com](https://render.com)**

2. **Create a new Web Service:**
   - Connect your GitHub repo
   - Select "Web Service"
   - Choose your repository

3. **Configure:**
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
   - Add environment variables:
     ```
     OPENAI_API_KEY=your_key
     ELEVENLABS_API_KEY=your_key
     ```

4. **Deploy:**
   - Render will deploy automatically
   - You'll get a URL like: `https://your-app-name.onrender.com`

5. **Update your frontend:**
   - In `index.html`, set:
     ```javascript
     window.API_BASE_URL = 'https://your-app-name.onrender.com';
     ```

**Your backend URL will be:** `https://your-app-name.onrender.com`

---

## Option 3: Heroku

### Steps:

1. **Install Heroku CLI** and login
2. **Create a new app:** `heroku create your-app-name`
3. **Set environment variables:**
   ```bash
   heroku config:set OPENAI_API_KEY=your_key
   heroku config:set ELEVENLABS_API_KEY=your_key
   ```
4. **Deploy:** `git push heroku main`
5. **Your backend URL:** `https://your-app-name.herokuapp.com`

---

## Option 4: Netlify Functions (Advanced)

If you want everything on Netlify, you can convert your Express server to Netlify Functions. This is more complex but keeps everything in one place.

### Steps:

1. **Create `netlify/functions/api.js`:**
   ```javascript
   const express = require('express');
   const serverless = require('serverless-http');
   const cors = require('cors');
   require('dotenv').config();
   
   const app = express();
   app.use(cors());
   app.use(express.json());
   
   // Your routes here (from server.js)
   app.post('/api/chat', async (req, res) => {
       // ... your chat endpoint code
   });
   
   app.post('/api/tts', async (req, res) => {
       // ... your TTS endpoint code
   });
   
   module.exports.handler = serverless(app);
   ```

2. **Install serverless-http:** `npm install serverless-http`

3. **Create `netlify.toml`:**
   ```toml
   [build]
     functions = "netlify/functions"
   
   [[redirects]]
     from = "/api/*"
     to = "/.netlify/functions/api/:splat"
     status = 200
   ```

4. **Set environment variables in Netlify dashboard**

5. **Your backend URL:** Same as frontend (`https://aipcprotectchatbot.netlify.app`)

---

## Quick Start Recommendation

**Use Railway** - it's the fastest and easiest:

1. Go to [railway.app](https://railway.app)
2. Sign up with GitHub
3. Click "New Project" → "Deploy from GitHub repo"
4. Select your repository
5. Add environment variables (OPENAI_API_KEY, ELEVENLABS_API_KEY)
6. Copy the generated URL (e.g., `https://your-app.up.railway.app`)
7. Update `index.html`:
   ```javascript
   window.API_BASE_URL = 'https://your-app.up.railway.app';
   ```

That's it! Your backend will be live and your frontend will connect to it.

---

## Testing Your Backend

Once deployed, test your backend URL:
- Visit: `https://your-backend-url.com/api/test`
- You should see: `{"message":"Server is running!","timestamp":"..."}`

If that works, your backend is ready!

