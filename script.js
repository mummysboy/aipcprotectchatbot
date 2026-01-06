// PCProtect ChatBot Landing Page Script

document.addEventListener('DOMContentLoaded', function() {
    const mainButton = document.getElementById('mainButton');
    const chatbotPopup = new ChatbotPopup();
    const phoneCall = new PhoneCall();

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
        chatbotPopup.show();
    });

    // Listen for accept call event from popup
    window.addEventListener('acceptCall', function(event) {
        // Start the phone call with the data
        phoneCall.startCall(sampleData);
    });
});
