// ChatGPT API Service
// Handles communication with local server that proxies OpenAI API requests

class ChatGPTService {
    constructor() {
        // Use API config for base URL (supports both local and hosted environments)
        const apiBaseUrl = window.API_CONFIG ? window.API_CONFIG.getApiUrl('/api/chat') : '/api/chat';
        this.apiUrl = apiBaseUrl;
        this.conversationHistory = [];
    }

    async sendMessage(userMessage, context = null, onChunk = null) {
        try {
            // Use streaming by default for faster response times
            const useStreaming = onChunk !== null;
            const apiUrl = useStreaming ? `${this.apiUrl}?stream=true` : this.apiUrl;

            if (useStreaming) {
                // Streaming mode
                console.log('Starting streaming request to:', apiUrl);
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'text/event-stream'
                    },
                    body: JSON.stringify({
                        message: userMessage,
                        context: context,
                        conversationHistory: this.conversationHistory
                    }),
                    cache: 'no-store'
                });

                console.log('Streaming response status:', response.status, response.statusText);
                console.log('Streaming response headers:', Object.fromEntries(response.headers.entries()));

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
                }

                let fullMessage = '';
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        // Process any remaining buffer
                        if (buffer) {
                            const lines = buffer.split('\n');
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const data = line.slice(6).trim();
                                    if (data === '[DONE]' || !data) continue;
                                    try {
                                        const parsed = JSON.parse(data);
                                        if (parsed.done && parsed.message) {
                                            fullMessage = parsed.message;
                                        }
                                    } catch (e) {
                                        // Skip invalid JSON
                                    }
                                }
                            }
                        }
                        break;
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
                                
                                if (parsed.done) {
                                    // Final message with conversation history
                                    if (parsed.conversationHistory) {
                                        this.conversationHistory = parsed.conversationHistory;
                                    }
                                    const finalMessage = parsed.message || fullMessage;
                                    console.log('Streaming complete, final message length:', finalMessage.length);
                                    return finalMessage;
                                }

                                if (parsed.chunk) {
                                    fullMessage += parsed.chunk;
                                    console.log('Received chunk, total length:', fullMessage.length);
                                    if (onChunk) {
                                        onChunk(parsed.chunk, fullMessage);
                                    }
                                } else if (parsed.message) {
                                    fullMessage = parsed.message;
                                    console.log('Received full message, length:', fullMessage.length);
                                    if (onChunk) {
                                        onChunk(parsed.message, fullMessage);
                                    }
                                }
                            } catch (e) {
                                console.warn('Failed to parse streaming chunk:', e, 'Data:', data.substring(0, 100));
                                // Skip invalid JSON
                            }
                        }
                    }
                }

                console.log('Streaming ended, returning message length:', fullMessage.length);
                
                // If we got no message from streaming, try non-streaming as fallback
                if (!fullMessage || fullMessage.trim().length === 0) {
                    console.warn('Streaming returned empty message, falling back to non-streaming mode');
                    // Fallback to non-streaming
                    const fallbackResponse = await fetch(this.apiUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: userMessage,
                            context: context,
                            conversationHistory: this.conversationHistory
                        }),
                        cache: 'no-store'
                    });

                    if (!fallbackResponse.ok) {
                        const errorData = await fallbackResponse.json().catch(() => ({}));
                        throw new Error(errorData.error || `API error: ${fallbackResponse.status} ${fallbackResponse.statusText}`);
                    }

                    const data = await fallbackResponse.json();
                    const assistantMessage = data.message;

                    // Update conversation history from server response
                    if (data.conversationHistory) {
                        this.conversationHistory = data.conversationHistory;
                    } else {
                        // Fallback: manually update conversation history
                        this.conversationHistory.push({
                            role: 'user',
                            content: userMessage
                        });
                        this.conversationHistory.push({
                            role: 'assistant',
                            content: assistantMessage
                        });
                    }

                    return assistantMessage;
                }
                
                return fullMessage;
            } else {
                // Non-streaming mode (fallback)
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: userMessage,
                        context: context,
                        conversationHistory: this.conversationHistory
                    }),
                    cache: 'no-store'
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
                }

                const data = await response.json();
                const assistantMessage = data.message;

                // Update conversation history from server response
                if (data.conversationHistory) {
                    this.conversationHistory = data.conversationHistory;
                } else {
                    // Fallback: manually update conversation history
                    this.conversationHistory.push({
                        role: 'user',
                        content: userMessage
                    });
                    this.conversationHistory.push({
                        role: 'assistant',
                        content: assistantMessage
                    });
                }

                return assistantMessage;
            }
        } catch (error) {
            console.error('ChatGPT API Error:', error);
            throw error;
        }
    }

    resetConversation() {
        this.conversationHistory = [];
    }

    getConversationHistory() {
        return this.conversationHistory;
    }
}

// Export for use in other scripts
window.ChatGPTService = ChatGPTService;

