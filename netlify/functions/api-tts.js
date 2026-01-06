// Netlify Function for ElevenLabs TTS
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

    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: 'ElevenLabs API key is not configured. Please set ELEVENLABS_API_KEY in your Netlify environment variables.'
            })
        };
    }

    try {
        const { text, voiceId, modelId, stability, similarityBoost, style, useSpeakerBoost } = JSON.parse(event.body || '{}');

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

        const requestBody = {
            text: text,
            model_id: modelId || 'eleven_turbo_v2_5',
            voice_settings: {
                stability: stability !== undefined ? stability : 0.5,
                similarity_boost: similarityBoost !== undefined ? similarityBoost : 0.75,
                style: style !== undefined ? style : 0.0,
                use_speaker_boost: useSpeakerBoost !== undefined ? useSpeakerBoost : true
            }
        };

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
            method: 'POST',
            headers: {
                'Accept': 'audio/mpeg',
                'Content-Type': 'application/json',
                'xi-api-key': apiKey
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
            
            const errorMessage = errorData.detail?.message || errorData.message || `ElevenLabs API error: ${response.status} ${response.statusText}`;
            
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
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'audio/mpeg',
                'Content-Length': audioBuffer.byteLength.toString(),
                'Access-Control-Allow-Origin': '*'
            },
            body: audioBase64,
            isBase64Encoded: true
        };

    } catch (error) {
        console.error('ElevenLabs TTS Error:', error);
        return {
            statusCode: 500,
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                error: error.message || 'Failed to generate speech with ElevenLabs',
                details: error.toString()
            })
        };
    }
};



