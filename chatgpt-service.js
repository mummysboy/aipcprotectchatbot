// ChatGPT API Service
// Handles communication with local server that proxies OpenAI API requests

class ChatGPTService {
    constructor() {
        // Use local server endpoint instead of OpenAI directly
        this.apiUrl = '/api/chat';
        this.conversationHistory = [];
    }

    async sendMessage(userMessage, context = null) {
        try {
            // Use fetch with cache: 'no-store' to prevent service worker interference
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: userMessage,
                    context: context,
                    conversationHistory: this.conversationHistory
                }),
                cache: 'no-store' // Prevent service worker from caching POST requests
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

