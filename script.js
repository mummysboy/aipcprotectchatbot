// PCProtect ChatBot Landing Page Script

document.addEventListener('DOMContentLoaded', function() {
    const mainButton = document.getElementById('mainButton');
    
    // Configure voice options for both chatbot and phone call
    // 
    // For Speechmatics (premium, high quality):
    //   ttsProvider: 'speechmatics'
    //   speechmaticsVoiceId: 'VOICE_ID_HERE' (get from Speechmatics API)
    //   outputFormat: 'pcm_f32le' (default) or 'mp3', 'pcm_s16le', etc.
    //   sampleRate: 44100 (default) or other supported rates
    //
    // For Browser TTS (free, lower quality):
    //   ttsProvider: 'browser'
    //   voice: specific voice name (e.g., "Alex", "Samantha")
    //   voiceGender: 'male' or 'female' to filter voices
    //   voiceLang: language code (e.g., 'en-US', 'en-GB')
    const voiceOptions = {
      // Use Speechmatics for premium quality (requires SPEECHMATICS_API_KEY in .env)
      ttsProvider: "speechmatics",
      speechmaticsVoiceId: "theo", // Available voices: theo, sarah, megan, jack (lowercase)
      playbackRate: 1.35, // Playback speed: 1.0 = normal, 1.25 = 25% faster, 1.5 = 50% faster (default: 1.25)

      // Or use browser TTS (fallback or if no API key):
      // ttsProvider: 'browser',
      // voice: 'Samantha',
      // voiceLang: 'en-US'
    };
    
    const chatbotPopup = new ChatbotPopup(voiceOptions);
    const phoneCall = new PhoneCall(voiceOptions);

    // Make chatbot instance globally accessible for console utilities
    window.chatbotPopupInstance = chatbotPopup;

    // Initialize components
    chatbotPopup.init();
    phoneCall.init();

    // Sample JSON data - replace with actual data source
    const sampleData = {
        "isHideFileExtensionsEnabled": true,
        "isHiddenFilesHidden": true,
        "wifiList": [
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" },
            { "password": "011555888", "ssid": "WorkSpace" }
        ]
    };

    // Button click handler - shows the chatbot popup
    mainButton.addEventListener('click', function() {
        // Pass context data to chatbot
        chatbotPopup.setContextData(sampleData);
        chatbotPopup.show();
    });

    // Listen for accept call event from popup
    window.addEventListener('acceptCall', function(event) {
        // Start the phone call with the data
        phoneCall.startCall(sampleData);
    });
});
