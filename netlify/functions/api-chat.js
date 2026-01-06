// Netlify Function for ChatGPT API proxy
exports.handler = async (event, context) => {
    // Handle CORS
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: 'OpenAI API key is not configured. Please set OPENAI_API_KEY in your Netlify environment variables.'
            })
        };
    }

    try {
        const { message, context, conversationHistory } = JSON.parse(event.body || '{}');

        if (!message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({
                    error: 'Message is required'
                })
            };
        }

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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                message: assistantMessage,
                conversationHistory: [
                    ...(conversationHistory || []),
                    { role: 'user', content: message },
                    { role: 'assistant', content: assistantMessage }
                ]
            })
        };
    } catch (error) {
        console.error('ChatGPT API Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({
                error: error.message || 'Failed to communicate with ChatGPT API'
            })
        };
    }
};



