# Hosting Configuration Guide

## Quick Fix for 404 Errors When Hosted

If you're seeing `404` errors for `/api/tts` or `/api/chat` when hosting, you need to configure the API base URL.

## Solution

### Step 1: Determine Your Backend URL

Find the URL where your `server.js` is running. For example:
- `https://your-app.herokuapp.com`
- `https://your-app.vercel.app`
- `https://api.yourdomain.com`
- `http://localhost:3000` (for local testing)

### Step 2: Configure the API Base URL

Add this script **before** the `api-config.js` script in your HTML file (`index.html`):

```html
<script>
    // Set your backend server URL here
    window.API_BASE_URL = 'https://your-backend-url.com';
</script>
<script src="api-config.js"></script>
```

### Example: Updated index.html

```html
<body>
    <!-- Your HTML content -->
    
    <script>
        // Unregister service workers
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(function(registrations) {
                for(let registration of registrations) {
                    registration.unregister();
                }
            });
        }
    </script>
    
    <!-- Set API base URL for hosted environment -->
    <script>
        // Change this to your actual backend URL
        window.API_BASE_URL = 'https://your-backend-url.com';
    </script>
    
    <!-- Load scripts (api-config.js must come first) -->
    <script src="api-config.js"></script>
    <script src="chatgpt-service.js"></script>
    <script src="tts-service.js"></script>
    <script src="chatbot-popup.js"></script>
    <script src="phone-call.js"></script>
    <script src="script.js"></script>
</body>
```

## Alternative: Using Data Attribute

You can also set the API base URL using a data attribute on the `<html>` tag:

```html
<html lang="en" data-api-base-url="https://your-backend-url.com">
```

## Testing

After configuring, check the browser console. You should see:
```
API Configuration: { baseUrl: 'https://your-backend-url.com', example: 'https://your-backend-url.com/api/test' }
```

If you see this, the configuration is working correctly.

## Troubleshooting

1. **Still getting 404 errors?**
   - Verify your backend server is running
   - Check that the URL is correct (no trailing slash)
   - Test the backend URL directly: `https://your-backend-url.com/api/test`

2. **CORS errors?**
   - Make sure your backend has CORS enabled (already configured in `server.js`)
   - Check browser console for specific CORS error messages

3. **API calls work locally but not when hosted?**
   - Make sure you've set `window.API_BASE_URL` before loading `api-config.js`
   - Check that your backend is accessible from the frontend domain

## For Same-Domain Hosting

If your frontend and backend are on the same domain (e.g., both served from `https://yourdomain.com`), you don't need to set `API_BASE_URL`. The app will automatically use relative URLs.



