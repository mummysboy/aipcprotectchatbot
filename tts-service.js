// Text-to-Speech Service
// Supports both Speechmatics (premium) and browser TTS (fallback)

class TTSService {
    constructor(options = {}) {
        this.provider = options.provider || 'browser'; // 'speechmatics' or 'browser'
        this.apiKey = options.apiKey || null;
        this.voiceId = options.voiceId || null; // Speechmatics voice ID
        this.outputFormat = options.outputFormat || 'mp3'; // Speechmatics output format (mp3 is more efficient than pcm)
        this.sampleRate = options.sampleRate || 44100; // Speechmatics sample rate
        this.playbackRate = options.playbackRate || 1.25; // Audio playback speed (1.0 = normal, 1.25 = 25% faster, 1.5 = 50% faster)
        
        // Browser TTS fallback
        this.synthesis = null;
        this.selectedVoice = null;
        this.voiceLang = options.voiceLang || 'en-US';
        
        // Audio management
        this.currentAudio = null;
        this.currentAudioUrl = null; // Track blob URL for cleanup
        this.isPlaying = false;
        this.onEndCallback = null;
        this.onErrorCallback = null;
        this.preloadedAudio = null; // Preloaded audio for next playback
        this.pendingAudio = []; // Track all audio instances for cleanup
        this.isStopping = false; // Flag to prevent new audio during stop
        this.speakPromise = null; // Track current speak operation to prevent overlapping calls
        this.currentRejectCallback = null; // Track reject callback for current promise
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

        // Stop any current audio IMMEDIATELY - do this first before any async operations
        // This ensures audio stops even if multiple calls happen quickly
        this.stop();

        // If there's already a speak operation in progress, wait for it to complete
        // This prevents multiple simultaneous speak calls
        while (this.speakPromise) {
            try {
                await this.speakPromise;
            } catch (e) {
                // Ignore errors from previous speak operation
            }
            // Small delay to ensure previous operation is fully cleaned up
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Wait a bit to ensure stop is complete
        await new Promise(resolve => setTimeout(resolve, 150));

        // Create a promise for this speak operation and set it immediately
        // This prevents other calls from starting while this one is processing
        const speakOperation = this._doSpeak(text, options);
        this.speakPromise = speakOperation;
        
        try {
            const result = await speakOperation;
            return result;
        } catch (error) {
            // Re-throw the error
            throw error;
        } finally {
            // Clear the promise when done
            this.speakPromise = null;
        }
    }

    async _doSpeak(text, options = {}) {
        // Double-check we're not stopping (should already be stopped from speak())
        if (this.isStopping) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        // Ensure no audio is playing before proceeding
        if (this.isPlaying || this.currentAudio) {
            this.stop();
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('TTSService.speak called:', {
            provider: this.provider,
            voiceId: this.voiceId,
            textLength: text.length
        });

        // Use Speechmatics if configured (API key is handled server-side)
        if (this.provider === 'speechmatics' && this.voiceId) {
            console.log('Using Speechmatics TTS');
            return this.speakWithSpeechmatics(text, options);
        }

        // Fallback to browser TTS
        console.log('Using browser TTS fallback');
        return this.speakWithBrowser(text, options);
    }

    async preloadAudio(text, options = {}) {
        // Preload audio in background without playing
        if (this.provider !== 'speechmatics' || !this.voiceId) {
            return null;
        }

        try {
            const voiceId = options.voiceId || this.voiceId;
            const outputFormat = options.outputFormat || this.outputFormat;
            const sampleRate = options.sampleRate || this.sampleRate;

            // Use API config for base URL (supports both local and hosted environments)
            const apiUrl = window.API_CONFIG ? window.API_CONFIG.getApiUrl('/api/tts') : '/api/tts';
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voiceId: voiceId,
                    outputFormat: outputFormat,
                    sampleRate: sampleRate
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

    async speakWithSpeechmatics(text, options = {}) {
        try {
            // Check if we have preloaded audio for this text
            if (this.preloadedAudio && this.preloadedAudio.text === text) {
                // Use preloaded audio for instant playback
                const audio = this.preloadedAudio.audio;
                const audioUrl = this.preloadedAudio.url;
                this.preloadedAudio = null; // Clear preloaded audio
                
                // Stop any current audio (already done in speak())
                
                // Play the preloaded audio
                this.currentAudio = audio;
                this.currentAudioUrl = audioUrl; // Track URL for cleanup
                this.isPlaying = true;
                audio.volume = options.volume !== undefined ? options.volume : 1;
                audio.playbackRate = options.playbackRate !== undefined ? options.playbackRate : this.playbackRate;
                
                return new Promise(async (resolve, reject) => {
                    // Store reject callback so stop() can reject this promise
                    this.currentRejectCallback = reject;
                    
                    // Add debug event listeners
                    audio.onplay = () => {
                        console.log('🔊 Preloaded audio onplay fired - audio is actually playing');
                    };
                    
                    audio.onended = () => {
                        console.log('✅ Preloaded audio onended fired - playback completed');
                        if (this.currentAudio === audio) {
                            this.isPlaying = false;
                            if (this.currentAudioUrl) {
                                URL.revokeObjectURL(this.currentAudioUrl);
                                this.currentAudioUrl = null;
                            }
                            const callback = this.onEndCallback;
                            this.currentAudio = null;
                            this.currentRejectCallback = null;
                            if (callback) callback();
                            resolve();
                        } else {
                            URL.revokeObjectURL(audioUrl);
                        }
                    };
                    
                    audio.onerror = (error) => {
                        console.log('❌ Preloaded audio onerror fired:', error);
                        this.isPlaying = false;
                        if (this.currentAudio === audio) {
                            if (this.currentAudioUrl) {
                                URL.revokeObjectURL(this.currentAudioUrl);
                                this.currentAudioUrl = null;
                            }
                            this.currentAudio = null;
                            this.currentRejectCallback = null;
                        }
                        URL.revokeObjectURL(audioUrl);
                        reject(new Error(`Preloaded audio element error: ${audio.error?.message || 'Unknown error'}`));
                    };
                    
                    const tryPlay = async () => {
                        if (audio.readyState >= 2) {
                            try {
                                await audio.play();
                                console.log('✓ Playing preloaded audio');
                            } catch (playError) {
                                console.error('✗ Failed to play preloaded audio:', playError);
                                if (playError.name === 'NotAllowedError') {
                                    reject(new Error(`Audio play() failed (autoplay blocked?): ${playError.message || playError}`));
                                } else {
                                    reject(new Error(`Audio play() failed: ${playError.message || playError}`));
                                }
                            }
                        } else {
                            setTimeout(tryPlay, 10);
                        }
                    };
                    
                    tryPlay();
                });
            }

            // Stop any current audio (already done in speak())

            const voiceId = options.voiceId || this.voiceId;
            const outputFormat = options.outputFormat || this.outputFormat;
            const sampleRate = options.sampleRate || this.sampleRate;
            
            if (!voiceId) {
                console.error('Speechmatics voiceId not configured');
                console.log('Falling back to browser TTS');
                return this.speakWithBrowser(text, options);
            }

            console.log('Calling Speechmatics TTS API with voice:', voiceId);

            // Call server endpoint to generate speech
            // Use API config for base URL (supports both local and hosted environments)
            const apiUrl = window.API_CONFIG ? window.API_CONFIG.getApiUrl('/api/tts') : '/api/tts';
            
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: text,
                    voiceId: voiceId,
                    outputFormat: outputFormat,
                    sampleRate: sampleRate
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
                
                console.error('Speechmatics TTS API error:', {
                    status: response.status,
                    statusText: response.statusText,
                    error: error,
                    errorText: errorText.substring(0, 200)
                });
                console.log('Falling back to browser TTS');
                // Fallback to browser TTS
                return this.speakWithBrowser(text, options);
            }

            console.log('Speechmatics TTS API success, processing audio...');
            console.log('Response content-type:', response.headers.get('content-type'));
            console.log('Response status:', response.status);

            // CRITICAL: Check response content type
            const contentType = response.headers.get('content-type') || '';
            console.log('Response content-type:', contentType);
            
            // Check if response is actually audio (not JSON error)
            if (!contentType.includes('audio') && !contentType.includes('mpeg') && !contentType.includes('wav')) {
                const errorText = await response.text();
                console.error('Response is not audio, got:', errorText.substring(0, 200));
                throw new Error(`TTS returned non-audio response: ${contentType}`);
            }

            // Get audio as arrayBuffer (more reliable than blob for base64-encoded responses)
            const arrayBuffer = await response.arrayBuffer();
            console.log('Audio arrayBuffer received, size:', arrayBuffer.byteLength, 'bytes');
            
            if (!arrayBuffer || arrayBuffer.byteLength < 1000) {
                console.error('TTS returned tiny or empty audio (', arrayBuffer?.byteLength, 'bytes)');
                throw new Error(`TTS returned tiny audio (${arrayBuffer?.byteLength} bytes)`);
            }

            // Create blob with correct MIME type
            const blob = new Blob([arrayBuffer], { 
                type: contentType.includes('audio') ? contentType : 'audio/mpeg' 
            });
            const audioUrl = URL.createObjectURL(blob);
            console.log('Audio URL created:', audioUrl);
            
            // Play audio
            return new Promise((resolve, reject) => {
                // Store reject callback so stop() can reject this promise
                this.currentRejectCallback = reject;

                // Double-check we're not stopping and no other audio is playing
                if (this.isStopping || this.currentAudio || this.isPlaying) {
                    URL.revokeObjectURL(audioUrl);
                    reject(new Error('TTS service is stopping or another audio is playing'));
                    this.currentRejectCallback = null;
                    return;
                }
                
                const audio = new Audio(audioUrl);
                this.currentAudio = audio;
                this.currentAudioUrl = audioUrl; // Track URL for cleanup
                this.isPlaying = true;
                
                // Track this audio instance
                const audioData = { audio, url: audioUrl };
                this.pendingAudio.push(audioData);
                
                // Add abort handler in case stop() is called while loading
                const abortHandler = () => {
                    if (this.isStopping || this.currentAudio !== audio) {
                        try {
                            audio.pause();
                            audio.currentTime = 0;
                            audio.src = '';
                        } catch (e) {
                            // Ignore errors during abort
                        }
                        const index = this.pendingAudio.indexOf(audioData);
                        if (index > -1) {
                            this.pendingAudio.splice(index, 1);
                        }
                        try {
                            URL.revokeObjectURL(audioUrl);
                        } catch (e) {
                            // Ignore URL revocation errors
                        }
                        if (this.currentAudio === audio) {
                            this.currentAudio = null;
                            this.currentAudioUrl = null;
                            this.isPlaying = false;
                            this.currentRejectCallback = null; // Clear reject callback
                        }
                        reject(new Error('Audio playback aborted'));
                    }
                };

                // Set audio properties
                audio.volume = options.volume !== undefined ? options.volume : 1;
                audio.playbackRate = options.playbackRate !== undefined ? options.playbackRate : this.playbackRate;
                audio.preload = 'auto';

                console.log('Audio element created, attempting to play...');
                console.log('Audio properties:', {
                    volume: audio.volume,
                    readyState: audio.readyState,
                    paused: audio.paused
                });

                // Add debug event listeners
                audio.onplay = () => {
                    console.log('🔊 Audio onplay fired - audio is actually playing');
                };

                audio.onended = () => {
                    console.log('✅ Audio onended fired - playback completed');
                    // Remove from pending list
                    const index = this.pendingAudio.indexOf(audioData);
                    if (index > -1) {
                        this.pendingAudio.splice(index, 1);
                    }
                    
                    // Only process if this is still the current audio
                    if (this.currentAudio === audio) {
                        this.isPlaying = false;
                        if (this.currentAudioUrl) {
                            URL.revokeObjectURL(this.currentAudioUrl);
                            this.currentAudioUrl = null;
                        }
                        const callback = this.onEndCallback;
                        this.currentAudio = null;
                        this.currentRejectCallback = null; // Clear reject callback
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
                    console.log('❌ Audio onerror fired:', error);
                    // Remove from pending list
                    const index = this.pendingAudio.indexOf(audioData);
                    if (index > -1) {
                        this.pendingAudio.splice(index, 1);
                    }

                    this.isPlaying = false;
                    if (this.currentAudio === audio) {
                        if (this.currentAudioUrl) {
                            URL.revokeObjectURL(this.currentAudioUrl);
                            this.currentAudioUrl = null;
                        }
                        this.currentAudio = null;
                        this.currentRejectCallback = null; // Clear reject callback
                    }
                    URL.revokeObjectURL(audioUrl);
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
                    reject(new Error(`Audio element error while playing: ${audio.error?.message || 'Unknown error'}`));
                };

                audio.onpause = () => {
                    console.log('Audio paused');
                };

                // Wait for audio to be ready, then play
                const tryPlay = async () => {
                    // Check if we should abort before playing
                    if (this.isStopping || this.currentAudio !== audio) {
                        abortHandler();
                        return;
                    }
                    
                    // Use HAVE_CURRENT_DATA (2) for faster start
                    if (audio.readyState >= 2) { // HAVE_CURRENT_DATA - enough to start playing
                        console.log('Audio ready (readyState:', audio.readyState, '), attempting play...');
                        
                        // Final check before playing
                        if (this.isStopping || this.currentAudio !== audio) {
                            abortHandler();
                            return;
                        }
                        
                        // CRITICAL: await audio.play() and handle rejection
                        try {
                            await audio.play();
                            console.log('✓ Audio play() promise resolved - audio should be playing');
                        } catch (playError) {
                            console.error('✗ Failed to play audio:', playError);
                            console.error('Play error details:', {
                                name: playError.name,
                                message: playError.message,
                                code: playError.code
                            });
                            
                            // If autoplay is blocked, provide clear error
                            if (playError.name === 'NotAllowedError') {
                                console.error('Autoplay blocked - user interaction required');
                                throw new Error(`Audio play() failed (autoplay blocked?): ${playError.message || playError}`);
                            }
                            
                            this.isPlaying = false;
                            const index = this.pendingAudio.indexOf(audioData);
                            if (index > -1) {
                                this.pendingAudio.splice(index, 1);
                            }
                            URL.revokeObjectURL(audioUrl);
                            throw new Error(`Audio play() failed: ${playError.message || playError}`);
                        }
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

                // Start loading immediately
                audio.load();
            });

        } catch (error) {
            console.error('Speechmatics TTS error:', error);
            // Fallback to browser TTS
            return this.speakWithBrowser(text, options);
        }
    }

    speakWithBrowser(text, options = {}) {
        return new Promise((resolve, reject) => {
            // Store reject callback so stop() can reject this promise
            this.currentRejectCallback = reject;

            if (!this.synthesis) {
                reject(new Error('Browser TTS not available'));
                this.currentRejectCallback = null;
                return;
            }

            // Stop any current speech
            this.synthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            // Convert playbackRate (1.0-2.0) to browser TTS rate (0.1-10.0, where 1.0 = normal)
            // Default browser rate is 1.0, so we scale: playbackRate 1.25 = rate 1.25, but cap at reasonable values
            const browserRate = options.rate !== undefined ? options.rate : (this.playbackRate * 1.0);
            utterance.rate = Math.min(Math.max(browserRate, 0.5), 2.0); // Clamp between 0.5 and 2.0
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
                    this.currentRejectCallback = null; // Clear reject callback
                    const callback = this.onEndCallback;
                    if (callback) {
                        callback();
                    }
                    resolve();
                } else {
                    // Speech was cancelled, reject the promise
                    this.currentRejectCallback = null;
                    reject(new Error('Browser TTS cancelled'));
                }
            };

            utterance.onerror = (event) => {
                this.isPlaying = false;
                this.currentRejectCallback = null; // Clear reject callback
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
        this.isStopping = true;
        
        // Stop and cleanup current audio
        if (this.currentAudio) {
            // Remove event listeners to prevent callbacks from firing
            this.currentAudio.onended = null;
            this.currentAudio.onerror = null;
            this.currentAudio.onplay = null;
            this.currentAudio.onpause = null;
            this.currentAudio.oncanplay = null;
            this.currentAudio.oncanplaythrough = null;
            this.currentAudio.onloadeddata = null;
            
            // Force stop the audio (but don't destroy the element - it will be reused)
            try {
                this.currentAudio.pause();
                this.currentAudio.currentTime = 0;
                // Don't set src to '' - keep the element for reuse
            } catch (e) {
                console.warn('Error stopping audio:', e);
            }
            
            // Clean up blob URL if it exists
            if (this.currentAudioUrl) {
                try {
                    URL.revokeObjectURL(this.currentAudioUrl);
                } catch (e) {
                    console.warn('Error revoking URL:', e);
                }
                this.currentAudioUrl = null;
            }
            
            // Clear current audio (new one will be created in next speak() call)
            this.currentAudio = null;
            this.isPlaying = false;
        }
        
        // Stop and cleanup all pending audio instances
        this.pendingAudio.forEach(audioData => {
            if (audioData.audio) {
                try {
                    audioData.audio.onended = null;
                    audioData.audio.onerror = null;
                    audioData.audio.onplay = null;
                    audioData.audio.onpause = null;
                    audioData.audio.oncanplay = null;
                    audioData.audio.oncanplaythrough = null;
                    audioData.audio.onloadeddata = null;
                    audioData.audio.pause();
                    audioData.audio.currentTime = 0;
                    audioData.audio.src = '';
                } catch (e) {
                    console.warn('Error stopping pending audio:', e);
                }
            }
            if (audioData.url) {
                try {
                    URL.revokeObjectURL(audioData.url);
                } catch (e) {
                    console.warn('Error revoking pending URL:', e);
                }
            }
        });
        this.pendingAudio = [];
        
        if (this.synthesis) {
            this.synthesis.cancel();
        }
        
        this.isPlaying = false;

        // Reject any pending promise to prevent hanging
        if (this.currentRejectCallback) {
            this.currentRejectCallback(new Error('TTS stopped'));
            this.currentRejectCallback = null;
        }

        // Note: Don't clear onEndCallback/onErrorCallback here as they are needed for future TTS operations
        // The audio element event handlers are already cleared above to prevent them from firing
        
        // Small delay to ensure audio has actually stopped
        setTimeout(() => {
            this.isStopping = false;
        }, 100);
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

    // Get available Speechmatics voices (requires API call)
    async getSpeechmaticsVoices() {
        try {
            // Use API config for base URL (supports both local and hosted environments)
            const apiUrl = window.API_CONFIG ? window.API_CONFIG.getApiUrl('/api/tts/voices') : '/api/tts/voices';
            
            const response = await fetch(apiUrl, {
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
            console.error('Error fetching Speechmatics voices:', error);
            throw error;
        }
    }
}

// Export for use in other scripts
window.TTSService = TTSService;

