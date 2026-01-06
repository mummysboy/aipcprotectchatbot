// Phone Call Component JavaScript

class PhoneCall {
    constructor() {
        this.callContainer = null;
        this.isInitialized = false;
        this.synthesis = null;
        this.currentUtterance = null;
        this.speechQueue = [];
        this.isSpeaking = false;
    }

    init() {
        if (this.isInitialized) return;

        // Check for browser TTS support
        if ('speechSynthesis' in window) {
            this.synthesis = window.speechSynthesis;
        } else {
            console.warn('Text-to-speech not supported in this browser');
        }

        this.createCallHTML();
        this.callContainer = document.getElementById('phoneCall');
        this.setupEventListeners();
        this.isInitialized = true;
    }

    createCallHTML() {
        const overlay = document.createElement('div');
        overlay.className = 'phone-call-overlay';
        overlay.id = 'phoneCall';

        overlay.innerHTML = `
            <div class="phone-call-container">
                <div class="call-header">
                    <div class="call-status">
                        <div class="call-indicator"></div>
                        <span>AI PC Protect Agent</span>
                    </div>
                    <button class="close-call-button" id="closeCall">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <div class="call-content">
                    <div class="agent-avatar-container">
                        <div class="agent-avatar" id="agentAvatar">
                            <svg width="100" height="100" viewBox="0 0 100 100" fill="none">
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
                        <div class="audio-waveform" id="audioWaveform">
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                            <div class="wave-bar"></div>
                        </div>
                    </div>

                    <div class="call-captions">
                        <p id="captionText" class="caption-text">Connecting...</p>
                    </div>
                </div>

                <div class="call-controls">
                    <button class="call-control-btn" id="muteBtn" title="Mute">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    </button>
                    <button class="call-control-btn hangup-btn" id="hangupBtn" title="Hang Up">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                    </button>
                    <button class="call-control-btn" id="speakerBtn" title="Speaker">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
    }

    setupEventListeners() {
        const closeBtn = document.getElementById('closeCall');
        const hangupBtn = document.getElementById('hangupBtn');
        const muteBtn = document.getElementById('muteBtn');
        const speakerBtn = document.getElementById('speakerBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.endCall());
        }

        if (hangupBtn) {
            hangupBtn.addEventListener('click', () => this.endCall());
        }

        if (muteBtn) {
            muteBtn.addEventListener('click', () => this.toggleMute());
        }

        if (speakerBtn) {
            speakerBtn.addEventListener('click', () => this.toggleSpeaker());
        }
    }

    convertDataToSpeech(data) {
        const messages = [];
        const agentName = data.agentName || "Alex"; // Default name, can be customized
        
        // Opening greeting
        messages.push(`Hi, this is ${agentName}, I'm the AI PC Protect real-time security assistant.`);

        // Introduction
        messages.push("I'm reaching out because during a standard security scan, we identified multiple high-risk vulnerabilities on your system that are commonly exploited by attackers. I want to briefly explain what we found, why it matters, and how we can help you fix it immediately.");

        // Context about cybercrime
        messages.push("Today, cybercrime is a multi-billion-dollar industry. Even large companies spending millions on cybersecurity still get breached. For everyday users who don't have dedicated protection, the risk is significantly higher—especially from vulnerabilities that are often overlooked.");

        // First Issue: WiFi Credentials (only if WiFi data exists)
        if (data.wifiList && Array.isArray(data.wifiList) && data.wifiList.length > 0) {
            messages.push("First Issue: Exposed Wi-Fi Credentials");
            messages.push("One of the things we detected is that saved Wi-Fi passwords on your computer are currently exposed.");
            messages.push("To be clear—we do not have admin access, elevated privileges, or control over your system. These passwords are visible the same way they are to malware or attackers already present on a device.");
            messages.push("Why this matters:");
            messages.push("Wi-Fi credentials are often reused across work, home, cafés, and shared networks");
            messages.push("Attackers frequently use trusted network access to move laterally between devices");
            messages.push("Many large crypto and data breaches begin with compromised network trust, not brute-force hacking");
            messages.push("This means someone with access to one trusted Wi-Fi network can gain far more permissions than expected.");
        }

        // Second Issue: Hidden File Extensions (only if file extensions are hidden)
        if (data.isHideFileExtensionsEnabled === true) {
            messages.push("Second Issue: Hidden File Extensions");
            messages.push("We also found a critical vulnerability related to hidden file extensions.");
            messages.push("This is one of the most common attack methods used today:");
            messages.push("Malware disguises itself as a trusted file like a PDF or document");
            messages.push("Because file extensions are hidden, the malicious file looks harmless");
            messages.push("One click is enough to infect or take control of a system");
            messages.push("This tactic is extremely effective—and it's why even experienced users get compromised.");
        }

        // Why This Is Important
        messages.push("Why This Is Important");
        messages.push("Right now, these vulnerabilities are actively exposed, which significantly increases the risk of:");
        messages.push("Unauthorized access");
        messages.push("Credential theft");
        messages.push("System takeover");
        messages.push("Financial or data loss");

        // How We Help
        messages.push("How We Help");
        messages.push("If you upgrade to AI PC Protect Pro, we will:");
        messages.push("Secure and encrypt stored Wi-Fi credentials");
        messages.push("Lock down trusted network permissions");
        messages.push("Reveal and protect file extensions");
        messages.push("Close common entry points attackers rely on");
        messages.push("Monitor your system in real time for similar threats");
        messages.push("We can fix these issues immediately, before they're exploited.");
        messages.push("Would you like me to take care of that for you now?");

        return messages;
    }

