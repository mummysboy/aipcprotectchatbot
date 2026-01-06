// Phone Call Component JavaScript

class PhoneCall {
    constructor(options = {}) {
        this.callContainer = null;
        this.isInitialized = false;
        this.ttsService = null;
        this.recognition = null;
        this.speechQueue = [];
        this.isSpeaking = false;
        this.waitingForResponse = false;
        this.isHangingUp = false;
        this.recognitionActive = false; // Track if recognition is actively listening
        this.speechQueueTimeout = null; // Track pending speech queue timeouts
        this.selectedVoice = options.voice || null; // Voice name or null for default
        this.voiceGender = options.voiceGender || null; // 'male' or 'female' to filter
        this.voiceLang = options.voiceLang || 'en-US'; // Language preference
        
        // TTS Provider options
        this.ttsProvider = options.ttsProvider || 'browser'; // 'elevenlabs' or 'browser'
        this.elevenLabsVoiceId = options.elevenLabsVoiceId || null;
    }

    init() {
        if (this.isInitialized) return;

        // Initialize TTS service
        this.initTTS();

        // Check for speech recognition support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true; // Enable continuous recognition for interruption
            this.recognition.interimResults = true; // Enable interim results to detect speech start
            this.recognition.lang = this.voiceLang;
            
            // Detect when user starts speaking (interim results)
            this.recognition.onresult = (event) => {
                // Check if we have interim results (user is speaking)
                let hasInterimResult = false;
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    if (result.isFinal) {
                        finalTranscript = result[0].transcript.toLowerCase().trim();
                    } else {
                        hasInterimResult = true;
                        // User is speaking - stop TTS immediately
                        if (this.isSpeaking) {
                            this.stopSpeaking();
                        }
                    }
                }
                
                // Only process final results when we're waiting for response
                if (finalTranscript && this.waitingForResponse && !hasInterimResult) {
                    this.handleUserResponse(finalTranscript);
                }
            };

