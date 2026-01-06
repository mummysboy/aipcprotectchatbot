// Text-to-Speech Service
// Supports both ElevenLabs (premium) and browser TTS (fallback)

class TTSService {
    constructor(options = {}) {
        this.provider = options.provider || 'browser'; // 'elevenlabs' or 'browser'
        this.apiKey = options.apiKey || null;
        this.voiceId = options.voiceId || null; // ElevenLabs voice ID
        this.modelId = options.modelId || 'eleven_turbo_v2_5'; // ElevenLabs model (updated for free tier)
        this.stability = options.stability || 0.5;
        this.similarityBoost = options.similarityBoost || 0.75;
        this.style = options.style || 0.0;
        this.useSpeakerBoost = options.useSpeakerBoost || true;
        
        // Browser TTS fallback
        this.synthesis = null;
        this.selectedVoice = null;
        this.voiceLang = options.voiceLang || 'en-US';
        
        // Audio management
        this.currentAudio = null;
        this.isPlaying = false;
        this.onEndCallback = null;
        this.onErrorCallback = null;
        this.preloadedAudio = null; // Preloaded audio for next playback
        this.preloadedAudio = null; // Preloaded audio for next playback
    }

    init() {
        // Initialize browser TTS as fallback
        if ('speechSynthesis' in window) {
            this.synthesis = window.speechSynthesis;
            this.loadVoices();
        }
    }

    loadVoices() {
        if (!this.synthesis) return;
        
        if (this.synthesis.getVoices().length > 0) {
            this.selectVoice();
        }
        
        this.synthesis.onvoiceschanged = () => {
            this.selectVoice();
        };
    }

    selectVoice() {
        if (!this.synthesis) return;
        
        const voices = this.synthesis.getVoices();
        if (voices.length === 0) return;

        // Prefer local English voices
        const localVoices = voices.filter(v => v.localService && v.lang.startsWith('en'));
        if (localVoices.length > 0) {
            this.selectedVoice = localVoices[0];
        } else {
            const englishVoices = voices.filter(v => v.lang.startsWith('en'));
            this.selectedVoice = englishVoices.length > 0 ? englishVoices[0] : voices[0];
        }
    }

    async speak(text, options = {}) {
        if (!text || text.trim() === '') {
            return Promise.resolve();
        }

        console.log('TTSService.speak called:', {
            provider: this.provider,
            voiceId: this.voiceId,
            textLength: text.length
        });

        // Use ElevenLabs if configured (API key is handled server-side)
        if (this.provider === 'elevenlabs' && this.voiceId) {
            console.log('Using ElevenLabs TTS');
            return this.speakWithElevenLabs(text, options);
        }

        // Fallback to browser TTS
        console.log('Using browser TTS fallback');
        return this.speakWithBrowser(text, options);
    }

