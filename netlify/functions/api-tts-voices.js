// Netlify Function for Speechmatics Voices
exports.handler = async (event, context) => {
    // Handle CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle preflight OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    // Only allow GET
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const apiKey = process.env.SPEECHMATICS_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'Speechmatics API key is not configured. Please set SPEECHMATICS_API_KEY in your Netlify environment variables.'
            })
        };
    }

    try {
        // Speechmatics TTS API - voices endpoint
        // Note: Speechmatics TTS may not have a separate voices endpoint
        // Available voices: sarah, theo, megan, jack (as per documentation)
        const baseUrl = process.env.SPEECHMATICS_API_URL || 'https://preview.tts.speechmatics.com';
        const endpoint = `${baseUrl}/voices`;
        
        console.log(`Using endpoint: ${endpoint}`);
        
        const response = await fetch(endpoint, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            // If voices endpoint doesn't exist, return hardcoded list
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
                return {
                    statusCode: 200,
                    headers,
                    body: JSON.stringify(hardcodedVoices)
                };
            }
            
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `Speechmatics API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(data)
        };

    } catch (error) {
        console.error('Speechmatics Voices Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: error.message || 'Failed to fetch voices from Speechmatics'
            })
        };
    }
};





