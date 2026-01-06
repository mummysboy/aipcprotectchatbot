// Chatbot Popup Component JavaScript

class ChatbotPopup {
    constructor() {
        this.popup = null;
        this.isInitialized = false;
    }

    init() {
        if (this.isInitialized) return;

        // Create the popup HTML structure
        this.createPopupHTML();
        this.popup = document.getElementById('chatbotPopup');
        this.setupEventListeners();
        this.isInitialized = true;
    }

    createPopupHTML() {
        const overlay = document.createElement('div');
        overlay.className = 'chatbot-popup-overlay';
        overlay.id = 'chatbotPopup';

        overlay.innerHTML = `
            <div class="chatbot-popup-container">
                <div class="chatbot-popup-header">
                    <div class="header-left">
                        <svg class="phone-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        <span>Incoming Call</span>
                    </div>
                    <button class="close-button" id="closeChatbot">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="chatbot-popup-content">
                    <div class="agent-icon-container">
                        <div class="agent-icon">
                            <svg width="80" height="80" viewBox="0 0 100 100" fill="none">
                                <path d="M50 10 L20 25 L20 50 C20 70 50 85 50 85 C50 85 80 70 80 50 L80 25 Z" fill="url(#shieldGradient)" opacity="0.3"/>
                                <circle cx="40" cy="45" r="4" fill="white"/>
                                <circle cx="60" cy="45" r="4" fill="white"/>
                                <circle cx="50" cy="60" r="3" fill="white"/>
                                <circle cx="35" cy="55" r="2" fill="white"/>
                                <circle cx="65" cy="55" r="2" fill="white"/>
                                <defs>
                                    <linearGradient id="shieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                        <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                                        <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    <h2 class="agent-name">AI PC Protect Agent</h2>
                    <p class="agent-description">is calling you about your security needs</p>
                </div>

                <div class="chatbot-popup-actions">
                    <button class="action-btn decline-btn" id="declineBtn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                            <line x1="2" y1="2" x2="22" y2="22"></line>
                        </svg>
                        <span>Decline</span>
                    </button>
                    <button class="action-btn accept-btn" id="acceptBtn">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        <span>Accept</span>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    setupEventListeners() {
        const closeBtn = document.getElementById('closeChatbot');
        const declineBtn = document.getElementById('declineBtn');
        const acceptBtn = document.getElementById('acceptBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        if (declineBtn) {
            declineBtn.addEventListener('click', () => this.hide());
        }

        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                this.hide();
                // Trigger phone call - will be handled by main script
                const event = new CustomEvent('acceptCall', { 
                    detail: { source: 'chatbotPopup' } 
                });
                window.dispatchEvent(event);
            });
        }

        // Close on overlay click
        if (this.popup) {
            this.popup.addEventListener('click', (e) => {
                if (e.target === this.popup) {
                    this.hide();
                }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    show() {
        if (!this.isInitialized) {
            this.init();
            // Wait a bit for initialization
            setTimeout(() => this.show(), 100);
            return;
        }

        if (this.popup) {
            this.popup.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    hide() {
        if (this.popup) {
            this.popup.classList.remove('active');
            document.body.style.overflow = '';
        }
    }

    isVisible() {
        return this.popup && this.popup.classList.contains('active');
    }
}

// Export for use in main script
window.ChatbotPopup = ChatbotPopup;
