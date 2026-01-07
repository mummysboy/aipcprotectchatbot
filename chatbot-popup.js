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
        this.recognitionActive = false; // Track if recognition is actively listening
        this._startingRecognition = false; // Flag to prevent multiple simultaneous starts
        this.selectedVoice = options.voice || null;
        this.voiceGender = options.voiceGender || null;
        this.voiceLang = options.voiceLang || 'en-US';
        
        // TTS Provider options
        this.ttsProvider = options.ttsProvider || 'browser'; // 'elevenlabs' or 'browser'
        this.elevenLabsVoiceId = options.elevenLabsVoiceId || null;
        
        // Phone call flow state
        this.speechQueue = [];
        this.waitingForResponse = false;
        this.waitingForDownloadResponse = false; // Track if we're waiting for yes/no to download pitch
        this.isHangingUp = false;
        this.hasShownSalesPitch = false;
        this.currentSpeakingPromise = null; // Track current speaking promise
        this.pendingAudio = null; // Preloaded next audio
        this.batchSize = 3; // Number of messages to batch together
        this.currentCaptions = []; // Track current batch captions for display
        this.ttsStartTime = null; // Track when TTS started to filter out early false positives
        this._bargeInDetected = false; // Track if barge-in was just triggered (for extended recognition wait)
        
        // VAD (Voice Activity Detection) for barge-in during TTS
        // Note: SpeechRecognition cannot use getUserMedia AEC constraints, so we use a separate
        // mic monitor with AEC to detect user speech during TTS, then start SpeechRecognition
        // only after stopping TTS to prevent self-hearing/false triggers.
        this.micStream = null; // getUserMedia stream for VAD
        this.audioCtx = null; // Web Audio API context
        this.analyser = null; // AnalyserNode for audio analysis
        this.vadRAF = null; // requestAnimationFrame ID for VAD loop
        this.vadEnabled = true; // Enable/disable VAD
        this.vadThreshold = 0.02; // RMS threshold for speech detection (tune: 0.01-0.05)
        this.vadHoldMs = 160; // Duration above threshold to trigger (ms)
        this.vadCooldownMs = 700; // Cooldown after trigger before next detection (ms)
        this._vadAboveSince = null; // Timestamp when RMS first exceeded threshold
        this._vadLastTrigger = 0; // Timestamp of last barge-in trigger
        this._bargeInInterimTimeout = null; // Timeout for processing interim results during barge-in
        this._lastInterimTranscript = ''; // Store latest interim transcript for barge-in timeout
        this._recentTTSText = []; // Track recent TTS text to filter echo (last 3 messages)
        this._ttsStopTime = null; // Track when TTS stopped to ignore recognition for a short period
        this._lastProcessedTranscript = null; // Track last processed transcript to prevent duplicates
        this._lastProcessedTime = 0; // Timestamp of last processed transcript
    }

    init() {
        if (this.isInitialized) return;

        // Initialize ChatGPT service
        this.chatGPTService = new ChatGPTService();

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
            this.updateSpeakingState();
            this.stopWaveform();
            // Continue processing queue even on error
            setTimeout(() => this.processSpeechQueue(), 500);
        });
        
        // Preload common phrases for faster response time
        this.preloadCommonPhrases();
    }
    
    preloadCommonPhrases() {
        // Preload common phrases that are likely to be used
        // This reduces latency when these phrases need to be spoken
        if (!this.ttsService || this.ttsProvider !== 'elevenlabs') {
            return; // Only preload for ElevenLabs (browser TTS is instant)
        }
        
        const commonPhrases = [
            "Hi, this is",
            "I'm reaching out because",
            "Would you like me to take care of that for you now?",
            "Yes or No",
            "I understand your hesitation",
            "Great! Click the Install Now button",
            "I'm glad you're staying"
        ];
        
        // Preload in background (don't await)
        setTimeout(() => {
            commonPhrases.forEach(phrase => {
                this.ttsService.preloadAudio(phrase).catch(err => {
                    // Ignore preload errors - it's non-critical
                    console.log('Preload failed for phrase (non-critical):', phrase);
                });
            });
        }, 1000); // Wait a bit after initialization
    }

    initVoice() {
        // Initialize speech recognition (for voice input)

        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true; // Enable continuous recognition for interruption
            this.recognition.interimResults = true; // Enable interim results to detect speech start
            this.recognition.lang = this.voiceLang;
            
            // Detect when user speaks
            // Note: SpeechRecognition is OFF during TTS to prevent self-hearing.
            // VAD mic monitor handles barge-in detection, then starts SpeechRecognition immediately.
            this.recognition.onresult = (event) => {
                // Collect both final and interim transcripts
                // Use interim if final is empty (helps capture speech during barge-in)
                let finalTranscript = '';
                let interimTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const result = event.results[i];
                    const transcript = result[0].transcript.trim();
                    if (result.isFinal) {
                        finalTranscript = transcript;
                    } else {
                        // Keep track of latest interim result
                        interimTranscript = transcript;
                        // Store for barge-in timeout processing
                        this._lastInterimTranscript = transcript;
                    }
                }
                
                // Use final transcript if available, otherwise use interim (for barge-in cases)
                const transcriptToUse = finalTranscript || interimTranscript;
                
                // During barge-in, skip echo detection - user is actively speaking
                // Only do echo detection if NOT during barge-in
                if (!this._bargeInDetected) {
                    // Ignore recognition if TTS just stopped (likely echo) - wait 800ms after TTS stops
                    // This gives time for echo to die down
                    if (this._ttsStopTime && (Date.now() - this._ttsStopTime) < 800) {
                        console.log('Ignoring recognition result (too soon after TTS stop, likely echo):', transcriptToUse);
                        return;
                    }
                } else {
                    // During barge-in, use shorter echo delay (200ms instead of 800ms)
                    // This allows us to capture user speech faster
                    if (this._ttsStopTime && (Date.now() - this._ttsStopTime) < 200) {
                        console.log('Barge-in: Ignoring very early recognition (likely echo):', transcriptToUse);
                        return;
                    }
                    
                    // Check if transcript matches recent TTS text (echo detection)
                    if (transcriptToUse && this._recentTTSText.length > 0) {
                        const transcriptLower = transcriptToUse.toLowerCase().replace(/[^\w\s]/g, '');
                        for (const ttsText of this._recentTTSText) {
                            const ttsLower = ttsText.toLowerCase().replace(/[^\w\s]/g, '');
                            // Check if transcript is similar to TTS (likely echo)
                            // Compare first 60 chars or if significant overlap
                            const transcriptStart = transcriptLower.substring(0, 60);
                            const ttsStart = ttsLower.substring(0, 60);
                            // Check for significant overlap (at least 30 chars match)
                            if (transcriptStart.length > 30 && ttsStart.length > 30) {
                                // Check if first 30 chars match (very likely echo)
                                if (transcriptStart.substring(0, 30) === ttsStart.substring(0, 30)) {
                                    console.log('Ignoring recognition result (matches recent TTS start, likely echo):', transcriptToUse);
                                    return;
                                }
                                // Check if transcript contains a significant portion of TTS
                                const overlapLength = Math.min(40, Math.min(transcriptStart.length, ttsStart.length));
                                if (overlapLength > 30 && transcriptStart.substring(0, overlapLength) === ttsStart.substring(0, overlapLength)) {
                                    console.log('Ignoring recognition result (significant overlap with TTS, likely echo):', transcriptToUse);
                                    return;
                                }
                            }
                        }
                    }
                }
                
                // Log recognition results only when processing (reduce spam)
                // Only log if we're actually going to process it or if it's a final result
                if (transcriptToUse && (finalTranscript || this._bargeInDetected)) {
                    console.log('Recognition result (processing):', {
                        final: finalTranscript,
                        interim: interimTranscript,
                        used: transcriptToUse,
                        isSpeaking: this.isSpeaking,
                        bargeIn: this._bargeInDetected,
                        waitingForResponse: this.waitingForResponse
                    });
                }
                
                // Process results if:
                // 1. We have a transcript AND
                // 2. Either chatbot is not speaking, OR barge-in was just detected (allow processing during barge-in)
                if (transcriptToUse && (!this.isSpeaking || this._bargeInDetected)) {
                    // If we only have interim and not during barge-in, wait for final
                    if (!finalTranscript && interimTranscript && !this._bargeInDetected) {
                        // Don't process interim immediately - wait for final (unless barge-in)
                        return;
                    }
                    
                    // During barge-in, process final results immediately, or interim if no final yet
                    if (this._bargeInDetected) {
                        // During barge-in, prefer final but accept interim if that's all we have
                        if (finalTranscript) {
                            // We have final - process it immediately
                            console.log('✅ Processing final transcript during barge-in:', finalTranscript);
                            // Clear barge-in flag and process
                            const transcriptToProcess = finalTranscript;
                            this._bargeInDetected = false;
                            // Clear any pending timeout
                            if (this._bargeInInterimTimeout) {
                                clearTimeout(this._bargeInInterimTimeout);
                                this._bargeInInterimTimeout = null;
                            }
                            // Clear TTS stop time to allow future recognition
                            this._ttsStopTime = null;
                            if (this.waitingForResponse) {
                                console.log('Calling handleUserResponse with:', transcriptToProcess);
                                this.handleUserResponse(transcriptToProcess);
                            } else {
                                console.log('Calling handleVoiceInput with:', transcriptToProcess);
                                this.handleVoiceInput(transcriptToProcess);
                            }
                            return;
                        } else if (interimTranscript) {
                            // Only interim - wait a bit more for final (but not too long)
                            // Filter out very short fragments (likely TTS echo or noise)
                            const cleanInterim = interimTranscript.trim();
                            if (cleanInterim.length < 3) {
                                console.log('⏳ Interim transcript too short, waiting for more:', cleanInterim);
                                return;
                            }
                            
                            // Check if interim contains TTS echo
                            let isEcho = false;
                            if (this._recentTTSText.length > 0) {
                                const interimLower = cleanInterim.toLowerCase().replace(/[^\w\s]/g, '');
                                for (const ttsText of this._recentTTSText) {
                                    const ttsLower = ttsText.toLowerCase().replace(/[^\w\s]/g, '');
                                    // Check if interim starts with TTS text (echo)
                                    if (interimLower.startsWith(ttsLower.substring(0, Math.min(20, ttsLower.length)))) {
                                        console.log('⏳ Interim transcript appears to be TTS echo, waiting for user speech:', cleanInterim);
                                        isEcho = true;
                                        break;
                                    }
                                }
                            }
                            
                            if (isEcho) {
                                return;
                            }
                            
                            console.log('⏳ Waiting for final transcript during barge-in, interim:', cleanInterim);
                            // Set a timeout to process interim if final doesn't come
                            // Clear any existing timeout and set a new one with latest transcript
                            if (this._bargeInInterimTimeout) {
                                clearTimeout(this._bargeInInterimTimeout);
                            }
                            
                            this._bargeInInterimTimeout = setTimeout(() => {
                                // Use the stored latest interim transcript
                                const transcriptToProcess = this._lastInterimTranscript || cleanInterim;
                                // Only process if it's substantial (not a fragment) and barge-in still active
                                if (transcriptToProcess && transcriptToProcess.trim().length >= 3 && this._bargeInDetected) {
                                    // Final check for echo (less aggressive during barge-in)
                                    const finalCheck = transcriptToProcess.trim().toLowerCase();
                                    let isStillEcho = false;
                                    // Only check if transcript clearly matches TTS (not just partial)
                                    for (const ttsText of this._recentTTSText) {
                                        const ttsLower = ttsText.toLowerCase();
                                        // Check if transcript starts with significant portion of TTS (20+ chars)
                                        if (finalCheck.length >= 20 && ttsLower.length >= 20 && 
                                            finalCheck.startsWith(ttsLower.substring(0, 20))) {
                                            isStillEcho = true;
                                            break;
                                        }
                                    }
                                    
                                    if (!isStillEcho) {
                                        console.log('✅ Processing interim transcript after timeout:', transcriptToProcess);
                                        this._bargeInInterimTimeout = null;
                                        const processedTranscript = transcriptToProcess;
                                        this._bargeInDetected = false; // Clear flag
                                        this._ttsStopTime = null; // Clear TTS stop time
                                        if (this.waitingForResponse) {
                                            console.log('Calling handleUserResponse with interim:', processedTranscript);
                                            this.handleUserResponse(processedTranscript);
                                        } else {
                                            console.log('Calling handleVoiceInput with interim:', processedTranscript);
                                            this.handleVoiceInput(processedTranscript);
                                        }
                                    } else {
                                        console.log('⚠️ Interim transcript still appears to be echo, waiting more...');
                                        // Extend timeout to wait for more user speech
                                        this._bargeInInterimTimeout = setTimeout(() => {
                                            // Try one more time with latest interim
                                            const latestTranscript = this._lastInterimTranscript;
                                            if (latestTranscript && latestTranscript.trim().length >= 3 && this._bargeInDetected) {
                                                console.log('✅ Retry: Processing latest interim transcript:', latestTranscript);
                                                this._bargeInDetected = false;
                                                this._ttsStopTime = null;
                                                if (this.waitingForResponse) {
                                                    this.handleUserResponse(latestTranscript);
                                                } else {
                                                    this.handleVoiceInput(latestTranscript);
                                                }
                                            }
                                        }, 2000); // Wait 2 more seconds
                                    }
                                } else {
                                    console.log('⚠️ Timeout expired but no valid transcript or barge-in flag cleared');
                                }
                            }, 1200); // Wait 1.2 seconds for final, then process interim (reduced for faster response)
                            return;
                        } else {
                            // No transcript yet during barge-in - wait for it
                            console.log('⏳ Barge-in detected but no transcript yet, waiting...');
                            return;
                        }
                    }
                    
                    // Normal processing (not during barge-in)
                    // Process the transcript
                    if (this.waitingForResponse) {
                        this.handleUserResponse(transcriptToUse);
                    } else {
                        this.handleVoiceInput(transcriptToUse);
                    }
                }
            };

            // Note: We don't use onspeechstart for interruption anymore
            // It fires too early and can't reliably distinguish TTS echo from user speech
            // We rely on interim results in onresult instead, which gives us more context
            this.recognition.onspeechstart = () => {
                // Log for debugging but don't interrupt here
                if (this.isSpeaking) {
                    const timeSinceTtsStart = this.ttsStartTime ? Date.now() - this.ttsStartTime : Infinity;
                    console.log(`Speech start detected (${timeSinceTtsStart}ms since TTS start) - waiting for interim results to confirm`);
                }
            };

            this.recognition.onerror = (event) => {
                // Don't log 'no-speech' errors - they're expected during continuous recognition
                if (event.error === 'no-speech') {
                    return;
                }
                
                // Log other errors
                console.error('Speech recognition error:', event.error);
                
                let errorMessage = 'Voice input error. ';
                
                switch(event.error) {
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
                // Restart if still waiting for response and not speaking
                if (this.waitingForResponse && !this.isSpeaking && !this.isHangingUp) {
                    try {
                        this.startRecognition();
                    } catch (e) {
                        // Recognition already started or error
                        console.warn('Could not restart recognition:', e);
                        this.recognitionActive = false;
                        this.isListening = false;
                    }
                } else {
                    this.recognitionActive = false;
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
                            <img src="https://aipcsafe.com/images/logo-2.svg" alt="AI PC Protect Logo" class="agent-logo" />
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
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling to overlay handler
                this.handleHangUpAttempt();
            });
        }

        if (hangupBtn) {
            hangupBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                this.handleHangUpAttempt();
            });
        }

        if (declineBtn) {
            declineBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent event bubbling
                this.handleHangUpAttempt();
            });
        }

        if (acceptBtn) {
            acceptBtn.addEventListener('click', async () => {
                console.log('Accept button clicked');
                // Unlock audio immediately on user gesture to prevent autoplay blocking
                await this.unlockAudio();
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
        }
        // Note: Mute button not found in popup interface - it's added when call starts
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
        // Stop VAD mic monitor when popup is hidden
        this.stopMicMonitor();
        
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

    async unlockAudio() {
        try {
            // 1) Resume AudioContext (helps on iOS / Safari)
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) {
                this._unlockAudioCtx = this._unlockAudioCtx || new AC();
                if (this._unlockAudioCtx.state === "suspended") {
                    await this._unlockAudioCtx.resume();
                }
            }

            // 2) "Prime" an HTMLAudioElement play once
            this._unlockAudioEl = this._unlockAudioEl || new Audio();
            this._unlockAudioEl.muted = true;
            // tiny silent wav data-uri
            this._unlockAudioEl.src =
                "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";
            await this._unlockAudioEl.play();
            this._unlockAudioEl.pause();
            this._unlockAudioEl.currentTime = 0;
            this._unlockAudioEl.muted = false;

            console.log("✅ Audio unlocked");
        } catch (e) {
            console.warn("⚠️ Audio unlock failed:", e);
        }
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
        this.updateSpeakingState();
        this.currentSpeakingPromise = null;
        this.speechQueue = [];
        
        // Convert data to speech messages
        const result = this.convertDataToSpeech(this.contextData || {});
        const speechMessages = result.messages || result;
        this.waitingForResponse = (result && result.waitForResponse) || false;
        
        // Start recognition early so it's ready to detect interruptions
        // This will request microphone permission if needed
        if (!this.recognitionActive && !this.isMuted && this.recognition) {
            this.startRecognition();
        }
        
        // Update caption immediately
        this.updateCaption("Connected. AI PC Protect Agent speaking...");
        
        // Start speaking immediately (audio is already unlocked in click handler)
        // This ensures the user gesture chain is maintained
        this.speakMessages(speechMessages);
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
            this.updateSpeakingState();
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

        // OPTIMIZATION: Speak first message immediately for faster response time
        // Then batch remaining messages for smoother playback
        const firstMessage = this.speechQueue.shift();
        
        if (firstMessage) {
            // Track TTS text to filter echo (keep last 3)
            this._recentTTSText.push(firstMessage);
            if (this._recentTTSText.length > 3) {
                this._recentTTSText.shift();
            }
            
            // Speak first message immediately
            this.speakBatch(firstMessage, [firstMessage]);
            
            // Preload next message while first message is playing (for faster transitions)
            // This is called again in speakBatch, but calling here ensures it happens immediately
            if (this.speechQueue.length > 0) {
                this.preloadNextBatch();
            }
        }
    }

    showResponsePrompt() {
        // Don't show response prompt if install button is visible (user already said yes)
        const installBtn = document.getElementById('installNowBtn');
        if (installBtn && installBtn.style.display !== 'none' && installBtn.offsetParent !== null) {
            // Install button is visible, don't show response prompt
            return;
        }
        
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
                this.startRecognition();
                if (!this.recognitionActive) {
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
        
        console.log('handleUserResponse called with:', response);
        
        // Check for yes/no variations (including common alternatives)
        const isYes = response.includes('yes') || response.includes('yeah') || 
                     response.includes('sure') || response.includes('okay') ||
                     response.includes('ok') || response.includes('yep') ||
                     response.includes('stay') || response.includes('continue') ||
                     response.includes('yea') || response.includes('yup') ||
                     response.includes('alright') || response.includes('all right') ||
                     response.includes('correct') || response.includes('right') ||
                     response.includes('affirmative') || response.includes('absolutely');
        
        const isNo = response.includes('no') || response.includes('nope') || 
                    response.includes('not') || response.includes('nah') ||
                    response.includes('hang up') || response.includes('end call') ||
                    response.includes('disconnect') || response.includes('stop') ||
                    response.includes('cancel') || response.includes('decline');

        // If in hang up flow
        if (this.isHangingUp) {
            if (isYes) {
                // User wants to stay - cancel hang up and show install button
                this.isHangingUp = false;
                this.hideResponsePrompt();
                this.updateCaption("I'm glad you're staying. Let's get you protected right away.");
                setTimeout(() => {
                    this.showInstallButton();
                }, 2000);
            } else if (isNo) {
                // User confirms they want to hang up
                this.hideResponsePrompt();
                this.endCall();
            } else {
                // Unclear response - keep waiting
                this.updateCaption("I didn't catch that. Please say Yes to stay, or No to hang up.");
                // Don't hide response prompt, keep waiting
            }
            return;
        }

        // Normal flow (not hanging up)
        if (isYes) {
            this._bargeInDetected = false; // Clear flag on successful recognition
            this.hideResponsePrompt();
            this.showInstallButton();
            // Keep waitingForResponse = true to keep call open for install button click
            this.waitingForResponse = true;
        } else if (isNo) {
            this._bargeInDetected = false; // Clear flag on successful recognition
            this.hideResponsePrompt();
            this.continueWithSalesPitch();
        } else {
            // Not yes/no - treat as regular voice input and respond to what they said
            if (!response || response.length < 2) {
                // Empty or very short - might still be processing (especially after barge-in)
                console.log('Empty or very short transcript, waiting for recognition to complete...');
                // If barge-in was just detected, wait longer for recognition
                const waitTime = this._bargeInDetected ? 4000 : 2000;
                setTimeout(() => {
                    // If still waiting for response, show prompt again
                    if (this.waitingForResponse) {
                        this.showResponsePrompt();
                    }
                }, waitTime);
            } else {
                // Has content but doesn't match yes/no - treat as regular message/question
                console.log('Non-yes/no response, treating as question/input:', response);
                this._bargeInDetected = false; // Clear flag
                
                // Hide response prompt since we're processing a question
                this.hideResponsePrompt();
                
                // Switch to chat view to show the conversation
                const callView = document.getElementById('callView');
                const chatView = document.getElementById('chatView');
                if (callView && chatView) {
                    callView.style.display = 'none';
                    chatView.style.display = 'block';
                }
                
                // Process as regular voice input (send to ChatGPT)
                // This will handle the question and get a response
                this.handleVoiceInput(transcript); // Use original transcript, not normalized response
            }
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

        // Prevent duplicate calls - if already processing hang up, ignore
        if (this._processingHangUp) {
            return;
        }
        this._processingHangUp = true;

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
        
        // Stop VAD mic monitor
        this.stopMicMonitor();

        // Clear the speech queue to stop any pending messages
        this.speechQueue = [];
        
        // Reset speaking state completely - force immediate stop
        this.isSpeaking = false;
        this.updateSpeakingState();
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
            // Double-check that we haven't already started (extra safety for race conditions)
            if (this._hangUpPitchStarted) {
                this._processingHangUp = false;
                return;
            }
            this._hangUpPitchStarted = true;
            // Play warning pitch immediately
            const hangUpPitch = this.getHangUpPitch();
            this.speakMessages(hangUpPitch);
            // Clear the processing flag after scheduling the pitch
            // Note: Keep _hangUpPitchStarted = true to prevent duplicate calls
            this._processingHangUp = false;
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
        
        // Stop VAD mic monitor
        this.stopMicMonitor();
        
        this.isSpeaking = false;
        this.updateSpeakingState();
        this.speechQueue = [];
        this.waitingForResponse = false;
        this.isHangingUp = false;
        this.hasShownSalesPitch = false;
        this._processingHangUp = false; // Reset processing flag
        this._hangUpPitchStarted = false; // Reset hang up pitch flag
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

    updateSpeakingState() {
        const avatar = document.getElementById('agentAvatar');
        const agentIcon = document.querySelector('.agent-icon');
        
        if (this.isSpeaking) {
            if (avatar) {
                avatar.classList.add('speaking');
            }
            if (agentIcon) {
                agentIcon.classList.add('speaking');
            }
        } else {
            if (avatar) {
                avatar.classList.remove('speaking');
            }
            if (agentIcon) {
                agentIcon.classList.remove('speaking');
            }
        }
    }

    startWaveform() {
        const avatar = document.getElementById('agentAvatar');
        if (avatar) {
            avatar.classList.add('speaking');
        }
        // Also update the initial popup icon
        this.updateSpeakingState();
    }

    stopWaveform() {
        const avatar = document.getElementById('agentAvatar');
        if (avatar) {
            avatar.classList.remove('speaking');
        }
        // Also update the initial popup icon
        this.updateSpeakingState();
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

        // Check if user is responding to download pitch
        const lowerMessage = userMessage.toLowerCase().trim();
        const isYesResponse = /^(yes|yeah|yea|yep|sure|ok|okay|definitely|absolutely|please|y)$/i.test(lowerMessage) ||
                              lowerMessage.includes('yes') || lowerMessage.includes('sure') || lowerMessage.includes('walk me through');
        const isNoResponse = /^(no|nope|nah|not now|later|maybe later|n)$/i.test(lowerMessage) ||
                             (lowerMessage.includes('no') && !lowerMessage.includes('know'));

        // Handle yes response - show download button immediately
        if (isYesResponse && this.waitingForDownloadResponse) {
            this.waitingForDownloadResponse = false;
            // Ensure chat view is visible
            const callView = document.getElementById('callView');
            const chatView = document.getElementById('chatView');
            if (callView && chatView) {
                callView.style.display = 'none';
                chatView.style.display = 'block';
            }
            const downloadMsg = "Great! Begin by pressing the Download button below to get protected.";
            this.addMessageToChat(downloadMsg, 'agent');
            this.showInstallButton();
            this.speak(downloadMsg).catch(err => console.error('TTS error:', err));
            return;
        }

        // Handle no response - give counter-pitch
        if (isNoResponse && this.waitingForDownloadResponse) {
            this.waitingForDownloadResponse = false;
            // Ensure chat view is visible
            const callView = document.getElementById('callView');
            const chatView = document.getElementById('chatView');
            if (callView && chatView) {
                callView.style.display = 'none';
                chatView.style.display = 'block';
            }
            const counterPitch = "I understand, but your PC is vulnerable to hackers, malware, and identity theft right now. AI PC Protect provides 24/7 real-time protection. Are you sure you don't want me to walk you through the quick download?";
            this.addMessageToChat(counterPitch, 'agent');
            this.waitingForDownloadResponse = true; // Keep waiting for their response
            this.speak(counterPitch).catch(err => console.error('TTS error:', err));
            return;
        }

        // Show typing indicator
        const typingId = this.showTypingIndicator();

        // Show automatic response immediately to reduce perceived lag
        const automaticResponses = [
            "One moment...",
            "I'm glad you asked!",
            "Just a second...",
            "Let me think...",
            "Great question!",
            "On it!",
            "I'm on it!",
            "Good point!",
            "Got it!",
            "Sure thing!"
        ];
        const randomResponse = automaticResponses[Math.floor(Math.random() * automaticResponses.length)];
        let automaticResponseElement = null;
        
        // Small delay to show typing indicator, then show automatic response
        setTimeout(() => {
            this.removeTypingIndicator(typingId);
            automaticResponseElement = this.addMessageToChat(randomResponse, 'agent');
        }, 300);

        try {
            // Ensure ChatGPT service is initialized
            if (!this.chatGPTService) {
                this.chatGPTService = new ChatGPTService();
            }
            
            // Track streaming response
            let fullResponse = '';
            let messageElement = null;
            let firstSentenceComplete = false;
            let firstSentenceText = '';
            let sentenceBuffer = '';
            let firstSentencePromise = null; // Track the first sentence speaking promise
            
            // Helper to detect sentence boundaries
            const isSentenceEnd = (text) => {
                return /[.!?]\s*$/.test(text.trim());
            };
            
            // Send to ChatGPT with streaming
            console.log('Calling ChatGPT service with streaming...');
            const response = await this.chatGPTService.sendMessage(
                userMessage, 
                this.contextData,
                // onChunk callback - called as text streams in
                (chunk, fullText) => {
                    fullResponse = fullText;
                    
                    // Update chat message in real-time
                    if (!messageElement) {
                        // Remove automatic response when real response starts
                        if (automaticResponseElement) {
                            automaticResponseElement.remove();
                            automaticResponseElement = null;
                        }
                        messageElement = this.addMessageToChat('', 'agent');
                    }
                    
                    // Update message content
                    const contentDiv = messageElement?.querySelector('.message-content p');
                    if (contentDiv) {
                        contentDiv.textContent = fullText;
                    }
                    
                    // Check if we have a complete first sentence
                    if (!firstSentenceComplete) {
                        sentenceBuffer += chunk;
                        
                        // Look for sentence ending
                        if (isSentenceEnd(sentenceBuffer)) {
                            firstSentenceComplete = true;
                            firstSentenceText = sentenceBuffer.trim();
                            
                            // Start TTS immediately with first sentence
                            console.log('First sentence complete, starting TTS:', firstSentenceText);
                            this.waitingForResponse = true;
                            
                            // Start speaking first sentence and track the promise
                            firstSentencePromise = this.speak(firstSentenceText).catch(err => {
                                // TTS stop errors are expected during interruption - don't log as error
                                if (err.message && !err.message.includes('TTS stopped')) {
                                    console.error('Error speaking first sentence:', err);
                                }
                            });
                        }
                    }
                }
            );
            
            console.log('Received full response:', response);
            console.log('Response length:', response?.length || 0);
            
            // Check if response is empty
            if (!response || response.trim().length === 0) {
                console.error('Empty response from ChatGPT - this might be a streaming issue');
                // Remove automatic response if it exists
                if (automaticResponseElement) {
                    automaticResponseElement.remove();
                    automaticResponseElement = null;
                }
                this.removeTypingIndicator(typingId);
                this.addMessageToChat(
                    'Sorry, I received an empty response. Please try asking your question again.',
                    'agent',
                    true
                );
                return;
            }
            
            // If we didn't get a first sentence yet, speak the full response
            if (!firstSentenceComplete && response) {
                // Remove automatic response if it exists
                if (automaticResponseElement) {
                    automaticResponseElement.remove();
                    automaticResponseElement = null;
                }
                this.removeTypingIndicator(typingId);
                if (!messageElement) {
                    messageElement = this.addMessageToChat(response, 'agent');
                } else {
                    // Update final message
                    const contentDiv = messageElement?.querySelector('.message-content p');
                    if (contentDiv) {
                        contentDiv.textContent = response;
                    }
                }
                
                // Speak the full response
                console.log('Speaking full response...');
                this.waitingForResponse = true;
                await this.speak(response);
            } else if (firstSentenceComplete && response) {
                // We already started speaking first sentence, now handle the rest
                // Remove automatic response if it exists
                if (automaticResponseElement) {
                    automaticResponseElement.remove();
                    automaticResponseElement = null;
                }
                this.removeTypingIndicator(typingId);
                
                // Check if there's more text after the first sentence
                if (response.length > firstSentenceText.length) {
                    const remainingText = response.substring(firstSentenceText.length).trim();
                    if (remainingText) {
                        // Wait for first sentence to finish before speaking the rest
                        console.log('Waiting for first sentence to finish, then speaking remaining text:', remainingText);
                        try {
                            // Wait for the first sentence to complete
                            if (firstSentencePromise) {
                                await firstSentencePromise;
                            }
                            // Small delay to ensure smooth transition
                            await new Promise(resolve => setTimeout(resolve, 200));
                            
                            // Now speak the remaining text
                            console.log('Speaking remaining text after first sentence completed');
                            await this.speak(remainingText);
                        } catch (err) {
                            // TTS stop errors are expected during interruption - don't log as error
                            if (err.message && !err.message.includes('TTS stopped')) {
                                console.error('Error speaking remaining text:', err);
                            }
                        }
                    } else {
                        // No remaining text, just wait for first sentence to finish
                        if (firstSentencePromise) {
                            try {
                                await firstSentencePromise;
                            } catch (err) {
                                // Ignore errors
                            }
                        }
                    }
                } else {
                    // Response is same as first sentence, just wait for it to finish
                    if (firstSentencePromise) {
                        try {
                            await firstSentencePromise;
                        } catch (err) {
                            // Ignore errors
                        }
                    }
                }
            }
            
            // After speaking, show response prompt to continue conversation
            this.showResponsePrompt();
            
            // Set flag to wait for yes/no response to download pitch
            this.waitingForDownloadResponse = true;
        } catch (error) {
            console.error('Error sending message:', error);
            // Remove automatic response if it exists
            if (automaticResponseElement) {
                automaticResponseElement.remove();
                automaticResponseElement = null;
            }
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
        return messageDiv;
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

        // Track when TTS starts for VAD filtering (ignore first 250ms)
        this.ttsStartTime = Date.now();
        // Clear TTS stop time when starting new TTS
        this._ttsStopTime = null;
        
        // Pause SpeechRecognition during TTS to prevent self-hearing/false triggers
        // SpeechRecognition cannot use getUserMedia AEC constraints, so we use a separate
        // VAD mic monitor with AEC instead to detect user speech during TTS
        this.pauseRecognition();
        
        // Start VAD mic monitor for barge-in detection (non-fatal if it fails)
        this.startMicMonitor().catch(err => {
            console.warn('Failed to start mic monitor (non-fatal):', err);
        });

        // Stop any ongoing speech and clear previous promise
        // This prevents old promises from resolving and processing the queue again
        this.ttsService.stop();
        this.currentSpeakingPromise = null;

        // Set speaking flag BEFORE starting to prevent race conditions
        this.isSpeaking = true;
        this.updateSpeakingState();
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
                this.updateSpeakingState();
                this.currentSpeakingPromise = null;
                this.stopWaveform();
                // Stop VAD mic monitor (no longer needed)
                this.stopMicMonitor();
                // Restore TTS volume in case it was ducked
                this.restoreTTSVolume();
                // Resume recognition after TTS stops (only if needed)
                this.resumeRecognitionIfNeeded();
                // Process immediately for smooth transitions
                this.processSpeechQueue();
            } else {
                // This promise is stale, ignore it
                console.log('Ignoring stale speak promise completion');
            }
        } catch (error) {
            // Handle errors gracefully - TTS stop errors are expected during interruption
            if (error.message && error.message.includes('TTS stopped')) {
                // This is expected when user interrupts - don't log as error
                console.log('TTS stopped (interruption expected)');
            } else {
                console.error('Error speaking:', error);
            }
            
            // Only process if this is still the current promise
            if (this.currentSpeakingPromise === speakId) {
                this.isSpeaking = false;
                this.updateSpeakingState();
                this.currentSpeakingPromise = null;
                this.stopWaveform();
                // Stop VAD mic monitor
                this.stopMicMonitor();
                // Restore TTS volume
                this.restoreTTSVolume();
                // Resume recognition after TTS stops
                this.resumeRecognitionIfNeeded();
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
        // Preload the next message(s) while current is playing for faster transitions
        if (this.speechQueue.length === 0 || !this.ttsService || this.ttsService.provider !== 'elevenlabs') {
            return;
        }

        // Preload the next message immediately (optimized for immediate-first-message approach)
        const nextMessage = this.speechQueue[0];
        if (nextMessage) {
            // Preload in background (don't await)
            this.ttsService.preloadAudio(nextMessage).catch(err => {
                console.log('Preload failed (non-critical):', err);
            });
        }
        
        // Also preload a few more if available for smoother playback
        if (this.speechQueue.length > 1) {
            const nextFew = this.speechQueue.slice(1, Math.min(3, this.speechQueue.length));
            if (nextFew.length > 0) {
                const combinedText = nextFew.join('. ');
                this.ttsService.preloadAudio(combinedText).catch(err => {
                    console.log('Preload failed (non-critical):', err);
                });
            }
        }
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        
        if (this.isMuted && this.ttsService) {
            this.ttsService.stop();
            this.isSpeaking = false;
            this.updateSpeakingState();
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

        // Check microphone permissions first with Acoustic Echo Cancellation (AEC)
        try {
            console.log('Requesting microphone permission with AEC...');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,      // Remove speaker output from mic input
                    noiseSuppression: true,      // Reduce background noise
                    autoGainControl: true,       // Normalize audio levels
                    sampleRate: 44100            // High quality for better recognition
                }
            });
            console.log('Microphone permission granted with AEC enabled');
            // Stop the stream immediately - we just needed permission
            stream.getTracks().forEach(track => track.stop());
        } catch (permissionError) {
            console.error('Microphone permission denied:', permissionError);
            this.showVoiceError('Microphone access is required for voice input. Please allow microphone access in your browser settings.');
            this.stopListening();
            return;
        }

        try {
            console.log('Starting speech recognition...');
            this.startRecognition();
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
        this.recognitionActive = false;
        
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
    
    pauseRecognition() {
        // Pause recognition (used when explicitly needed)
        if (this.recognition && this.recognitionActive) {
            try {
                this.recognition.stop();
                this.recognitionActive = false;
                this.isListening = false;
            } catch (e) {
                // Already stopped
                this.recognitionActive = false;
                this.isListening = false;
            }
        }
    }
    
    resumeRecognitionIfNeeded() {
        // Resume recognition after TTS stops (only if needed, e.g., waitingForResponse)
        // Note: Recognition is paused during TTS to prevent self-hearing; VAD handles barge-in
        if (!this.isSpeaking && !this.isHangingUp && !this.isMuted && this.recognition) {
            // Small delay to ensure TTS audio has fully stopped
            setTimeout(() => {
                if (!this.isSpeaking && !this.recognitionActive && !this._startingRecognition) {
                    this.startRecognition();
                }
            }, 300);
        }
    }
    
    async startRecognition() {
        // Prevent multiple simultaneous calls
        if (this._startingRecognition) {
            console.log('Recognition start already in progress, skipping...');
            return;
        }
        
        // Don't start if already active
        if (this.recognitionActive) {
            console.log('Recognition already active, skipping start');
            return;
        }
        
        if (this.recognition && !this.recognitionActive && !this.isMuted) {
            this._startingRecognition = true;
            
            try {
                // Request microphone permission with Acoustic Echo Cancellation (AEC)
                // Only request if we don't already have permission (to avoid multiple prompts)
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        audio: {
                            echoCancellation: true,      // Remove speaker output from mic input
                            noiseSuppression: true,      // Reduce background noise
                            autoGainControl: true,       // Normalize audio levels
                            sampleRate: 44100            // High quality for better recognition
                        }
                    });
                    // Stop the stream immediately - we just needed permission
                    stream.getTracks().forEach(track => track.stop());
                    console.log('Microphone permission granted with AEC enabled');
                } catch (permissionError) {
                    // If permission was already granted, this might fail, but that's okay
                    if (permissionError.name === 'NotAllowedError') {
                        console.warn('Microphone permission not granted:', permissionError);
                        const voiceStatus = document.getElementById('voiceStatus');
                        if (voiceStatus) {
                            voiceStatus.textContent = 'Microphone access needed for interruption';
                        }
                        this._startingRecognition = false;
                        return;
                    }
                    // Other errors might be okay (e.g., already have permission)
                    console.log('Microphone check:', permissionError.name);
                }
                
                // Double-check we're still not active (race condition protection)
                if (this.recognitionActive) {
                    console.log('Recognition became active during permission check, skipping start');
                    this._startingRecognition = false;
                    return;
                }
                
                this.recognitionActive = true;
                this.isListening = true;
                this.recognition.start();
                console.log('Speech recognition started for interruption detection');
            } catch (e) {
                console.warn('Could not start speech recognition:', e);
                this.recognitionActive = false;
                this.isListening = false;
            } finally {
                this._startingRecognition = false;
            }
        }
    }
    
    stopSpeaking() {
        // Stop TTS immediately when user interrupts
        if (this.ttsService) {
            try {
                this.ttsService.stop();
            } catch (error) {
                // TTS stop may reject promises, which is expected during interruption
                // Silently handle - the stop() method handles cleanup internally
                console.log('TTS stop called (interruption expected)');
            }
        }
        this.isSpeaking = false;
        this.updateSpeakingState();
        this.speechQueue = []; // Clear queue to prevent continuing
        this.currentSpeakingPromise = null;
        this.stopWaveform();
        // Stop VAD mic monitor (no longer needed)
        this.stopMicMonitor();
        // Restore TTS volume in case it was ducked
        this.restoreTTSVolume();
        // Mark when TTS stopped to ignore echo for a short period
        this._ttsStopTime = Date.now();
    }
    
    // VAD (Voice Activity Detection) helper methods for barge-in
    
    async startMicMonitor() {
        // Start microphone monitoring with AEC for barge-in detection during TTS
        if (!this.vadEnabled || this.micStream) {
            return; // Already running or disabled
        }
        
        try {
            // Request microphone with AEC enabled
            this.micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Create Web Audio API context and analyser
            this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioCtx.createMediaStreamSource(this.micStream);
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;
            source.connect(this.analyser);
            
            // Start VAD loop
            this._vadLoop();
            console.log('VAD mic monitor started');
        } catch (error) {
            console.warn('Failed to start mic monitor (non-fatal):', error);
            // Non-fatal - barge-in just won't work
            this.stopMicMonitor();
        }
    }
    
    stopMicMonitor() {
        // Stop microphone monitoring
        if (this.vadRAF !== null) {
            cancelAnimationFrame(this.vadRAF);
            this.vadRAF = null;
        }
        
        if (this.micStream) {
            this.micStream.getTracks().forEach(track => track.stop());
            this.micStream = null;
        }
        
        if (this.audioCtx) {
            this.audioCtx.close().catch(() => {});
            this.audioCtx = null;
        }
        
        this.analyser = null;
        this._vadAboveSince = null;
    }
    
    _vadLoop() {
        // VAD detection loop using requestAnimationFrame
        if (!this.analyser || !this.isSpeaking) {
            // Only run when speaking and analyser exists
            if (this.isSpeaking) {
                // Still speaking but analyser lost, restart
                this.stopMicMonitor();
                this.startMicMonitor().catch(() => {});
            }
            return;
        }
        
        // Get time-domain samples
        const bufferLength = this.analyser.fftSize;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteTimeDomainData(dataArray);
        
        // Compute RMS (Root Mean Square) for energy detection
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            const normalized = (dataArray[i] - 128) / 128; // Normalize to -1..1
            sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / bufferLength);
        
        // Ignore first 250ms of TTS to avoid false positives
        const timeSinceTtsStart = this.ttsStartTime ? Date.now() - this.ttsStartTime : Infinity;
        if (timeSinceTtsStart < 250) {
            this._vadAboveSince = null;
            this.vadRAF = requestAnimationFrame(() => this._vadLoop());
            return;
        }
        
        // Check cooldown period
        const timeSinceLastTrigger = Date.now() - this._vadLastTrigger;
        if (timeSinceLastTrigger < this.vadCooldownMs) {
            this._vadAboveSince = null;
            this.vadRAF = requestAnimationFrame(() => this._vadLoop());
            return;
        }
        
        // Check if RMS exceeds threshold
        if (rms > this.vadThreshold) {
            if (this._vadAboveSince === null) {
                this._vadAboveSince = Date.now();
            }
            
            // Check if we've been above threshold for hold duration
            const durationAbove = Date.now() - this._vadAboveSince;
            if (durationAbove >= this.vadHoldMs) {
                // Trigger barge-in
                console.log('VAD detected user speech - triggering barge-in');
                this._vadLastTrigger = Date.now();
                this._vadAboveSince = null;
                this._bargeInDetected = true; // Flag that barge-in just happened
                
                // Duck TTS volume immediately
                this.duckTTS(0.15);
                
                // Stop TTS immediately to reduce echo interference
                if (this.isSpeaking) {
                    try {
                        this.stopSpeaking();
                    } catch (error) {
                        console.log('TTS stopped during barge-in (expected)');
                    }
                }
                
                // Start recognition IMMEDIATELY (fast start - skip permission check if possible)
                // This ensures we capture the speech that triggered the barge-in
                if (!this.isMuted && this.recognition) {
                    // Try to start recognition immediately without waiting for permission check
                    // if we're already active or starting, that's fine - it will capture
                    if (!this.recognitionActive && !this._startingRecognition) {
                        // Fast start - try direct start first (if permission already granted)
                        try {
                            this.recognitionActive = true;
                            this.isListening = true;
                            this.recognition.start();
                            console.log('Recognition started immediately for barge-in');
                        } catch (e) {
                            // If direct start fails, fall back to full startRecognition
                            console.log('Direct start failed, using full startRecognition:', e);
                            this.recognitionActive = false;
                            this.isListening = false;
                            this.startRecognition().catch(err => {
                                console.warn('Failed to start recognition after barge-in:', err);
                            });
                        }
                    } else {
                        console.log('Recognition already active or starting, should capture speech');
                    }
                }
                
                // Clear barge-in flag after a delay to allow recognition to process
                // Also clear TTS stop time after echo period to allow legitimate input
                setTimeout(() => {
                    // Only clear if still set (might have been cleared by successful recognition)
                    if (this._bargeInDetected) {
                        console.log('Barge-in flag cleared after timeout (no recognition received)');
                        this._bargeInDetected = false;
                        // If no response was received, resume listening for user input
                        if (this.waitingForResponse && !this.isSpeaking) {
                            console.log('No recognition received during barge-in, resuming listening');
                            this.resumeRecognitionIfNeeded();
                        }
                    }
                    // Clear TTS stop time after echo period (300ms for barge-in, less aggressive)
                    if (this._ttsStopTime && (Date.now() - this._ttsStopTime) > 300) {
                        this._ttsStopTime = null;
                    }
                    // Clear any pending interim timeout
                    if (this._bargeInInterimTimeout) {
                        clearTimeout(this._bargeInInterimTimeout);
                        this._bargeInInterimTimeout = null;
                    }
                }, 10000); // Give recognition 10 seconds to capture speech (increased)
            }
        } else {
            // Reset threshold tracking if below threshold
            this._vadAboveSince = null;
        }
        
        // Continue loop
        this.vadRAF = requestAnimationFrame(() => this._vadLoop());
    }
    
    duckTTS(volume) {
        // Duck TTS volume (0.0 to 1.0)
        if (this.ttsService?.currentAudio) {
            this.ttsService.currentAudio.volume = Math.max(0, Math.min(1, volume));
        }
    }
    
    restoreTTSVolume() {
        // Restore TTS volume to full
        if (this.ttsService?.currentAudio) {
            this.ttsService.currentAudio.volume = 1;
        }
    }

    handleVoiceInput(transcript) {
        console.log('handleVoiceInput called with transcript:', transcript);
        
        // Normalize and clean transcript
        let cleanTranscript = transcript.trim();
        if (!cleanTranscript || cleanTranscript.length < 2) {
            console.log('Transcript too short, ignoring');
            return;
        }
        
        // Filter out TTS echo from transcript
        // Remove any parts that match recent TTS text
        if (this._recentTTSText.length > 0) {
            const transcriptLower = cleanTranscript.toLowerCase();
            for (const ttsText of this._recentTTSText) {
                const ttsLower = ttsText.toLowerCase();
                // If transcript starts with TTS text, remove that part
                if (transcriptLower.startsWith(ttsLower.substring(0, Math.min(30, ttsLower.length)))) {
                    // Find where TTS text ends in transcript
                    const ttsWords = ttsLower.split(/\s+/);
                    const transcriptWords = cleanTranscript.split(/\s+/);
                    let ttsWordIndex = 0;
                    let transcriptWordIndex = 0;
                    
                    // Skip matching words at the start
                    while (ttsWordIndex < ttsWords.length && 
                           transcriptWordIndex < transcriptWords.length &&
                           transcriptWords[transcriptWordIndex].toLowerCase().includes(ttsWords[ttsWordIndex])) {
                        transcriptWordIndex++;
                        ttsWordIndex++;
                    }
                    
                    // Get remaining words (user's actual speech)
                    if (transcriptWordIndex < transcriptWords.length) {
                        cleanTranscript = transcriptWords.slice(transcriptWordIndex).join(' ').trim();
                        console.log('Filtered TTS echo from transcript, remaining:', cleanTranscript);
                    } else {
                        // Entire transcript was TTS echo
                        console.log('Transcript appears to be entirely TTS echo, ignoring');
                        return;
                    }
                }
            }
        }
        
        // Final check - if transcript is too short after filtering, ignore it
        if (cleanTranscript.length < 3) {
            console.log('Transcript too short after filtering, ignoring');
            return;
        }
        
        // Prevent duplicate processing - check if we just processed this
        const now = Date.now();
        if (this._lastProcessedTranscript === cleanTranscript && 
            (now - this._lastProcessedTime) < 2000) {
            console.log('Duplicate transcript detected, ignoring');
            return;
        }
        this._lastProcessedTranscript = cleanTranscript;
        this._lastProcessedTime = now;
        
        // Check if user is responding to download pitch (voice input)
        const lowerMessage = cleanTranscript.toLowerCase().trim();
        const isYesResponse = /^(yes|yeah|yea|yep|sure|ok|okay|definitely|absolutely|please|y)$/i.test(lowerMessage) ||
                              lowerMessage.includes('yes') || lowerMessage.includes('sure') || lowerMessage.includes('walk me through');
        const isNoResponse = /^(no|nope|nah|not now|later|maybe later|n)$/i.test(lowerMessage) ||
                             (lowerMessage.includes('no') && !lowerMessage.includes('know'));

        // Handle yes response - show download button immediately
        if (isYesResponse && this.waitingForDownloadResponse) {
            this.waitingForDownloadResponse = false;
            this.stopListening();
            this._bargeInDetected = false;
            const downloadMsg = "Great! Begin by pressing the Download button below to get protected.";
            this.addMessageToChat(cleanTranscript, 'user');
            this.addMessageToChat(downloadMsg, 'agent');
            this.showInstallButton();
            this.speak(downloadMsg).catch(err => console.error('TTS error:', err));
            return;
        }

        // Handle no response - give counter-pitch
        if (isNoResponse && this.waitingForDownloadResponse) {
            this.waitingForDownloadResponse = false;
            this.stopListening();
            this._bargeInDetected = false;
            const counterPitch = "I understand, but your PC is vulnerable to hackers, malware, and identity theft right now. AI PC Protect provides 24/7 real-time protection. Are you sure you don't want me to walk you through the quick download?";
            this.addMessageToChat(cleanTranscript, 'user');
            this.addMessageToChat(counterPitch, 'agent');
            this.waitingForDownloadResponse = true; // Keep waiting for their response
            this.speak(counterPitch).catch(err => console.error('TTS error:', err));
            return;
        }
        
        // Stop listening
        this.stopListening();
        
        // Clear barge-in flag if set
        this._bargeInDetected = false;
        
        // Switch to chat view if not already there
        const callView = document.getElementById('callView');
        const chatView = document.getElementById('chatView');
        if (callView && chatView) {
            callView.style.display = 'none';
            chatView.style.display = 'block';
        }
        
        // Set the input value and send
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = cleanTranscript;
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
            console.log('Sending message from voice input:', cleanTranscript);
            this.sendMessage();
        } else {
            console.error('Chat input not found');
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
