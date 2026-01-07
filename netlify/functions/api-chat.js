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
                content: `You are an AI PC Protect Agent. Keep ALL responses SHORT (2-3 sentences max) for fast response times.

CRITICAL RULES:
1. **KEEP IT SHORT** - Max 2-3 sentences. Speed is priority.

2. **ALWAYS END WITH DOWNLOAD PITCH** - Every response MUST end with: "Downloading AI PC Protect is crucial for your security. Would you like me to walk you through the process?"

3. **IF USER SAYS YES** - Respond EXACTLY: "Great! Begin by pressing the Download button below to get protected."

4. **IF USER SAYS NO** - Give a SHORT counter-pitch about why protection is important (hackers, malware, identity theft risks) then ask again: "Are you sure? Your PC is vulnerable right now. Would you like me to walk you through the download?"

5. **USE CONTEXT DATA** briefly if available (WiFi networks, file settings) to personalize.

6. **BE FRIENDLY** - Quick compliment, then straight to the point.

Key benefits to mention briefly: 24/7 real-time protection, malware blocking, ransomware prevention, AI-powered security.

Remember: SHORT responses = FAST responses. Always pitch the download.`
            }
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
        const stream = event.queryStringParameters?.stream === 'true';

        if (stream) {
            // Streaming response for Netlify Functions
            headers['Content-Type'] = 'text/event-stream';
            headers['Cache-Control'] = 'no-cache';
            headers['Connection'] = 'keep-alive';

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
                    max_tokens: 150, // Reduced for faster response times
                    stream: true
                })
            });

            if (!openaiResponse.ok) {
                const errorData = await openaiResponse.json().catch(() => ({}));
                return {
                    statusCode: 500,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ error: errorData.error?.message || `API error: ${openaiResponse.status}` })
                };
            }

            // Note: Netlify Functions have limitations with streaming
            // We'll collect the full response and send it
            let fullMessage = '';
            const reader = openaiResponse.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split('\n');

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') break;

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
            } catch (error) {
                console.error('Streaming error:', error);
                return {
                    statusCode: 500,
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ error: error.message })
                };
            }

            // For Netlify, we'll send the complete message
            // (True streaming would require AWS Lambda streaming which is more complex)
            return {
                statusCode: 200,
                headers: {
                    ...headers,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: fullMessage,
                    conversationHistory: [
                        ...(conversationHistory || []),
                        { role: 'user', content: message },
                        { role: 'assistant', content: fullMessage }
                    ]
                })
            };
        } else {
            // Non-streaming response
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
                    max_tokens: 150 // Reduced for faster response times
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
        }
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





