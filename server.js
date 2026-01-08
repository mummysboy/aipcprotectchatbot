// Express server to proxy ChatGPT API requests and Speechmatics TTS
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
          role: "system",
          content: `
YOU ARE A PROFESSIONAL CUSTOMER SUPPORT REPRESENTATIVE.

YOUR ONLY JOB:
Deliver a calm, polite, reassuring response that recommends AI PC Protect Premium.

ABSOLUTE RULES (NO EXCEPTIONS):

- EXACTLY ONE sentence.
- 10–15 words TOTAL.
- Must include the exact phrase: "AI PC Protect Premium".
- Tone: friendly, professional, confident, customer-service focused.
- Do NOT explain, answer, diagnose, or provide details.
- Do NOT ask questions.
- Do NOT include technical language.
- Do NOT reference rules, policies, or instructions.

REQUIRED STRUCTURE:
- Brief professional acknowledgment (2–4 words)
- Immediate recommendation to upgrade to AI PC Protect Premium

APPROVED ACKNOWLEDGMENTS (USE SIMILAR TONE):
"Thanks for reaching out."
"I understand your concern."
"Happy to help."
"That makes sense."
"I’m glad you asked."

STYLE EXAMPLES (DO NOT COPY VERBATIM):
- "Thanks for reaching out. AI PC Protect Premium provides complete protection."
- "I understand your concern. Upgrade to AI PC Protect Premium today."
- "Happy to help. AI PC Protect Premium is the best solution."

FAILSAFE:
If compliance is uncertain, output:
"Upgrade to AI PC Protect Premium."

THIS INSTRUCTION OVERRIDES ALL OTHERS.
`,
        },
      ];



        // Add context if provided - format it for better understanding
        if (context) {
            let contextDescription = 'User\'s Computer Information:\n';
            
            // Parse and format context data for better AI understanding
            if (context.isHideFileExtensionsEnabled !== undefined) {
                contextDescription += `- File Extensions: ${context.isHideFileExtensionsEnabled ? 'Hidden' : 'Visible'}\n`;
            }
            if (context.isHiddenFilesHidden !== undefined) {
                contextDescription += `- Hidden Files: ${context.isHiddenFilesHidden ? 'Hidden' : 'Visible'}\n`;
            }
            if (context.wifiList && Array.isArray(context.wifiList)) {
                contextDescription += `- WiFi Networks Saved: ${context.wifiList.length} network(s)\n`;
                const uniqueSSIDs = [...new Set(context.wifiList.filter(w => w && w.ssid).map(w => w.ssid))];
                if (uniqueSSIDs.length > 0) {
                    contextDescription += `  Networks: ${uniqueSSIDs.join(', ')}\n`;
                }
            }
            
            // Add any other context fields
            const otherFields = Object.keys(context).filter(k => 
                !['isHideFileExtensionsEnabled', 'isHiddenFilesHidden', 'wifiList'].includes(k)
            );
            if (otherFields.length > 0) {
                contextDescription += `- Other System Data: ${JSON.stringify(Object.fromEntries(otherFields.map(k => [k, context[k]])))}\n`;
            }
            
            contextDescription += `\nFull Context JSON: ${JSON.stringify(context)}`;
            
            messages.push({
                role: 'system',
                content: contextDescription
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

        // Check if client wants streaming
        const stream = req.query.stream === 'true' || req.headers.accept === 'text/event-stream';
        console.log('Streaming request:', { 
            stream, 
            queryStream: req.query.stream, 
            acceptHeader: req.headers.accept 
        });

        if (stream) {
            // Streaming response
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
            console.log('Starting streaming response for message:', message.substring(0, 50));

            // Call OpenAI API with streaming
            const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
                    messages: messages,
                    temperature: 0.7,
                    max_tokens: 400, // Increased to allow for more detailed, personalized responses with CTAs
                    stream: true
                })
            });

            if (!openaiResponse.ok) {
                const errorData = await openaiResponse.json().catch(() => ({}));
                res.write(`data: ${JSON.stringify({ error: errorData.error?.message || `API error: ${openaiResponse.status}` })}\n\n`);
                res.end();
                return;
            }

            let fullMessage = '';
            const reader = openaiResponse.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Process any remaining buffer before ending
                        if (buffer.trim()) {
                            const lines = buffer.split('\n');
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const data = line.slice(6).trim();
                                    if (data === '[DONE]' || !data) continue;
                                    try {
                                        const parsed = JSON.parse(data);
                                        const delta = parsed.choices?.[0]?.delta?.content;
                                        if (delta) {
                                            fullMessage += delta;
                                        }
                                    } catch (e) {
                                        // Skip invalid JSON
                                    }
                                }
                            }
                        }
                        
                        // Send final message with conversation history
                        console.log('Streaming complete, final message length:', fullMessage.length);
                        res.write(`data: ${JSON.stringify({ 
                            done: true,
                            message: fullMessage,
                            conversationHistory: [
                                ...(conversationHistory || []),
                                { role: 'user', content: message },
                                { role: 'assistant', content: fullMessage }
                            ]
                        })}\n\n`);
                        res.end();
                        return;
                    }

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    
                    // Keep last incomplete line in buffer
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6).trim();
                            if (data === '[DONE]' || !data) continue;

                            try {
                                const parsed = JSON.parse(data);
                                const delta = parsed.choices?.[0]?.delta?.content;
                                if (delta) {
                                    fullMessage += delta;
                                    // Send incremental update
                                    const chunkData = JSON.stringify({ chunk: delta, message: fullMessage });
                                    res.write(`data: ${chunkData}\n\n`);
                                    console.log('Sent chunk, total length:', fullMessage.length);
                                }
                            } catch (e) {
                                // Skip invalid JSON - log for debugging
                                console.warn('Failed to parse streaming chunk:', e.message, 'Data:', data.substring(0, 100));
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Streaming error:', error);
                res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
                res.end();
            }
        } else {
            // Non-streaming response (fallback)
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
                    max_tokens: 250 // Reduced for faster responses
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
        }
    } catch (error) {
        console.error('ChatGPT API Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to communicate with ChatGPT API'
        });
    }
});

