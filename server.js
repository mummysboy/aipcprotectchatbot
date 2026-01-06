// Express server to proxy ChatGPT API requests and ElevenLabs TTS
// Reads API keys from .env file

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// API routes must come BEFORE static file serving
// ChatGPT API proxy endpoint
app.post('/api/chat', async (req, res) => {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({
            error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.'
        });
    }

    const { message, context, conversationHistory } = req.body;

    if (!message) {
        return res.status(400).json({
            error: 'Message is required'
        });
    }

    try {
        // Prepare messages for OpenAI API
        const messages = [
            {
                role: 'system',
                content: `You are an AI PC Protect Agent, a helpful and professional cybersecurity assistant. 
You help users understand security vulnerabilities and protect their computers. 
Be friendly, informative, and focused on helping users secure their systems. 
Keep responses concise and conversational, as if you're having a real-time chat.`
            }
        ];

        // Add context if provided
        if (context) {
            messages.push({
                role: 'system',
                content: `Context: ${JSON.stringify(context)}`
            });
        }

        // Add conversation history
        if (conversationHistory && Array.isArray(conversationHistory)) {
            messages.push(...conversationHistory);
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: message
        });

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                messages: messages,
                temperature: 0.7,
                max_tokens: 500
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const assistantMessage = data.choices[0].message.content;

        res.json({
            message: assistantMessage,
            conversationHistory: [
                ...(conversationHistory || []),
                { role: 'user', content: message },
                { role: 'assistant', content: assistantMessage }
            ]
        });
    } catch (error) {
        console.error('ChatGPT API Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to communicate with ChatGPT API'
        });
    }
});

// ElevenLabs TTS endpoint
app.post('/api/tts', async (req, res) => {
    console.log('POST /api/tts - Request received');
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
        console.error('ELEVENLABS_API_KEY not found');
        return res.status(500).json({
            error: 'ElevenLabs API key is not configured. Please set ELEVENLABS_API_KEY in your .env file.'
        });
    }

    const { text, voiceId, modelId, stability, similarityBoost, style, useSpeakerBoost } = req.body;

    console.log('TTS Request:', {
        textLength: text?.length,
        voiceId: voiceId,
        modelId: modelId || 'eleven_monolingual_v1'
    });

    if (!text) {
        return res.status(400).json({
            error: 'Text is required'
        });
    }

    if (!voiceId) {
        return res.status(400).json({
            error: 'Voice ID is required'
        });
    }

    try {
        const requestBody = {
            text: text,
            model_id: modelId || 'eleven_turbo_v2_5', // Updated to newer model for free tier
            voice_settings: {
                stability: stability !== undefined ? stability : 0.5,
                similarity_boost: similarityBoost !== undefined ? similarityBoost : 0.75,
                style: style !== undefined ? style : 0.0,
                use_speaker_boost: useSpeakerBoost !== undefined ? useSpeakerBoost : true
            }
        };

        console.log('Calling ElevenLabs API...');
        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey
            },
            body: JSON.stringify(requestBody)
        });

        console.log(`ElevenLabs API response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('ElevenLabs API error response:', errorText);
            
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            
            const errorMessage = errorData.detail?.message || errorData.message || `ElevenLabs API error: ${response.status} ${response.statusText}`;
            console.error('Error details:', errorMessage);
            
            return res.status(500).json({
                error: errorMessage,
                status: response.status,
                details: errorData
            });
        }

        console.log('ElevenLabs API success, processing audio...');
        // Get audio data as buffer
        const audioBuffer = await response.arrayBuffer();
        console.log(`Audio buffer received: ${audioBuffer.byteLength} bytes`);
        
        // Set appropriate headers for audio
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', audioBuffer.byteLength);
        res.send(Buffer.from(audioBuffer));
        console.log('Audio sent to client successfully');

    } catch (error) {
        console.error('ElevenLabs TTS Error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: error.message || 'Failed to generate speech with ElevenLabs',
            details: error.toString()
        });
    }
});

// Get available ElevenLabs voices
app.get('/api/tts/voices', async (req, res) => {
    console.log('GET /api/tts/voices - Request received');
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
        console.log('ELEVENLABS_API_KEY not found in environment');
        return res.status(500).json({
            error: 'ElevenLabs API key is not configured. Please set ELEVENLABS_API_KEY in your .env file.'
        });
    }

    console.log('ELEVENLABS_API_KEY found, calling ElevenLabs API...');

    try {
        const response = await fetch('https://api.elevenlabs.io/v1/voices', {
            method: 'GET',
            headers: {
                'xi-api-key': apiKey
            }
        });

        console.log(`ElevenLabs API response status: ${response.status}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('ElevenLabs API error:', errorData);
            throw new Error(errorData.detail?.message || `ElevenLabs API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`Successfully fetched ${data.voices?.length || 0} voices`);
        res.json(data);

    } catch (error) {
        console.error('ElevenLabs Voices Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to fetch voices from ElevenLabs'
        });
    }
});

// Static file serving (for HTML, CSS, JS files) - MUST come AFTER API routes
app.use(express.static(__dirname));

// Serve the main HTML file (fallback for root route)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Test route to verify server is working
app.get('/api/test', (req, res) => {
    res.json({ message: 'Server is running!', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Make sure OPENAI_API_KEY is set in your .env file`);
    if (process.env.ELEVENLABS_API_KEY) {
        console.log(`✓ ElevenLabs TTS is configured`);
    } else {
        console.log(`✗ ElevenLabs TTS not configured - using browser TTS fallback`);
    }
    console.log(`\nTest routes:`);
    console.log(`  GET http://localhost:${PORT}/api/test - Test server connection`);
    console.log(`  GET http://localhost:${PORT}/api/tts/voices - Get ElevenLabs voices`);
});

