// Chatbot Popup Component JavaScript

class ChatbotPopup {
    constructor(options = {}) {
        this.popup = null;
        this.isInitialized = false;
        this.chatMode = false;
        this.chatGPTService = null;
        this.contextData = null;
        
        // Voice settings
        this.ttsService = null;
        this.recognition = null;
        this.isSpeaking = false;
        this.isMuted = false;
        this.isListening = false;
        this.selectedVoice = options.voice || null;
        this.voiceGender = options.voiceGender || null;
        this.voiceLang = options.voiceLang || 'en-US';
        
        // TTS Provider options
        this.ttsProvider = options.ttsProvider || 'browser'; // 'elevenlabs' or 'browser'
        this.elevenLabsVoiceId = options.elevenLabsVoiceId || null;
        
        // Phone call flow state
        this.speechQueue = [];
        this.waitingForResponse = false;
        this.isHangingUp = false;
        this.hasShownSalesPitch = false;
        this.currentSpeakingPromise = null; // Track current speaking promise
        this.pendingAudio = null; // Preloaded next audio
        this.batchSize = 3; // Number of messages to batch together
        this.currentCaptions = []; // Track current batch captions for display
    }

    init() {
        if (this.isInitialized) return;

        // Initialize TTS service
        this.initTTS();

        // Initialize voice capabilities
        this.initVoice();

        // Create the popup HTML structure
        this.createPopupHTML();
        this.popup = document.getElementById('chatbotPopup');
        this.setupEventListeners();
        this.isInitialized = true;
    }

    initTTS() {
        // Initialize TTS service (ElevenLabs or browser fallback)
        this.ttsService = new TTSService({
            provider: this.ttsProvider,
            apiKey: null, // API key handled by server
            voiceId: this.elevenLabsVoiceId,
            voiceLang: this.voiceLang
        });
        
        this.ttsService.init();
        
        // Set up callbacks
        // Note: We handle isSpeaking flag in the speak() method itself
        // to avoid race conditions with the promise resolution
        // We don't want the callback to interfere with promise-based flow
        this.ttsService.setOnEnd(() => {
            // Do nothing here - let the promise handle everything
            // This prevents double-processing of the queue
        });
        
        this.ttsService.setOnError((error) => {
            console.error('TTS error:', error);
            this.isSpeaking = false;
            this.stopWaveform();
            // Continue processing queue even on error
            setTimeout(() => this.processSpeechQueue(), 500);
        });
    }