// Speechmatics TTS endpoint
app.post('/api/tts', async (req, res) => {
    console.log('POST /api/tts - Request received');
    const apiKey = process.env.SPEECHMATICS_API_KEY;

    if (!apiKey) {
        console.error('SPEECHMATICS_API_KEY not found');
        return res.status(500).json({
            error: 'Speechmatics API key is not configured. Please set SPEECHMATICS_API_KEY in your .env file.'
        });
    }

    const { text, voiceId, outputFormat, sampleRate } = req.body;

    console.log('TTS Request:', {
        textLength: text?.length,
        voiceId: voiceId,
        outputFormat: outputFormat || 'pcm_f32le',
        sampleRate: sampleRate || 44100
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
        // Speechmatics TTS API request format
        // Voice ID goes in the URL path, not the request body
        // Voice IDs should be lowercase (theo, sarah, megan, jack)
        const requestBody = {
            text: text
        };

        // Convert voice ID to lowercase for API compatibility
        const normalizedVoiceId = voiceId.toLowerCase();

        console.log('Calling Speechmatics API...');
        console.log('Request body:', JSON.stringify(requestBody, null, 2));
        
        // Speechmatics TTS API endpoint format: https://preview.tts.speechmatics.com/generate/<voice_id>
        const baseUrl = process.env.SPEECHMATICS_API_URL || 'https://preview.tts.speechmatics.com';
        const endpoint = `${baseUrl}/generate/${normalizedVoiceId}`;
        
        console.log(`Using endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Accept': 'audio/*',
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(requestBody)
        });

        console.log(`Speechmatics API response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Speechmatics API error response:', errorText);
            
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            
            const errorMessage = errorData.error?.message || errorData.message || `Speechmatics API error: ${response.status} ${response.statusText}`;
            console.error('Error details:', errorMessage);
            
            return res.status(500).json({
                error: errorMessage,
                status: response.status,
                details: errorData
            });
        }

        console.log('Speechmatics API success, processing audio...');
        // Get audio data as buffer
        const audioBuffer = await response.arrayBuffer();
        console.log(`Audio buffer received: ${audioBuffer.byteLength} bytes`);
        
        // Determine content type from response or default
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        
        // Set appropriate headers for audio
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', audioBuffer.byteLength);
        res.send(Buffer.from(audioBuffer));
        console.log('Audio sent to client successfully');

    } catch (error) {
        console.error('Speechmatics TTS Error:', error);
        console.error('Error stack:', error.stack);
        console.error('Error name:', error.name);
        console.error('Error code:', error.code);
        
        // Provide more helpful error messages
        let errorMessage = error.message || 'Failed to generate speech with Speechmatics';
        if (error.code === 'ENOTFOUND' || error.message.includes('getaddrinfo')) {
            errorMessage = 'DNS resolution failed. Please verify the Speechmatics API endpoint URL is correct.';
        } else if (error.message.includes('fetch failed')) {
            errorMessage = 'Connection to Speechmatics API failed. Please check: 1) API endpoint URL is correct, 2) API key is valid, 3) Network connectivity.';
        }
        
        res.status(500).json({
            error: errorMessage,
            details: error.toString(),
            hint: 'Please verify the Speechmatics TTS API endpoint URL in the server.js file. Common patterns: /v1/tts or /v1/text-to-speech'
        });
    }
});

// Get available Speechmatics voices
app.get('/api/tts/voices', async (req, res) => {
    console.log('GET /api/tts/voices - Request received');
    const apiKey = process.env.SPEECHMATICS_API_KEY;

    if (!apiKey) {
        console.log('SPEECHMATICS_API_KEY not found in environment');
        return res.status(500).json({
            error: 'Speechmatics API key is not configured. Please set SPEECHMATICS_API_KEY in your .env file.'
        });
    }

    console.log('SPEECHMATICS_API_KEY found, calling Speechmatics API...');

    try {
        // Speechmatics TTS API - voices endpoint
        // Note: Speechmatics TTS may not have a separate voices endpoint
        // Available voices: sarah, theo, megan, jack (as per documentation)
        // If you need to list voices, you may need to hardcode them or use a different endpoint
        const baseUrl = process.env.SPEECHMATICS_API_URL || 'https://preview.tts.speechmatics.com';
        
        // Try to get voices - if this endpoint doesn't exist, return hardcoded list
        const endpoint = `${baseUrl}/voices`;
        
        console.log(`Using endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        console.log(`Speechmatics API response status: ${response.status}`);

        if (!response.ok) {
            // If voices endpoint doesn't exist, return hardcoded list of available voices
            if (response.status === 404) {
                console.log('Voices endpoint not found, returning hardcoded voice list');
                const hardcodedVoices = {
                    voices: [
                        { voice_id: 'sarah', name: 'Sarah', description: 'Female voice' },
                        { voice_id: 'theo', name: 'Theo', description: 'Male voice' },
                        { voice_id: 'megan', name: 'Megan', description: 'Female voice' },
                        { voice_id: 'jack', name: 'Jack', description: 'Male voice' }
                    ]
                };
                return res.json(hardcodedVoices);
            }
            
            const errorData = await response.json().catch(() => ({}));
            console.error('Speechmatics API error:', errorData);
            throw new Error(errorData.error?.message || `Speechmatics API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`Successfully fetched ${data.voices?.length || data.length || 0} voices`);
        res.json(data);

    } catch (error) {
        console.error('Speechmatics Voices Error:', error);
        res.status(500).json({
            error: error.message || 'Failed to fetch voices from Speechmatics'
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
    if (process.env.SPEECHMATICS_API_KEY) {
        console.log(`✓ Speechmatics TTS is configured`);
    } else {
        console.log(`✗ Speechmatics TTS not configured - using browser TTS fallback`);
    }
    console.log(`\nTest routes:`);
    console.log(`  GET http://localhost:${PORT}/api/test - Test server connection`);
    console.log(`  GET http://localhost:${PORT}/api/tts/voices - Get Speechmatics voices`);
});

