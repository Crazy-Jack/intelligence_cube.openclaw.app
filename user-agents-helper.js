// 🔧 User Agents Helper - Manage user-created agents
// This file provides utilities to create, store, and manage user-created agents

/**
 * Create a new user agent
 * @param {string} name - Agent name
 * @param {object} config - Agent configuration
 * @returns {boolean} Success status
 */
function createUserAgent(name, config = {}) {
    try {
        const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
        
        userAgents[name] = {
            name: name,
            purpose: config.purpose || 'A custom AI agent created by the user',
            useCase: config.useCase || 'General purpose chat and assistance',
            category: config.category || 'Custom Agent',
            industry: config.industry || 'General',
            isUserAgent: true,
            createdAt: new Date().toISOString(),
            ...config
        };
        
        localStorage.setItem('userAgents', JSON.stringify(userAgents));
        console.log('✅ User agent created:', name);
        return true;
    } catch (error) {
        console.error('❌ Error creating user agent:', error);
        return false;
    }
}

/**
 * Get a user agent by name
 * @param {string} name - Agent name
 * @returns {object|null} Agent data or null
 */
function getUserAgent(name) {
    try {
        const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
        return userAgents[name] || null;
    } catch (error) {
        console.error('❌ Error getting user agent:', error);
        return null;
    }
}

/**
 * Get all user agents
 * @returns {object} Object with all user agents
 */
function getAllUserAgents() {
    try {
        return JSON.parse(localStorage.getItem('userAgents') || '{}');
    } catch (error) {
        console.error('❌ Error getting all user agents:', error);
        return {};
    }
}

/**
 * Delete a user agent
 * @param {string} name - Agent name
 * @returns {boolean} Success status
 */
function deleteUserAgent(name) {
    try {
        const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
        delete userAgents[name];
        localStorage.setItem('userAgents', JSON.stringify(userAgents));
        console.log('✅ User agent deleted:', name);
        return true;
    } catch (error) {
        console.error('❌ Error deleting user agent:', error);
        return false;
    }
}

/**
 * Update a user agent
 * @param {string} name - Agent name
 * @param {object} updates - Updates to apply
 * @returns {boolean} Success status
 */
function updateUserAgent(name, updates) {
    try {
        const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
        if (!userAgents[name]) {
            console.error('❌ User agent not found:', name);
            return false;
        }
        
        userAgents[name] = {
            ...userAgents[name],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        localStorage.setItem('userAgents', JSON.stringify(userAgents));
        console.log('✅ User agent updated:', name);
        return true;
    } catch (error) {
        console.error('❌ Error updating user agent:', error);
        return false;
    }
}

// Export functions globally
if (typeof window !== 'undefined') {
    window.createUserAgent = createUserAgent;
    window.getUserAgent = getUserAgent;
    window.getAllUserAgents = getAllUserAgents;
    window.deleteUserAgent = deleteUserAgent;
    window.updateUserAgent = updateUserAgent;
}

// Example: Create a sample user agent
// createUserAgent('My-Custom-Agent', {
//     purpose: 'A helpful assistant for coding questions',
//     useCase: 'Answer programming questions and help with debugging',
//     category: 'Code Assistant',
//     industry: 'Software Development'
// });

console.log('✅ User Agents Helper loaded');