    initVoice() {
        // Initialize speech recognition (for voice input)

        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = this.voiceLang;
            
            this.recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.trim();
                if (this.waitingForResponse) {
                    this.handleUserResponse(transcript);
                } else {
                    this.handleVoiceInput(transcript);
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                let errorMessage = 'Voice input error. ';
                
                switch(event.error) {
                    case 'no-speech':
                        errorMessage = 'No speech detected. Please try again.';
                        break;
                    case 'audio-capture':
                        errorMessage = 'No microphone found. Please check your microphone.';
                        break;
                    case 'not-allowed':
                        errorMessage = 'Microphone access denied. Please allow microphone access in your browser settings.';
                        break;
                    case 'network':
                        errorMessage = 'Network error. Please check your internet connection.';
                        break;
                    case 'aborted':
                        // User stopped it, that's fine
                        return;
                    default:
                        errorMessage = `Voice input error: ${event.error}. Please try again.`;
                }
                
                this.showVoiceError(errorMessage);
                this.stopListening();
            };

            this.recognition.onend = () => {
                // Only restart if we're waiting for a response AND not speaking
                if (this.waitingForResponse && !this.isSpeaking && !this.isListening) {
                    try {
                        this.isListening = true;
                        this.recognition.start();
                    } catch (e) {
                        // Recognition already started or error
                        console.warn('Could not restart recognition:', e);
                        this.isListening = false;
                    }
                } else {
                    this.isListening = false;
                }
            };
        } else {
            console.warn('Speech recognition not supported in this browser');
        }
    }

    loadVoices() {
        // This method is kept for compatibility but TTS is now handled by TTSService
        if (this.ttsService && this.ttsService.synthesis) {
            if (this.ttsService.synthesis.getVoices().length > 0) {
                this.selectVoice();
            }
            
            this.ttsService.synthesis.onvoiceschanged = () => {
                this.selectVoice();
            };
        }
    }

    selectVoice() {
        if (!this.ttsService || !this.ttsService.synthesis) return;
        const voices = this.ttsService.synthesis.getVoices();
        
        if (voices.length === 0) return;

        // If a specific voice name is provided, use it
        if (this.selectedVoice && typeof this.selectedVoice === 'string') {
            const voice = voices.find(v => v.name === this.selectedVoice);
            if (voice) {
                this.selectedVoice = voice;
                return;
            }
        }

        // Filter by gender if specified
        let filteredVoices = voices;
        if (this.voiceGender) {
            filteredVoices = voices.filter(voice => {
                const name = voice.name.toLowerCase();
                if (this.voiceGender === 'female') {
                    return name.includes('female') || name.includes('samantha') || 
                           name.includes('karen') || name.includes('susan') || 
                           name.includes('zira') || name.includes('victoria') ||
                           name.includes('kate') || name.includes('siri') ||
                           (voice.name.includes('Google') && name.includes('female'));
                } else if (this.voiceGender === 'male') {
                    return name.includes('male') || name.includes('alex') || 
                           name.includes('daniel') || name.includes('david') ||
                           name.includes('mark') || name.includes('tom') ||
                           (voice.name.includes('Google') && name.includes('male'));
                }
                return true;
            });
        }

        // Filter by language
        filteredVoices = filteredVoices.filter(voice => 
            voice.lang.startsWith(this.voiceLang.split('-')[0])
        );

        // Prefer local voices
        const localVoices = filteredVoices.filter(v => v.localService);
        const preferredVoices = localVoices.length > 0 ? localVoices : filteredVoices;

        if (preferredVoices.length > 0) {
            this.selectedVoice = preferredVoices[0];
        } else if (filteredVoices.length > 0) {
            this.selectedVoice = filteredVoices[0];
        } else {
            const englishVoices = voices.filter(v => v.lang.startsWith('en'));
            this.selectedVoice = englishVoices.length > 0 ? englishVoices[0] : voices[0];
        }
    }

    createPopupHTML() {
        const overlay = document.createElement('div');
        overlay.className = 'chatbot-popup-overlay';
        overlay.id = 'chatbotPopup';

        overlay.innerHTML = `
            <div class="chatbot-popup-container phone-call-container">
                <div class="call-header chatbot-popup-header">
                    <div class="call-status header-left">
                        <div class="call-indicator"></div>
                        <span id="headerTitle">AI PC Protect Agent</span>
                    </div>
                    <button class="close-call-button close-button" id="closeChatbot">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <line x1="18" y1="6" x2="6" y2="18"></line>
                            <line x1="6" y1="6" x2="18" y2="18"></line>
                        </svg>
                    </button>
                </div>

                <!-- Phone Call View -->
                <div class="call-content chatbot-popup-content" id="callView">
                    <div class="agent-avatar-container agent-icon-container">
                        <div class="agent-avatar agent-icon" id="agentAvatar">
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

                    <h2 class="agent-name">AI PC Protect Agent</h2>
                    <p class="agent-description">is calling you about your security needs</p>
                    <div class="call-captions">
                        <p id="captionText" class="caption-text" style="display: none;"></p>
                        <div id="responsePrompt" class="response-prompt" style="display: none;">
                            <p class="prompt-text">Say Yes or No</p>
                            <div class="manual-buttons" id="manualButtons" style="display: none;">
                                <button class="response-btn yes-btn" id="manualYesBtn">Yes</button>
                                <button class="response-btn no-btn" id="manualNoBtn">No</button>
                            </div>
                        </div>
                        <button id="installNowBtn" class="install-now-btn" style="display: none;">
                            Install Now
                        </button>
                    </div>
                </div>

                <!-- Chat View (for text input fallback) -->
                <div class="chatbot-chat-view" id="chatView" style="display: none;">
                    <div class="chat-messages" id="chatMessages"></div>
                    <div class="chat-input-container">
                        <button id="voiceBtn" class="voice-button" title="Click to start voice input (microphone required)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                                <line x1="12" y1="19" x2="12" y2="23"></line>
                                <line x1="8" y1="23" x2="16" y2="23"></line>
                            </svg>
                        </button>
                        <input type="text" id="chatInput" class="chat-input" placeholder="Type your message..." autocomplete="off">
                        <button id="sendBtn" class="send-button">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="22" y1="2" x2="11" y2="13"></line>
                                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Initial Accept/Decline Buttons -->
                <div class="chatbot-popup-actions" id="callActions">
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

                <!-- Call Controls (shown after accepting) -->
                <div class="call-controls" id="callControls" style="display: none;">
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
        const closeBtn = document.getElementById('closeChatbot');
        const hangupBtn = document.getElementById('hangupBtn');
        const declineBtn = document.getElementById('declineBtn');
        const acceptBtn = document.getElementById('acceptBtn');
        const muteBtn = document.getElementById('muteBtn');
        const speakerBtn = document.getElementById('speakerBtn');
        const manualYesBtn = document.getElementById('manualYesBtn');
        const manualNoBtn = document.getElementById('manualNoBtn');
        const installNowBtn = document.getElementById('installNowBtn');

        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.handleHangUpAttempt());
        }

        if (hangupBtn) {
            hangupBtn.addEventListener('click', () => this.handleHangUpAttempt());
        }

        if (declineBtn) {
            declineBtn.addEventListener('click', () => this.handleHangUpAttempt());
        }

        if (acceptBtn) {
            acceptBtn.addEventListener('click', () => {
                console.log('Accept button clicked');
                this.startCall();
            });
        }

        if (muteBtn) {
            muteBtn.addEventListener('click', () => this.toggleMute());
        }

        if (speakerBtn) {
            speakerBtn.addEventListener('click', () => this.toggleSpeaker());
        }

        if (manualYesBtn) {
            manualYesBtn.addEventListener('click', () => this.handleUserResponse('yes'));
        }

        if (manualNoBtn) {
            manualNoBtn.addEventListener('click', () => this.handleUserResponse('no'));
        }

        if (installNowBtn) {
            installNowBtn.addEventListener('click', () => {
                console.log('Install Now clicked');
                this.updateCaption('Installing AI PC Protect Pro...');
            });
        }

        // Chat input handlers - use event delegation since elements might not exist yet
        // We'll set these up when chat view is shown
        this.setupChatEventListeners();

        // Close on overlay click
        if (this.popup) {
            this.popup.addEventListener('click', (e) => {
                if (e.target === this.popup && !this.isHangingUp) {
                    this.handleHangUpAttempt();
                }
            });
        }

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.handleHangUpAttempt();
            }
        });
    }

    setupChatEventListeners() {
        // Chat input handlers
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('sendBtn');
        const voiceBtn = document.getElementById('voiceBtn');
        const muteVoiceBtn = document.getElementById('muteVoiceBtn');

        if (chatInput) {
            chatInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            console.log('Chat input event listener attached');
        } else {
            console.warn('Chat input not found when setting up listeners');
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => {
                this.sendMessage();
            });
            console.log('Send button event listener attached');
        } else {
            console.warn('Send button not found when setting up listeners');
        }

        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => {
                this.toggleVoiceInput();
            });
            console.log('Voice button event listener attached');
        } else {
            console.warn('Voice button not found when setting up listeners');
        }

        if (muteVoiceBtn) {
            muteVoiceBtn.addEventListener('click', () => {
                this.toggleMute();
            });
            console.log('Mute button event listener attached');
        } else {
            console.warn('Mute button not found when setting up listeners');
        }
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

        return { messages, waitForResponse: true };
    }

    getSalesPitch() {
        return [
            "I understand your hesitation. Let me explain why this is so critical right now.",
            "Every day, thousands of computers are compromised through these exact vulnerabilities. The average cost of a data breach for individuals can be devastating—not just financially, but in terms of lost personal information, compromised accounts, and the time it takes to recover.",
            "What makes AI PC Protect Pro different is that we don't just fix these issues once. We provide continuous, real-time protection that adapts to new threats as they emerge.",
            "Think of it this way: you wouldn't leave your front door unlocked, even if you're just going to the store for a few minutes. These vulnerabilities are like leaving multiple doors and windows open 24/7.",
            "For less than the cost of a cup of coffee per month, you get enterprise-grade protection that monitors your system around the clock, encrypts sensitive data, and prevents attacks before they can cause damage.",
            "Many of our users tell us they wish they had signed up sooner, before they experienced a security incident. Don't wait until it's too late.",
            "We're offering a special limited-time discount for new users. Plus, if you're not completely satisfied within the first 30 days, we offer a full refund—no questions asked.",
            "Your security is worth protecting. Would you like to secure your system now?"
        ];
    }

    getHangUpPitch() {
        return [
            "Wait, are you sure? Attackers may already be exploiting these vulnerabilities on your system right now.",
            "Every second you delay securing your computer increases your risk of a breach. These aren't theoretical threats—they're active, real dangers that criminals use every single day.",
            "I've seen systems compromised in minutes after vulnerabilities like these were discovered. Your personal information, financial data, and even your identity could be at stake.",
            "The good news is we can protect you immediately. AI PC Protect Pro will secure your system in just a few minutes, and you'll have peace of mind knowing you're protected.",
            "Don't let a moment of hesitation cost you everything. Your security is too important to ignore.",
            "Will you stay on the line and let me help you secure your system right now?"
        ];
    }

    startCall() {
        // Stop any active speech recognition
        this.stopListening();
        
        // Hide accept/decline buttons
        const callActions = document.getElementById('callActions');
        if (callActions) {
            callActions.style.display = 'none';
        }

        // Show call controls
        const callControls = document.getElementById('callControls');
        if (callControls) {
            callControls.style.display = 'flex';
        }

        // Hide initial agent name/description
        const agentName = document.querySelector('.agent-name');
        const agentDescription = document.querySelector('.agent-description');
        if (agentName) agentName.style.display = 'none';
        if (agentDescription) agentDescription.style.display = 'none';

        // Show caption text
        const captionText = document.getElementById('captionText');
        if (captionText) {
            captionText.style.display = 'block';
        }

        // Update header
        const headerTitle = document.getElementById('headerTitle');
        if (headerTitle) {
            headerTitle.textContent = 'AI PC Protect Agent';
        }

        // Reset state
        this.waitingForResponse = false;
        this.isHangingUp = false;
        this.hasShownSalesPitch = false;
        this.isListening = false;
        this.isSpeaking = false;
        this.currentSpeakingPromise = null;
        this.speechQueue = [];
        
        // Convert data to speech messages
        const result = this.convertDataToSpeech(this.contextData || {});
        const speechMessages = result.messages || result;
        this.waitingForResponse = (result && result.waitForResponse) || false;
        
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
        // Prevent multiple simultaneous queue processing
        if (this.isSpeaking) {
            return;
        }

        if (this.speechQueue.length === 0) {
            this.isSpeaking = false;
            this.stopWaveform();
            
            // Check if we're in hang up flow
            if (this.isHangingUp) {
                // After hang up pitch, wait for response
                this.waitingForResponse = true;
                this.showResponsePrompt();
                return;
            }
            
            // Check if we should wait for user response
            if (this.waitingForResponse) {
                this.showResponsePrompt();
                return;
            }
            
            this.updateCaption("Call ended.");
            return;
        }

        // Batch multiple messages together for faster, smoother playback
        const batch = [];
        const captions = [];
        const batchSize = Math.min(this.batchSize, this.speechQueue.length);
        
        for (let i = 0; i < batchSize; i++) {
            if (this.speechQueue.length > 0) {
                const msg = this.speechQueue.shift();
                batch.push(msg);
                captions.push(msg);
            }
        }
        
        if (batch.length > 0) {
            // Combine messages with natural pauses
            const combinedText = batch.join('. ');
            this.speakBatch(combinedText, captions);
        }
    }

    showResponsePrompt() {
        const responsePrompt = document.getElementById('responsePrompt');
        const promptText = responsePrompt?.querySelector('.prompt-text');
        
        if (responsePrompt) {
            responsePrompt.style.display = 'block';
        }
        
        // Update prompt text based on context
        if (promptText) {
            if (this.isHangingUp) {
                promptText.textContent = 'Say Yes to stay, or No to hang up';
            } else {
                promptText.textContent = 'Say Yes or No';
            }
        }
        
        // Only start speech recognition if we're not currently speaking
        // Wait a bit to ensure TTS has fully stopped
        setTimeout(() => {
            if (this.recognition && this.waitingForResponse && !this.isSpeaking) {
                try {
                    this.isListening = true;
                    this.recognition.start();
                } catch (e) {
                    console.warn('Could not start speech recognition:', e);
                    this.isListening = false;
                    this.showManualButtons();
                }
            } else if (!this.recognition) {
                // Fallback to manual buttons if no speech recognition
                this.showManualButtons();
            }
        }, 300); // Small delay to ensure TTS has stopped
    }

    showManualButtons() {
        const manualButtons = document.getElementById('manualButtons');
        const yesBtn = document.getElementById('manualYesBtn');
        const noBtn = document.getElementById('manualNoBtn');
        
        if (manualButtons) {
            manualButtons.style.display = 'flex';
        }
        
        // Update button text based on context
        if (this.isHangingUp) {
            if (yesBtn) yesBtn.textContent = 'Stay';
            if (noBtn) noBtn.textContent = 'Hang Up';
        } else {
            if (yesBtn) yesBtn.textContent = 'Yes';
            if (noBtn) noBtn.textContent = 'No';
        }
    }

    hideResponsePrompt() {
        const responsePrompt = document.getElementById('responsePrompt');
        if (responsePrompt) {
            responsePrompt.style.display = 'none';
        }
        this.waitingForResponse = false;
        this.stopListening();
    }

    handleUserResponse(transcript) {
        // Normalize input
        const response = typeof transcript === 'string' ? transcript.toLowerCase().trim() : transcript;
        
        this.hideResponsePrompt();
        
        // Check for yes/no variations
        const isYes = response.includes('yes') || response.includes('yeah') || 
                     response.includes('sure') || response.includes('okay') ||
                     response.includes('ok') || response.includes('yep') ||
                     response.includes('stay') || response.includes('continue');
        
        const isNo = response.includes('no') || response.includes('nope') || 
                    response.includes('not') || response.includes('nah') ||
                    response.includes('hang up') || response.includes('end call') ||
                    response.includes('disconnect');

        // If in hang up flow
        if (this.isHangingUp) {
            if (isYes) {
                // User wants to stay - cancel hang up and show install button
                this.isHangingUp = false;
                this.updateCaption("I'm glad you're staying. Let's get you protected right away.");
                setTimeout(() => {
                    this.showInstallButton();
                }, 2000);
            } else if (isNo) {
                // User confirms they want to hang up
                this.endCall();
            } else {
                // Unclear response
                this.updateCaption("I didn't catch that. Please say Yes to stay, or No to hang up.");
                setTimeout(() => {
                    this.showResponsePrompt();
                }, 2000);
            }
            return;
        }

        // Normal flow (not hanging up)
        if (isYes) {
            this.showInstallButton();
        } else if (isNo) {
            this.continueWithSalesPitch();
        } else {
            // Unclear response, ask again
            this.updateCaption("I didn't catch that. Please say Yes or No.");
            setTimeout(() => {
                this.showResponsePrompt();
            }, 2000);
        }
    }

    showInstallButton() {
        const installBtn = document.getElementById('installNowBtn');
        if (installBtn) {
            installBtn.style.display = 'block';
        }
        this.updateCaption("Great! Click the Install Now button below to get started.");
    }

    continueWithSalesPitch() {
        const salesPitch = this.getSalesPitch();
        // Mark that we'll wait for response after sales pitch
        this.waitingForResponse = true;
        this.hasShownSalesPitch = true;
        this.speakMessages(salesPitch);
    }

    handleHangUpAttempt() {
        // If already in hang up flow, actually end the call
        if (this.isHangingUp) {
            this.endCall();
            return;
        }

        // Completely stop any ongoing speech IMMEDIATELY
        if (this.ttsService) {
            this.ttsService.stop();
        }
        
        // Stop speech recognition
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Already stopped
            }
        }

        // Clear the speech queue to stop any pending messages
        this.speechQueue = [];
        
        // Reset speaking state completely - force immediate stop
        this.isSpeaking = false;
        this.currentSpeakingPromise = null;
        this.stopWaveform();
        
        // Force stop any pending audio immediately
        if (this.ttsService && this.ttsService.currentAudio) {
            const audio = this.ttsService.currentAudio;
            audio.pause();
            audio.currentTime = 0;
            audio.onended = null;
            audio.onerror = null;
            this.ttsService.currentAudio = null;
            this.ttsService.isPlaying = false;
        }
        
        // Reset flags
        this.isHangingUp = true;
        this.waitingForResponse = false;
        this.hideResponsePrompt();
        
        // Hide install button if visible
        const installBtn = document.getElementById('installNowBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }

        // Immediately start hang up pitch after stopping current speech
        // Use requestAnimationFrame to ensure stop() has been processed
        requestAnimationFrame(() => {
            // Play warning pitch immediately
            const hangUpPitch = this.getHangUpPitch();
            this.speakMessages(hangUpPitch);
        });
    }

    endCall() {
        // Stop any ongoing speech
        if (this.ttsService) {
            this.ttsService.stop();
        }
        
        // Stop speech recognition
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Already stopped
            }
        }
        
        this.isSpeaking = false;
        this.speechQueue = [];
        this.waitingForResponse = false;
        this.isHangingUp = false;
        this.hasShownSalesPitch = false;
        this.stopWaveform();
        this.hide();
    }

    updateCaption(text) {
        const captionElement = document.getElementById('captionText');
        if (!captionElement) return;

        // If there's existing text, animate it out first
        const existingLines = captionElement.querySelectorAll('.caption-line');
        if (existingLines.length > 0) {
            // Animate out existing lines
            existingLines.forEach((line, index) => {
                line.classList.add('rolling-out');
                line.style.animationDelay = `${index * 0.05}s`;
            });
            
            // After roll-out completes, roll in new text
            setTimeout(() => {
                this.rollInCaption(captionElement, text);
            }, 350);
        } else {
            // No existing text, just roll in
            this.rollInCaption(captionElement, text);
        }
    }

    rollInCaption(captionElement, text) {
        // Split text into lines if it's long (for multi-line subtitles)
        // Estimate ~12 words per line based on average word length
        const words = text.split(' ');
        const maxWordsPerLine = 12;
        const lines = [];
        
        for (let i = 0; i < words.length; i += maxWordsPerLine) {
            lines.push(words.slice(i, i + maxWordsPerLine).join(' '));
        }
        
        // Create caption content structure
        const captionContent = document.createElement('div');
        captionContent.className = 'caption-content';
        
        lines.forEach((line, index) => {
            const lineElement = document.createElement('span');
            lineElement.className = 'caption-line rolling-in';
            lineElement.textContent = line;
            // Stagger animation for multi-line (subtle delay)
            lineElement.style.animationDelay = `${index * 0.08}s`;
            captionContent.appendChild(lineElement);
        });
        
        // Clear and add new content
        captionElement.innerHTML = '';
        captionElement.appendChild(captionContent);
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

    toggleSpeaker() {
        // Toggle speaker icon state (visual only for now)
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.classList.toggle('active');
        }
    }

    async sendMessage() {
        const chatInput = document.getElementById('chatInput');
        if (!chatInput || !chatInput.value.trim()) {
            console.log('No message to send');
            return;
        }

        const userMessage = chatInput.value.trim();
        chatInput.value = '';

        console.log('Sending message:', userMessage);

        // Add user message to chat
        this.addMessageToChat(userMessage, 'user');

        // Show typing indicator
        const typingId = this.showTypingIndicator();

        try {
            // Send to ChatGPT
            console.log('Calling ChatGPT service...');
            const response = await this.chatGPTService.sendMessage(userMessage, this.contextData);
            console.log('Received response:', response);
            
            // Remove typing indicator
            this.removeTypingIndicator(typingId);
            
            // Add response to chat
            this.addMessageToChat(response, 'agent');
            
            // Speak the response
            console.log('Speaking response...');
            this.speak(response);
        } catch (error) {
            console.error('Error sending message:', error);
            // Remove typing indicator
            this.removeTypingIndicator(typingId);
            
            // Show error message
            this.addMessageToChat(
                `Sorry, I encountered an error: ${error.message}. Please check your API key in the .env file and make sure the server is running.`,
                'agent',
                true
            );
        }
    }

    addMessageToChat(message, sender, isError = false) {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message${isError ? ' error-message' : ''}`;

        if (sender === 'agent') {
            messageDiv.innerHTML = `
                <div class="message-avatar">
                    <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
                        <path d="M50 10 L20 25 L20 50 C20 70 50 85 50 85 C50 85 80 70 80 50 L80 25 Z" fill="url(#chatShieldGradient${Date.now()})" opacity="0.3"/>
                        <circle cx="40" cy="45" r="4" fill="white"/>
                        <circle cx="60" cy="45" r="4" fill="white"/>
                        <circle cx="50" cy="60" r="3" fill="white"/>
                        <defs>
                            <linearGradient id="chatShieldGradient${Date.now()}" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                                <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                            </linearGradient>
                        </defs>
                    </svg>
                </div>
                <div class="message-content">
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
        } else {
            messageDiv.innerHTML = `
                <div class="message-content">
                    <p>${this.escapeHtml(message)}</p>
                </div>
            `;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    showTypingIndicator() {
        const chatMessages = document.getElementById('chatMessages');
        if (!chatMessages) return null;

        const typingId = `typing-${Date.now()}`;
        const typingDiv = document.createElement('div');
        typingDiv.id = typingId;
        typingDiv.className = 'message agent-message typing-indicator';
        typingDiv.innerHTML = `
            <div class="message-avatar">
                <svg width="24" height="24" viewBox="0 0 100 100" fill="none">
                    <path d="M50 10 L20 25 L20 50 C20 70 50 85 50 85 C50 85 80 70 80 50 L80 25 Z" fill="url(#typingShieldGradient)" opacity="0.3"/>
                    <circle cx="40" cy="45" r="4" fill="white"/>
                    <circle cx="60" cy="45" r="4" fill="white"/>
                    <circle cx="50" cy="60" r="3" fill="white"/>
                    <defs>
                        <linearGradient id="typingShieldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#764ba2;stop-opacity:1" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
            <div class="message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        chatMessages.appendChild(typingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return typingId;
    }

    removeTypingIndicator(typingId) {
        if (!typingId) return;
        const typingElement = document.getElementById(typingId);
        if (typingElement) {
            typingElement.remove();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async speakBatch(text, captions) {
        // Guard against multiple simultaneous calls
        if (this.isSpeaking) {
            console.warn('Already speaking, ignoring new speak request');
            return;
        }

        if (!this.ttsService || this.isMuted || !text) {
            // Fallback: just show text if TTS not available
            this.updateCaption(captions[0] || text);
            setTimeout(() => this.processSpeechQueue(), 2000);
            return;
        }

        // Stop speech recognition to prevent it from hearing the TTS audio
        this.stopListening();

        // Stop any ongoing speech and clear previous promise
        // This prevents old promises from resolving and processing the queue again
        this.ttsService.stop();
        this.currentSpeakingPromise = null;

        // Set speaking flag BEFORE starting to prevent race conditions
        this.isSpeaking = true;
        this.startWaveform();
        // Store captions for this batch
        this.currentCaptions = captions;
        // Show all captions combined (since they're spoken together)
        const combinedCaption = captions.length > 1 ? captions.join(' ') : (captions[0] || text);
        this.updateCaption(combinedCaption);

        // Preload next batch while current is playing
        this.preloadNextBatch();

        // Create a promise tracker for this specific speak call
        const speakId = Date.now();
        this.currentSpeakingPromise = speakId;

        try {
            await this.ttsService.speak(text, {
                rate: 0.9,
                pitch: 1,
                volume: 1,
                lang: this.voiceLang
            });
            
            // Only process queue if this is still the current speaking promise
            // (prevents processing if we've already moved on to a new message)
            if (this.isSpeaking && this.currentSpeakingPromise === speakId) {
                this.isSpeaking = false;
                this.currentSpeakingPromise = null;
                this.stopWaveform();
                // Process immediately for smooth transitions
                this.processSpeechQueue();
            } else {
                // This promise is stale, ignore it
                console.log('Ignoring stale speak promise completion');
            }
        } catch (error) {
            console.error('Error speaking:', error);
            // Only process if this is still the current promise
            if (this.currentSpeakingPromise === speakId) {
                this.isSpeaking = false;
                this.currentSpeakingPromise = null;
                this.stopWaveform();
                // Minimal delay for error recovery
                setTimeout(() => this.processSpeechQueue(), 50);
            }
        }
    }

    async speak(text) {
        // Single message - use batch method for consistency
        await this.speakBatch(text, [text]);
    }

    preloadNextBatch() {
        // Preload the next batch of messages while current is playing
        if (this.speechQueue.length === 0 || !this.ttsService || this.ttsService.provider !== 'elevenlabs') {
            return;
        }

        const nextBatch = [];
        const batchSize = Math.min(this.batchSize, this.speechQueue.length);
        
        for (let i = 0; i < batchSize; i++) {
            if (this.speechQueue[i]) {
                nextBatch.push(this.speechQueue[i]);
            }
        }

        if (nextBatch.length > 0) {
            const combinedText = nextBatch.join('. ');
            // Preload in background (don't await)
            this.ttsService.preloadAudio(combinedText).catch(err => {
                console.log('Preload failed (non-critical):', err);
            });
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted && this.ttsService) {
            this.ttsService.stop();
            this.isSpeaking = false;
            this.stopWaveform();
        }

        const muteBtn = document.getElementById('muteBtn');
        
        if (muteBtn) {
            if (this.isMuted) {
                muteBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                        <line x1="23" y1="9" x2="17" y2="15"></line>
                        <line x1="17" y1="9" x2="23" y2="15"></line>
                    </svg>
                `;
                muteBtn.classList.add('muted');
            } else {
                muteBtn.innerHTML = `
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 5L6 9H2v6h4l5 4V5z"></path>
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                    </svg>
                `;
                muteBtn.classList.remove('muted');
            }
        }
    }

    toggleVoiceInput() {
        console.log('Voice button clicked, isListening:', this.isListening);
        if (this.isListening) {
            this.stopListening();
        } else {
            // Check if speech recognition is available
            if (!this.recognition) {
                console.warn('Speech recognition not available');
                this.showVoiceError('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari for voice input.');
                return;
            }
            console.log('Starting voice input...');
            this.startListening();
        }
    }

    async startListening() {
        console.log('startListening called');
        if (!this.recognition) {
            console.error('Speech recognition not initialized');
            this.showVoiceError('Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }

        // Check microphone permissions first
        try {
            console.log('Requesting microphone permission...');
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            console.log('Microphone permission granted');
            // Stop the stream immediately - we just needed permission
            stream.getTracks().forEach(track => track.stop());
        } catch (permissionError) {
            console.error('Microphone permission denied:', permissionError);
            this.showVoiceError('Microphone access is required for voice input. Please allow microphone access in your browser settings.');
            this.stopListening();
            return;
        }

        try {
            this.isListening = true;
            console.log('Starting speech recognition...');
            this.recognition.start();
            console.log('Speech recognition started');
            
            const voiceBtn = document.getElementById('voiceBtn');
            if (voiceBtn) {
                voiceBtn.classList.add('listening');
            }

            const voiceStatus = document.getElementById('voiceStatus');
            if (voiceStatus) {
                voiceStatus.textContent = 'Listening...';
            }
        } catch (e) {
            console.error('Failed to start speech recognition:', e);
            let errorMessage = 'Failed to start voice input. ';
            if (e.name === 'NotAllowedError' || e.message.includes('permission')) {
                errorMessage += 'Please allow microphone access.';
            } else if (e.name === 'NotFoundError') {
                errorMessage += 'No microphone found.';
            } else if (e.message && e.message.includes('already started')) {
                // Recognition already running, that's okay
                console.log('Speech recognition already started');
                return;
            } else {
                errorMessage += 'Please try again.';
            }
            this.showVoiceError(errorMessage);
            this.stopListening();
        }
    }

    stopListening() {
        this.isListening = false;
        
        if (this.recognition) {
            try {
                this.recognition.stop();
            } catch (e) {
                // Already stopped - that's fine
            }
        }

        const voiceBtn = document.getElementById('voiceBtn');
        if (voiceBtn) {
            voiceBtn.classList.remove('listening');
        }

        const voiceStatus = document.getElementById('voiceStatus');
        if (voiceStatus) {
            voiceStatus.textContent = this.isMuted ? 'Voice muted' : 'Voice enabled';
        }
    }

    handleVoiceInput(transcript) {
        // Stop listening
        this.stopListening();
        
        // Set the input value and send
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = transcript;
            // Show visual feedback that voice input was received
            const voiceStatus = document.getElementById('voiceStatus');
            if (voiceStatus) {
                voiceStatus.textContent = 'Voice input received';
                setTimeout(() => {
                    if (voiceStatus) {
                        voiceStatus.textContent = this.isMuted ? 'Voice muted' : 'Voice enabled';
                    }
                }, 2000);
            }
            this.sendMessage();
        }
    }

    showVoiceError(message) {
        const voiceStatus = document.getElementById('voiceStatus');
        if (voiceStatus) {
            voiceStatus.textContent = message;
            voiceStatus.style.color = '#ef4444';
            setTimeout(() => {
                if (voiceStatus) {
                    voiceStatus.textContent = this.isMuted ? 'Voice muted' : 'Voice enabled';
                    voiceStatus.style.color = '';
                }
            }, 5000);
        }
        
        // Also show in chat as a user-visible message
        this.addMessageToChat(`Voice input error: ${message}`, 'agent', true);
    }

    setContextData(data) {
        this.contextData = data;
    }

    // Utility method to list all available voices
    async listAvailableVoices() {
        // If using ElevenLabs, fetch those voices
        if (this.ttsProvider === 'elevenlabs' && this.ttsService) {
            try {
                const voices = await this.ttsService.getElevenLabsVoices();
                console.log(`\n🎤 Found ${voices.voices?.length || 0} ElevenLabs voices:\n`);
                
                if (voices.voices) {
                    voices.voices.forEach((voice, index) => {
                        console.log(`${index + 1}. ${voice.name} (ID: ${voice.voice_id})`);
                        console.log(`   Category: ${voice.category || 'N/A'} | Description: ${voice.description || 'N/A'}`);
                    });
                }
                
                console.log('\n💡 To use an ElevenLabs voice, update voiceOptions in script.js:');
                console.log('   const voiceOptions = { ttsProvider: "elevenlabs", elevenLabsVoiceId: "VOICE_ID_HERE" };');
                console.log('\n💡 Popular ElevenLabs voices:');
                console.log('   - Rachel (21m00Tcm4TlvDq8ikWAM) - Professional female');
                console.log('   - Domi (AZnzlk1XvdvUeBnXmlld) - Confident female');
                console.log('   - Bella (EXAVITQu4vr4xnSDxMaL) - Soft female');
                console.log('   - Antoni (ErXwobaYiN019PkySvjV) - Warm male');
                console.log('   - Elli (MF3mGyEYCl7XYWbV9V6O) - Friendly female');
                
                return voices.voices || [];
            } catch (error) {
                console.error('Error fetching ElevenLabs voices:', error);
                console.log('Falling back to browser voices...');
            }
        }
        
        // Fallback to browser voices
        if (!this.ttsService || !this.ttsService.synthesis) {
            console.warn('TTS service not available');
            return [];
        }

        const voices = this.ttsService.synthesis.getVoices();
        console.log(`\n🎤 Found ${voices.length} browser voices:\n`);
        
        const voiceList = voices.map((voice, index) => {
            const isLocal = voice.localService ? '✓ Local' : '✗ Remote';
            const isDefault = voice.default ? ' [DEFAULT]' : '';
            const isEnglish = voice.lang.startsWith('en') ? ' 🇺🇸' : '';
            
            console.log(`${index + 1}. ${voice.name}${isDefault}`);
            console.log(`   Language: ${voice.lang} | ${isLocal}${isEnglish}`);
            
            return {
                name: voice.name,
                lang: voice.lang,
                localService: voice.localService,
                default: voice.default,
                voice: voice
            };
        });

        console.log('\n💡 To use a specific voice, update voiceOptions in script.js:');
        console.log('   const voiceOptions = { voice: "Voice Name Here", voiceLang: "en-US" };');
        console.log('\n💡 To test voices, open voice-tester.html in your browser\n');

        return voiceList;
    }

    // Utility method to test a specific voice
    async testVoice(voiceName, testText = "Hello! I'm your AI PC Protect Agent. How can I help you with your security needs today?") {
        if (!this.ttsService) {
            console.error('TTS service not available');
            return;
        }

        // If using ElevenLabs, test with that
        if (this.ttsProvider === 'elevenlabs') {
            console.log(`Testing ElevenLabs voice: ${this.elevenLabsVoiceId}`);
            await this.speak(testText);
            return;
        }

        // Browser TTS fallback
        if (!this.ttsService.synthesis) {
            console.error('Browser TTS not available');
            return;
        }

        const voices = this.ttsService.synthesis.getVoices();
        const voice = voices.find(v => v.name === voiceName || v.name.toLowerCase().includes(voiceName.toLowerCase()));
        
        if (!voice) {
            console.error(`Voice "${voiceName}" not found. Use listAvailableVoices() to see all voices.`);
            return;
        }

        console.log(`Testing voice: ${voice.name} (${voice.lang})`);
        
        this.ttsService.synthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(testText);
        utterance.voice = voice;
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.volume = 1;
        
        utterance.onend = () => {
            console.log('Voice test completed');
        };

        this.ttsService.synthesis.speak(utterance);
    }
}

// Export for use in main script
window.ChatbotPopup = ChatbotPopup;

// Global utility functions for console use
window.listVoices = function() {
    if (window.chatbotPopupInstance) {
        return window.chatbotPopupInstance.listAvailableVoices();
    } else {
        console.log('Chatbot not initialized. Creating temporary instance...');
        const temp = new ChatbotPopup();
        temp.init();
        setTimeout(() => {
            temp.listAvailableVoices();
        }, 500);
    }
};

window.testVoice = function(voiceName, testText) {
    if (window.chatbotPopupInstance) {
        window.chatbotPopupInstance.testVoice(voiceName, testText);
    } else {
        console.log('Chatbot not initialized. Creating temporary instance...');
        const temp = new ChatbotPopup();
        temp.init();
        setTimeout(() => {
            temp.testVoice(voiceName, testText);
        }, 500);
    }
};
