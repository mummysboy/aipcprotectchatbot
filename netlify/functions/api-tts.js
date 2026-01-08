// Netlify Function for Speechmatics TTS
exports.handler = async (event, context) => {
    // Handle CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'audio/mpeg'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: ''
        };
    }

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const apiKey = process.env.SPEECHMATICS_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'Speechmatics API key is not configured. Please set SPEECHMATICS_API_KEY in your Netlify environment variables.'
            })
        };
    }

    try {
        const { text, voiceId, outputFormat, sampleRate } = JSON.parse(event.body || '{}');

        if (!text) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Text is required'
                })
            };
        }

        if (!voiceId) {
            return {
                statusCode: 400,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: 'Voice ID is required'
                })
            };
        }

        // Speechmatics TTS API request format
        // Voice ID goes in the URL path, not the request body
        // Voice IDs should be lowercase (theo, sarah, megan, jack)
        const requestBody = {
            text: text
        };

        // Convert voice ID to lowercase for API compatibility
        const normalizedVoiceId = voiceId.toLowerCase();

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

        if (!response.ok) {
            const errorText = await response.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch (e) {
                errorData = { message: errorText };
            }
            
            const errorMessage = errorData.error?.message || errorData.message || `Speechmatics API error: ${response.status} ${response.statusText}`;
            
            return {
                statusCode: 500,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    error: errorMessage,
                    status: response.status,
                    details: errorData
                })
            };
        }

        // Get audio data as buffer
        const audioBuffer = await response.arrayBuffer();
        const audioBase64 = Buffer.from(audioBuffer).toString('base64');
        
        // Determine content type from response or default
        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': contentType,
                'Content-Length': audioBuffer.byteLength.toString(),
                'Access-Control-Allow-Origin': '*'
            },
            body: audioBase64,
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('Speechmatics TTS Error:', error);
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Failed to generate speech with Speechmatics',
                details: error.toString()
            })
        };
    }
};





