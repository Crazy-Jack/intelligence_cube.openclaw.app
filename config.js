// 🔐 Configuration file for Intelligence Cubed
// API keys should be set via environment variables

// Helper to get environment variable (works in Node.js)
const getEnv = (key, defaultValue = '') => {
    if (typeof process !== 'undefined' && process.env && process.env[key]) {
        return process.env[key];
    }
    return defaultValue;
};

const config = {
    // I3 Proxy API Configuration (used by api-manager.js)
    proxy: {
        apiKey: getEnv('I3_PROXY_API_KEY'),
        model: 'I3-Generic-Foundation-LLM',
        maxTokens: 4000,
        temperature: 0.7
    },

    // Server Configuration
    server: {
        port: parseInt(getEnv('PORT', '3001')),
        host: getEnv('HOST', 'localhost')
    },

    // Application Configuration
    app: {
        name: 'Intelligence Cubed',
        version: '1.0.0',
        environment: getEnv('NODE_ENV', 'development')
    },

    // Model Configuration (legacy - kept for compatibility)
    models: {
        defaultModel: 'I3-Generic-Foundation-LLM',
        fallbackModel: 'I3-Generic-Foundation-LLM',
        maxConcurrentRequests: 10
    },

    // Gemini API Configuration (for user-created agents)
    gemini: {
        apiKey: getEnv('GEMINI_API_KEY'), // Set via env var or localStorage.setItem('geminiApiKey', 'YOUR_KEY')
        model: 'gemini-2.0-flash', // Available: gemini-2.5-flash, gemini-2.5-pro, gemini-2.0-flash, etc.
        apiUrl: 'https://generativelanguage.googleapis.com/v1beta',
        // TESTING: Set to true to bypass coin/payment constraints (still calls real Gemini API)
        testMode: getEnv('GEMINI_TEST_MODE', 'false') === 'true'
    }
};

// Export for Node.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = config;
}

// Export for browser
if (typeof window !== 'undefined') {
    window.APP_CONFIG = config;
}

console.log('✅ Configuration loaded successfully'); 