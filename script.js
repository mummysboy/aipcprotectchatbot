// PCProtect ChatBot Landing Page Script

document.addEventListener('DOMContentLoaded', function() {
    const mainButton = document.getElementById('mainButton');
    
    // Configure voice options for both chatbot and phone call
    // 
    // For ElevenLabs (premium, high quality):
    //   ttsProvider: 'elevenlabs'
    //   elevenLabsVoiceId: 'VOICE_ID_HERE' (get from https://elevenlabs.io)
    //   Popular voices:
    //     - Rachel: 21m00Tcm4TlvDq8ikWAM (Professional female)
    //     - Domi: AZnzlk1XvdvUeBnXmlld (Confident female)
    //     - Bella: EXAVITQu4vr4xnSDxMaL (Soft female)
    //     - Antoni: ErXwobaYiN019PkySvjV (Warm male)
    //     - Elli: MF3mGyEYCl7XYWbV9V6O (Friendly female)
    //
    // For Browser TTS (free, lower quality):
    //   ttsProvider: 'browser'
    //   voice: specific voice name (e.g., "Alex", "Samantha")
    //   voiceGender: 'male' or 'female' to filter voices
    //   voiceLang: language code (e.g., 'en-US', 'en-GB')
    const voiceOptions = {
      // Use ElevenLabs for premium quality (requires ELEVENLABS_API_KEY in .env)
      ttsProvider: "elevenlabs",
      elevenLabsVoiceId: "CwhRBWXzGAHq8TQ4Fs17", // Hope - Professional female voice

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
