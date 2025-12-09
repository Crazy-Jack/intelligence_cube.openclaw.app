// Quick script to create a test agent
// Run this in the browser console or via Node.js

const testAgentName = 'Test-Agent-' + Date.now();
const testAgentConfig = {
    purpose: 'A test agent for testing the Gemini integration',
    useCase: 'Testing chat functionality and streaming responses',
    category: 'Test Agent',
    industry: 'Testing'
};

// If running in browser
if (typeof window !== 'undefined' && typeof createUserAgent === 'function') {
    const success = createUserAgent(testAgentName, testAgentConfig);
    if (success) {
        console.log('✅ Test agent created:', testAgentName);
        console.log('You can now find it in the User Agents tab in Modelverse');
    } else {
        console.error('❌ Failed to create test agent');
    }
} else if (typeof localStorage !== 'undefined') {
    // Browser environment but helper not loaded - create directly
    try {
        const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
        userAgents[testAgentName] = {
            name: testAgentName,
            purpose: testAgentConfig.purpose,
            useCase: testAgentConfig.useCase,
            category: testAgentConfig.category,
            industry: testAgentConfig.industry,
            isUserAgent: true,
            createdAt: new Date().toISOString()
        };
        localStorage.setItem('userAgents', JSON.stringify(userAgents));
        console.log('✅ Test agent created:', testAgentName);
        console.log('You can now find it in the User Agents tab in Modelverse');
    } catch (error) {
        console.error('❌ Error creating test agent:', error);
    }
} else {
    console.log('Run this script in the browser console on the Modelverse page');
    console.log('Or use this code:');
    console.log(`
        const testAgentName = 'Test-Agent-' + Date.now();
        if (typeof createUserAgent === 'function') {
            createUserAgent(testAgentName, {
                purpose: 'A test agent for testing the Gemini integration',
                useCase: 'Testing chat functionality and streaming responses',
                category: 'Test Agent',
                industry: 'Testing'
            });
        }
    `);
}

