// Script to create a Code Help Agent in the modelverse
// This agent helps with coding questions, debugging, and code review
// 
// USAGE:
// 1. Open the Modelverse page in your browser
// 2. Open the browser console (F12)
// 3. Copy and paste this entire script into the console
// 4. The agent will be created and appear in the User Agents tab

(function createCodeHelpAgent() {
    const agentName = 'Code-Help-Assistant';
    const agentConfig = {
        purpose: 'I am a specialized coding assistant that helps developers with programming questions, code debugging, code review, explaining code concepts, and providing coding best practices. I can help with multiple programming languages including JavaScript, Python, Java, C++, Go, Rust, and more.',
        useCase: 'Get help with coding questions, debug code issues, review code for best practices, understand code snippets, get programming explanations, and receive coding guidance.',
        category: 'Code Assistant',
        industry: 'Software Development',
        tokenPrice: 0,
        sharePrice: 0,
        rating: 5,
        ratingFormatted: '5.0',
        starsHtml: '★★★★★',
        change: '0',
        paperLink: '-',
        isUserAgent: true,
        createdAt: new Date().toISOString()
    };

    // Create the agent in localStorage
    try {
        const userAgents = JSON.parse(localStorage.getItem('userAgents') || '{}');
        
        if (userAgents[agentName]) {
            console.log('ℹ️ Code Help Agent already exists:', agentName);
            console.log('To update it, delete it first or use updateUserAgent()');
            return false;
        }
        
        userAgents[agentName] = agentConfig;
        localStorage.setItem('userAgents', JSON.stringify(userAgents));
        
        console.log('✅ Code Help Agent created successfully!');
        console.log('Agent name:', agentName);
        console.log('📍 Go to Modelverse → User Agents tab → Click "Try" to use it');
        
        // If on modelverse page, refresh the table
        if (typeof generateUserAgentsTable === 'function') {
            generateUserAgentsTable();
            console.log('🔄 User Agents table refreshed');
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error creating Code Help Agent:', error);
        return false;
    }
})();