    async preloadAudio(text, options = {}) {
        // Preload audio in background without playing
        if (this.provider !== 'elevenlabs' || !this.voiceId) {
            return null;
        }

        try {
            const voiceId = options.voiceId || this.voiceId;
            const modelId = options.modelId || this.modelId;

            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voiceId: voiceId,
                    modelId: modelId,
                    stability: options.stability !== undefined ? options.stability : this.stability,
                    similarityBoost: options.similarityBoost !== undefined ? options.similarityBoost : this.similarityBoost,
                    style: options.style !== undefined ? options.style : this.style,
                    useSpeakerBoost: options.useSpeakerBoost !== undefined ? options.useSpeakerBoost : this.useSpeakerBoost
                })
            });

            if (!response.ok) {
                return null;
            }

            const audioBlob = await response.blob();
            if (audioBlob.size === 0) {
                return null;
            }

            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            audio.preload = 'auto';
            audio.load();
            
            // Store preloaded audio
            if (this.preloadedAudio && this.preloadedAudio.url) {
                URL.revokeObjectURL(this.preloadedAudio.url);
            }
            
            this.preloadedAudio = {
                audio: audio,
                url: audioUrl,
                text: text
            };

            return audio;
        } catch (error) {
            console.log('Preload error (non-critical):', error);
            return null;
        }
    }

    async speakWithElevenLabs(text, options = {}) {
        try {
            // Check if we have preloaded audio for this text
            if (this.preloadedAudio && this.preloadedAudio.text === text) {
                // Use preloaded audio for instant playback
                const audio = this.preloadedAudio.audio;
                const audioUrl = this.preloadedAudio.url;
                this.preloadedAudio = null; // Clear preloaded audio
                
                // Stop any current audio
                this.stop();
                
                // Play the preloaded audio
                this.currentAudio = audio;
                this.isPlaying = true;
                audio.volume = options.volume !== undefined ? options.volume : 1;
                
                return new Promise((resolve, reject) => {
                    const tryPlay = () => {
                        if (audio.readyState >= 2) {
                            audio.play().then(() => {
                                console.log('✓ Playing preloaded audio');
                            }).catch(reject);
                        } else {
                            setTimeout(tryPlay, 10);
                        }
                    };
                    
                    audio.onended = () => {
                        if (this.currentAudio === audio) {
                            this.isPlaying = false;
                            URL.revokeObjectURL(audioUrl);
                            const callback = this.onEndCallback;
                            this.currentAudio = null;
                            if (callback) callback();
                            resolve();
                        } else {
                            URL.revokeObjectURL(audioUrl);
                        }
                    };
                    
                    audio.onerror = reject;
                    tryPlay();
                });
            }

            // Stop any current audio
            this.stop();

            const voiceId = options.voiceId || this.voiceId;
            const modelId = options.modelId || this.modelId;
            
            if (!voiceId) {
                console.error('ElevenLabs voiceId not configured');
                console.log('Falling back to browser TTS');
                return this.speakWithBrowser(text, options);
            }

            console.log('Calling ElevenLabs TTS API with voice:', voiceId);

            // Call server endpoint to generate speech
            const response = await fetch('/api/tts', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voiceId: voiceId,
                    modelId: modelId,
                    stability: options.stability !== undefined ? options.stability : this.stability,
                    similarityBoost: options.similarityBoost !== undefined ? options.similarityBoost : this.similarityBoost,
                    style: options.style !== undefined ? options.style : this.style,
                    useSpeakerBoost: options.useSpeakerBoost !== undefined ? options.useSpeakerBoost : this.useSpeakerBoost
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                let error;
                try {
                    error = JSON.parse(errorText);
                } catch (e) {
                    error = { message: errorText };
                }
                
                console.error('ElevenLabs TTS API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: error,
                    errorText: errorText.substring(0, 200)
                });
                console.log('Falling back to browser TTS');
                // Fallback to browser TTS
                return this.speakWithBrowser(text, options);
            }

            console.log('ElevenLabs TTS API success, processing audio...');
            console.log('Response content-type:', response.headers.get('content-type'));
            console.log('Response status:', response.status);

            // Get audio blob
            const audioBlob = await response.blob();
            console.log('Audio blob received, size:', audioBlob.size, 'bytes');
            
            if (audioBlob.size === 0) {
                console.error('Empty audio blob received');
                return this.speakWithBrowser(text, options);
            }
            
            const audioUrl = URL.createObjectURL(audioBlob);
            console.log('Audio URL created:', audioUrl);
            
            // Play audio
            return new Promise((resolve, reject) => {
                const audio = new Audio(audioUrl);
                this.currentAudio = audio;
                this.isPlaying = true;

                // Set audio properties for fast playback
                audio.volume = options.volume !== undefined ? options.volume : 1;
                audio.preload = 'auto';
                // Start loading immediately
                audio.load();

                console.log('Audio element created, attempting to play...');
                console.log('Audio properties:', {
                    volume: audio.volume,
                    readyState: audio.readyState,
                    paused: audio.paused
                });

                // Wait for audio to be ready - start playing as soon as we have enough data
                const tryPlay = () => {
                    // Use HAVE_FUTURE_DATA (3) or HAVE_CURRENT_DATA (2) for faster start
                    // HAVE_ENOUGH_DATA (4) waits for full buffer, causing delays
                    if (audio.readyState >= 2) { // HAVE_CURRENT_DATA - enough to start playing
                        console.log('Audio ready, attempting play...');
                        audio.play().then(() => {
                            console.log('✓ Audio play() promise resolved - audio should be playing');
                        }).catch(error => {
                            console.error('✗ Failed to play audio:', error);
                            console.error('Play error details:', {
                                name: error.name,
                                message: error.message,
                                code: error.code
                            });
                            
                            // If autoplay is blocked, try to provide user feedback
                            if (error.name === 'NotAllowedError') {
                                console.error('Autoplay blocked - user interaction required');
                            }
                            
                            this.isPlaying = false;
                            URL.revokeObjectURL(audioUrl);
                            reject(error);
                        });
                    } else {
                        // Check more frequently for faster response
                        setTimeout(tryPlay, 10);
                    }
                };

                audio.onloadeddata = () => {
                    console.log('Audio data loaded, duration:', audio.duration, 'seconds');
                    tryPlay();
                };

                audio.oncanplay = () => {
                    console.log('Audio can play (readyState:', audio.readyState, ')');
                    tryPlay();
                };

                audio.oncanplaythrough = () => {
                    console.log('Audio can play through');
                };

                audio.onended = () => {
                    // Only process if this is still the current audio
                    if (this.currentAudio === audio) {
                        console.log('✓ Audio playback ended');
                        this.isPlaying = false;
                        URL.revokeObjectURL(audioUrl);
                        const callback = this.onEndCallback;
                        this.currentAudio = null;
                        if (callback) {
                            callback();
                        }
                        resolve();
                    } else {
                        // Audio was stopped/replaced, just cleanup
                        console.log('Audio ended but was already stopped/replaced');
                        URL.revokeObjectURL(audioUrl);
                    }
                };

                audio.onerror = (error) => {
                    this.isPlaying = false;
                    URL.revokeObjectURL(audioUrl);
                    console.error('✗ Audio playback error:', error);
                    console.error('Audio error details:', {
                        code: audio.error?.code,
                        message: audio.error?.message,
                        MEDIA_ERR_ABORTED: 1,
                        MEDIA_ERR_NETWORK: 2,
                        MEDIA_ERR_DECODE: 3,
                        MEDIA_ERR_SRC_NOT_SUPPORTED: 4
                    });
                    if (this.onErrorCallback) {
                        this.onErrorCallback(error);
                    }
                    reject(error);
                };

                audio.onplay = () => {
                    console.log('✓ Audio started playing');
                };

                audio.onpause = () => {
                    console.log('Audio paused');
                };

                // Audio.load() is called earlier for faster start
            });

        } catch (error) {
            console.error('ElevenLabs TTS error:', error);
            // Fallback to browser TTS
            return this.speakWithBrowser(text, options);
        }
    }

    speakWithBrowser(text, options = {}) {
        return new Promise((resolve, reject) => {
            if (!this.synthesis) {
                reject(new Error('Browser TTS not available'));
                return;
            }

            // Stop any current speech
            this.synthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = options.rate !== undefined ? options.rate : 0.9;
            utterance.pitch = options.pitch !== undefined ? options.pitch : 1;
            utterance.volume = options.volume !== undefined ? options.volume : 1;
            utterance.lang = options.lang || this.voiceLang;

            if (this.selectedVoice) {
                utterance.voice = this.selectedVoice;
            }

            utterance.onend = () => {
                // Only process if we're still playing (not cancelled)
                if (this.isPlaying) {
                    this.isPlaying = false;
                    const callback = this.onEndCallback;
                    if (callback) {
                        callback();
                    }
                    resolve();
                }
            };

            utterance.onerror = (event) => {
                this.isPlaying = false;
                console.error('Browser TTS error:', event);
                if (this.onErrorCallback) {
                    this.onErrorCallback(event);
                }
                reject(event);
            };

            this.isPlaying = true;
            this.synthesis.speak(utterance);
        });
    }

    stop() {
        if (this.currentAudio) {
            // Remove event listeners to prevent callbacks from firing
            this.currentAudio.onended = null;
            this.currentAudio.onerror = null;
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
        }
        
        if (this.synthesis) {
            this.synthesis.cancel();
        }
        
        this.isPlaying = false;
        // Clear callbacks to prevent them from firing
        this.onEndCallback = null;
    }

    cancel() {
        this.stop();
    }

    setOnEnd(callback) {
        this.onEndCallback = callback;
    }

    setOnError(callback) {
        this.onErrorCallback = callback;
    }

    // Get available ElevenLabs voices (requires API call)
    async getElevenLabsVoices() {
        if (!this.apiKey) {
            throw new Error('ElevenLabs API key not configured');
        }

        try {
            const response = await fetch('/api/tts/voices', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch voices');
            }

            return await response.json();
        } catch (error) {
            console.error('Error fetching ElevenLabs voices:', error);
            throw error;
        }
    }
}

// Export for use in other scripts
window.TTSService = TTSService;