            // Detect when user starts speaking (before results)
            this.recognition.onspeechstart = () => {
                // User started speaking - stop TTS immediately
                if (this.isSpeaking) {
                    this.stopSpeaking();
                }
            };

            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                // Don't stop on 'no-speech' errors during continuous recognition
                if (event.error === 'no-speech') {
                    return;
                }
                // If error, show manual buttons as fallback
                this.showManualButtons();
            };

            this.recognition.onend = () => {
                // Restart if still waiting for response and not speaking
                if (this.waitingForResponse && !this.isSpeaking && !this.isHangingUp) {
                    try {
                        this.recognitionActive = true;
                        this.recognition.start();
                    } catch (e) {
                        // Recognition already started or error
                        this.showManualButtons();
                    }
                } else {
                    this.recognitionActive = false;
                }
            };
        } else {
            console.warn('Speech recognition not supported in this browser');
        }

        this.createCallHTML();
        this.callContainer = document.getElementById('phoneCall');
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
        this.ttsService.setOnEnd(() => {
            this.isSpeaking = false;
            // Resume speech recognition after TTS stops
            this.resumeRecognitionIfNeeded();
        });
        
        this.ttsService.setOnError((error) => {
            console.error('TTS error:', error);
            this.isSpeaking = false;
            // Resume speech recognition after TTS stops
            this.resumeRecognitionIfNeeded();
        });
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
            closeBtn.addEventListener('click', () => this.handleHangUpAttempt());
        }

        if (hangupBtn) {
            hangupBtn.addEventListener('click', () => this.handleHangUpAttempt());
        }

        if (muteBtn) {
            muteBtn.addEventListener('click', () => this.toggleMute());
        }

        if (speakerBtn) {
            speakerBtn.addEventListener('click', () => this.toggleSpeaker());
        }

        // Manual response buttons (fallback)
        const manualYesBtn = document.getElementById('manualYesBtn');
        const manualNoBtn = document.getElementById('manualNoBtn');
        const installNowBtn = document.getElementById('installNowBtn');

        if (manualYesBtn) {
            manualYesBtn.addEventListener('click', () => this.handleUserResponse('yes'));
        }

        if (manualNoBtn) {
            manualNoBtn.addEventListener('click', () => this.handleUserResponse('no'));
        }

        if (installNowBtn) {
            installNowBtn.addEventListener('click', () => {
                // TODO: Handle install action
                console.log('Install Now clicked');
                this.updateCaption('Installing AI PC Protect Pro...');
            });
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

    startCall(data) {
        if (!this.isInitialized) {
            this.init();
            setTimeout(() => this.startCall(data), 100);
            return;
        }

        this.show();
        this.waitingForResponse = false;
        
        // Update agent name in header if provided
        const agentName = data.agentName || "AI PC Protect Agent";
        const statusSpan = this.callContainer?.querySelector('.call-status span');
        if (statusSpan) {
            statusSpan.textContent = agentName;
        }
        
        // Convert data to speech messages
        const result = this.convertDataToSpeech(data);
        const speechMessages = result.messages || result; // Handle both old and new format
        this.waitingForResponse = (result && result.waitForResponse) || false;
        
        // Start speaking after a brief connection delay
        setTimeout(() => {
            this.updateCaption("Connected. AI PC Protect Agent speaking...");
            this.speakMessages(speechMessages);
        }, 1000);
    }

    speakMessages(messages) {
        // Stop any ongoing speech before starting new messages
        this.stopSpeaking();
        this.speechQueue = [...messages];
        this.processSpeechQueue();
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
        
        // Start speech recognition (only if not already active and not speaking)
        if (this.recognition && !this.waitingForResponse && !this.isSpeaking) {
            this.waitingForResponse = true;
            this.startRecognition();
        } else if (!this.recognition) {
            // Fallback to manual buttons if no speech recognition
            this.showManualButtons();
        }
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
        this.stopRecognition();
    }
    
    startRecognition() {
        if (this.recognition && !this.recognitionActive && !this.isSpeaking) {
            try {
                this.recognitionActive = true;
                this.recognition.start();
            } catch (e) {
                console.warn('Could not start speech recognition:', e);
                this.recognitionActive = false;
                this.showManualButtons();
            }
        }
    }
    
    stopRecognition() {
        if (this.recognition && this.recognitionActive) {
            try {
                this.recognition.stop();
                this.recognitionActive = false;
            } catch (e) {
                // Already stopped
                this.recognitionActive = false;
            }
        }
    }
    
    pauseRecognition() {
        // Pause recognition while TTS is speaking to avoid picking up chatbot's voice
        if (this.recognition && this.recognitionActive) {
            try {
                this.recognition.stop();
                this.recognitionActive = false;
            } catch (e) {
                // Already stopped
            }
        }
    }
    
    resumeRecognitionIfNeeded() {
        // Resume recognition after TTS stops, if we're waiting for response
        if (this.waitingForResponse && !this.isSpeaking && !this.isHangingUp) {
            // Small delay to ensure TTS audio has fully stopped
            setTimeout(() => {
                if (!this.isSpeaking && this.waitingForResponse) {
                    this.startRecognition();
                }
            }, 300);
        }
    }
    
    stopSpeaking() {
        // Stop TTS immediately when user interrupts
        if (this.ttsService) {
            this.ttsService.stop();
        }
        this.isSpeaking = false;
        this.speechQueue = []; // Clear queue to prevent continuing
        this.stopWaveform();
        
        // Cancel any pending speech queue processing
        // This prevents multiple voices from starting
        if (this.speechQueueTimeout) {
            clearTimeout(this.speechQueueTimeout);
            this.speechQueueTimeout = null;
        }
    }

    handleUserResponse(transcript) {
        this.hideResponsePrompt();
        
        // Check for yes/no variations
        const isYes = transcript.includes('yes') || transcript.includes('yeah') || 
                     transcript.includes('sure') || transcript.includes('okay') ||
                     transcript.includes('ok') || transcript.includes('yep') ||
                     transcript.includes('stay') || transcript.includes('continue');
        
        const isNo = transcript.includes('no') || transcript.includes('nope') || 
                    transcript.includes('not') || transcript.includes('nah') ||
                    transcript.includes('hang up') || transcript.includes('end call') ||
                    transcript.includes('disconnect');

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
        this.speakMessages(salesPitch);
    }

    processSpeechQueue() {
        // Clear any pending timeout
        if (this.speechQueueTimeout) {
            clearTimeout(this.speechQueueTimeout);
            this.speechQueueTimeout = null;
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

        if (this.isSpeaking) return;

        const message = this.speechQueue.shift();
        this.speak(message);
    }

    async speak(text) {
        if (!this.ttsService) {
            // Fallback: just show text if TTS not available
            this.updateCaption(text);
            this.speechQueueTimeout = setTimeout(() => this.processSpeechQueue(), 2000);
            return;
        }

        // Stop any ongoing speech
        this.ttsService.stop();
        
        // Pause speech recognition while speaking to avoid picking up chatbot's voice
        this.pauseRecognition();

        this.isSpeaking = true;
        this.startWaveform();
        this.updateCaption(text);

        try {
            await this.ttsService.speak(text, {
                rate: 0.9,
                pitch: 1,
                volume: 1,
                lang: this.voiceLang
            });
            
            this.isSpeaking = false;
            this.stopWaveform();
            // Resume recognition if needed (handled by TTS onEnd callback)
            // Small delay before next message
            this.speechQueueTimeout = setTimeout(() => this.processSpeechQueue(), 500);
        } catch (error) {
            console.error('Error speaking:', error);
            this.isSpeaking = false;
            this.stopWaveform();
            // Resume recognition if needed
            this.resumeRecognitionIfNeeded();
            this.speechQueueTimeout = setTimeout(() => this.processSpeechQueue(), 500);
        }
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
        // Mute functionality - stop current speech
        if (this.ttsService && this.isSpeaking) {
            this.ttsService.stop();
            this.isSpeaking = false;
        }
    }

    toggleSpeaker() {
        // Toggle speaker icon state (visual only for now)
        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
            speakerBtn.classList.toggle('active');
        }
    }

    handleHangUpAttempt() {
        // If already in hang up flow, actually end the call immediately
        if (this.isHangingUp) {
            this.endCall();
            return;
        }

        // Completely stop all speech and clear everything before starting new pitch
        this.stopSpeaking();
        
        // Stop speech recognition
        this.stopRecognition();

        // Ensure speech queue is completely cleared
        this.speechQueue = [];
        this.isSpeaking = false;

        this.isHangingUp = true;
        this.waitingForResponse = false;
        this.hideResponsePrompt();
        
        // Hide install button if visible
        const installBtn = document.getElementById('installNowBtn');
        if (installBtn) {
            installBtn.style.display = 'none';
        }

        // Small delay to ensure all audio has stopped before starting new pitch
        setTimeout(() => {
            // Double-check we're still in hang up flow and not speaking
            if (this.isHangingUp && !this.isSpeaking) {
                // Play warning pitch
                const hangUpPitch = this.getHangUpPitch();
                this.speakMessages(hangUpPitch);
            }
        }, 100);
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

    endCall() {
        // Stop any ongoing speech
        this.stopSpeaking();
        
        // Stop speech recognition
        this.stopRecognition();
        
        this.isSpeaking = false;
        this.speechQueue = [];
        this.waitingForResponse = false;
        this.isHangingUp = false;
        this.recognitionActive = false;
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
