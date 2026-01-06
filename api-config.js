// API Configuration
// Handles API base URL for both local development and hosted environments

(function() {
    'use strict';

    // Get API base URL from various sources (in order of priority):
    // 1. window.API_BASE_URL (manually set)
    // 2. data-api-base-url attribute on html/body element
    // 3. window.location.origin (same origin - for local dev or same-domain hosting)
    // 4. Empty string (relative URLs - fallback)
    
    function getApiBaseUrl() {
        // Check for manual override
        if (window.API_BASE_URL) {
            return window.API_BASE_URL;
        }

        // Check for data attribute on html or body
        const htmlElement = document.documentElement;
        const bodyElement = document.body;
        const apiBaseUrlAttr = htmlElement.getAttribute('data-api-base-url') || 
                               bodyElement?.getAttribute('data-api-base-url');
        
        if (apiBaseUrlAttr) {
            return apiBaseUrlAttr;
        }

        // For same-origin hosting, use empty string (relative URLs work)
        // This works when frontend and backend are on the same domain
        // For cross-origin, set window.API_BASE_URL or data-api-base-url attribute
        return '';
    }

    // Export API configuration
    window.API_CONFIG = {
        baseUrl: getApiBaseUrl(),
        
        // Helper to build full API URL
        getApiUrl: function(endpoint) {
            // Remove leading slash if baseUrl already ends with one or has a path
            const cleanEndpoint = endpoint.startsWith('/') ? endpoint : '/' + endpoint;
            
            if (this.baseUrl) {
                // Remove trailing slash from baseUrl if present
                const cleanBaseUrl = this.baseUrl.endsWith('/') 
                    ? this.baseUrl.slice(0, -1) 
                    : this.baseUrl;
                return cleanBaseUrl + cleanEndpoint;
            }
            
            return cleanEndpoint;
        },
        
        // Update base URL dynamically
        setBaseUrl: function(url) {
            this.baseUrl = url;
        }
    };

    // Log configuration (helpful for debugging)
    console.log('API Configuration:', {
        baseUrl: window.API_CONFIG.baseUrl,
        example: window.API_CONFIG.getApiUrl('/api/test')
    });
})();