    startCall(data) {
        if (!this.isInitialized) {
            this.init();
            setTimeout(() => this.startCall(data), 100);
            return;
        }

        this.show();
        
        // Update agent name in header if provided
        const agentName = data.agentName || "AI PC Protect Agent";
        const statusSpan = this.callContainer?.querySelector('.call-status span');
        if (statusSpan) {
            statusSpan.textContent = agentName;
        }
        
        // Convert data to speech messages
        const speechMessages = this.convertDataToSpeech(data);
        
        // Start speaking after a brief connection delay
        setTimeout(() => {
            this.updateCaption("Connected. AI PC Protect Agent speaking...");
            this.speakMessages(speechMessages);
        }, 1000);
    }

    speakMessages(messages) {
        this.speechQueue = [...messages];
        this.processSpeechQueue();
    }

    processSpeechQueue() {
        if (this.speechQueue.length === 0) {
            this.isSpeaking = false;
            this.stopWaveform();
            this.updateCaption("Call ended.");
            return;
        }

        if (this.isSpeaking) return;

        const message = this.speechQueue.shift();
        this.speak(message);
    }

    speak(text) {
        if (!this.synthesis) {
            // Fallback: just show text if TTS not available
            this.updateCaption(text);
            setTimeout(() => this.processSpeechQueue(), 2000);
            return;
        }

        // Cancel any ongoing speech
        this.synthesis.cancel();

        this.isSpeaking = true;
        this.startWaveform();
        this.updateCaption(text);

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        utterance.onend = () => {
            this.isSpeaking = false;
            this.stopWaveform();
            // Small delay before next message
            setTimeout(() => this.processSpeechQueue(), 500);
        };

        utterance.onerror = (event) => {
            console.error('Speech synthesis error:', event);
            this.isSpeaking = false;
            this.stopWaveform();
            setTimeout(() => this.processSpeechQueue(), 500);
        };

        this.currentUtterance = utterance;
        this.synthesis.speak(utterance);
    }

    startWaveform() {
        const waveform = document.getElementById('audioWaveform');
        const avatar = document.getElementById('agentAvatar');
        if (waveform) {
            waveform.classList.add('active');
        }
        if (avatar) {
            avatar.classList.add('speaking');
        }
    }

    stopWaveform() {
        const waveform = document.getElementById('audioWaveform');
        const avatar = document.getElementById('agentAvatar');
        if (waveform) {
            waveform.classList.remove('active');
        }
        if (avatar) {
            avatar.classList.remove('speaking');
        }
    }

    updateCaption(text) {
        const captionElement = document.getElementById('captionText');
        if (captionElement) {
            captionElement.textContent = text;
        }
    }

    toggleMute() {
        if (this.synthesis && this.currentUtterance) {
            if (this.synthesis.speaking) {
                this.synthesis.pause();
            } else {
                this.synthesis.resume();
            }
        }
    }

    toggleSpeaker() {
        // Toggle speaker icon state (visual only for now)
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.classList.toggle('active');
        }
    }

    endCall() {
        // Stop any ongoing speech
        if (this.synthesis) {
            this.synthesis.cancel();
        }
        
        this.isSpeaking = false;
        this.speechQueue = [];
        this.stopWaveform();
        this.hide();
    }

    show() {
        if (this.callContainer) {
            this.callContainer.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    hide() {
        if (this.callContainer) {
            this.callContainer.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
}

// Export for use in main script
window.PhoneCall = PhoneCall;
