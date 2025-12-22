console.log('🚀 Starting Intelligence Cubed Homepage Server...');
console.log('📦 Loading dependencies...');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

console.log('✅ Dependencies loaded successfully');

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`🔧 Server configuration: PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'development'}`);

// Enable CORS
app.use(cors());

// Parse JSON request bodies
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// API routes
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Intelligence Cubed Homepage Server is running',
    timestamp: new Date().toISOString()
  });
});

// API for paginated model data loading
app.get('/api/models', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'totalScore';
    
    // Dynamically load model-data.js to get data
    const modelDataPath = path.join(__dirname, 'model-data.js');
    // Use require for CommonJS since we removed ES module exports
    delete require.cache[require.resolve(modelDataPath)];
    const modelDataModule = require(modelDataPath);
    
    // Get model data
    const models = Object.entries(modelDataModule.MODEL_DATA).map(([name, data]) => ({
      name,
      ...data
    }));
    
    // Sort
    models.sort((a, b) => b[sortBy] - a[sortBy]);
    
    // Paginate
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedModels = models.slice(startIndex, endIndex);
    
    res.json({
      models: paginatedModels,
      pagination: {
        page,
        limit,
        total: models.length,
        totalPages: Math.ceil(models.length / limit),
        hasNext: endIndex < models.length,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error loading models:', error);
    res.status(500).json({ error: 'Failed to load models' });
  }
});

// API for getting model statistics
app.get('/api/models/stats', (req, res) => {
  try {
    const modelDataPath = path.join(__dirname, 'model-data.js');
    // Use require for CommonJS since we removed ES module exports
    delete require.cache[require.resolve(modelDataPath)];
    const modelDataModule = require(modelDataPath);
    
    const totalModels = Object.keys(modelDataModule.MODEL_DATA).length;
    
    res.json({
      totalModels,
      categories: [...new Set(Object.values(modelDataModule.MODEL_DATA).map(m => m.category))],
      industries: [...new Set(Object.values(modelDataModule.MODEL_DATA).map(m => m.industry))]
    });
  } catch (error) {
    console.error('Error loading model stats:', error);
    res.status(500).json({ error: 'Failed to load model stats' });
  }
});

// Query user agents from Firestore
// User agents are stored in Firestore collection: models/{modelId}
// where source: "user" OR ownerAddress != null
// NOTE: AlloyDB is only for knowledge chunks (RAG), NOT for user agents!

let userAgentsFirestore = null;
try {
  userAgentsFirestore = require('./src/user-agents-firestore.js');
  userAgentsFirestore.initializeFirestore();
  if (userAgentsFirestore.isFirestoreConfigured()) {
    console.log('✅ User Agents Firestore helper loaded');
  } else {
    console.log('⚠️ Firestore Admin not initialized. Set GOOGLE_APPLICATION_CREDENTIALS or run on GCP.');
  }
} catch (error) {
  console.warn('⚠️ User Agents Firestore helper not available:', error.message);
}

// Initialize AlloyDB connection for RAG queries
let alloydb = null;
try {
  alloydb = require('./src/alloydb-connection.js');
  
  // Try public IP connection first (if set), otherwise try Auth Proxy
  const publicIP = process.env.ALLOYDB_PUBLIC_IP || process.env.ALLOYDB_HOST;
  const useAlloyDBAuthProxy = process.env.USE_ALLOYDB_AUTH_PROXY === 'true';
  
  if (publicIP) {
    // Use direct connection via public IP
    alloydb.initializeAlloyDB({ host: publicIP });
    console.log(`🔌 Connecting to AlloyDB via public IP: ${publicIP}`);
  } else if (useAlloyDBAuthProxy) {
    // Use AlloyDB Auth Proxy
    alloydb.initializeAlloyDB({ useAlloyDBAuthProxy });
    console.log('🔌 Connecting to AlloyDB via Auth Proxy');
  } else {
    // Try to auto-detect (will use public IP if available)
    alloydb.initializeAlloyDB();
  }
  
  // Check connection status (async, so we check after a brief delay)
  setTimeout(() => {
    if (alloydb.isAlloyDBConnected()) {
      console.log('✅ AlloyDB connection initialized');
    } else {
      console.log('⚠️ AlloyDB not connected. Set ALLOYDB_PUBLIC_IP or USE_ALLOYDB_AUTH_PROXY=true');
      if (!publicIP && !useAlloyDBAuthProxy) {
        console.log('   Option 1: Set ALLOYDB_PUBLIC_IP=35.239.188.129 for direct connection');
        console.log('   Option 2: Set USE_ALLOYDB_AUTH_PROXY=true and start the proxy');
      }
    }
  }, 1000);
} catch (error) {
  console.warn('⚠️ AlloyDB connection not available:', error.message);
  console.warn('   To enable: Set ALLOYDB_PUBLIC_IP or USE_ALLOYDB_AUTH_PROXY=true');
}

app.get('/api/user-agents', async (req, res) => {
  try {
    const { name, ownerAddress, publicOnly } = req.query;
    
    console.log('🔍 Querying Firestore for user agents', {
      name: name || 'all',
      ownerAddress: ownerAddress || 'all',
      publicOnly: publicOnly === 'true'
    });
    
    if (!userAgentsFirestore || !userAgentsFirestore.isFirestoreConfigured()) {
      return res.json({
        success: true,
        agents: [],
        message: 'Firestore not initialized. Please set GOOGLE_APPLICATION_CREDENTIALS environment variable or run on GCP with application default credentials.'
      });
    }
    
    // Build query options per PDF spec
    const options = {};
    if (ownerAddress) {
      options.ownerAddress = ownerAddress; // Filter by wallet address
    }
    if (publicOnly === 'true') {
      options.publicOnly = true; // Only public models
    }
    
    // Get user agents from Firestore (per PDF: source: "user")
    const agents = await userAgentsFirestore.listUserAgents(options);
    
    // Filter by name if provided (client-side filter for name matching)
    let filteredAgents = agents;
    if (name) {
      filteredAgents = agents.filter(agent => 
        agent.name && agent.name.toLowerCase().includes(name.toLowerCase())
      );
    }
    
    res.json({
      success: true,
      agents: filteredAgents,
      total: filteredAgents.length
    });
    
  } catch (error) {
    console.error('❌ Error querying Firestore for user agents:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to query user agents from Firestore',
      message: error.message 
    });
  }
});

// Get a single user agent by name
app.get('/api/user-agents/:name', async (req, res) => {
  try {
    const { name } = req.params;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Agent name is required'
      });
    }
    
    console.log('🔍 Querying Firestore for user agent:', name);
    
    if (!userAgentsFirestore || !userAgentsFirestore.isFirestoreConfigured()) {
      return res.json({
        success: true,
        agent: null,
        message: 'Firestore not initialized. Please set GOOGLE_APPLICATION_CREDENTIALS environment variable or run on GCP with application default credentials.'
      });
    }
    
    // Get specific user agent by name from Firestore
    const agent = await userAgentsFirestore.getUserAgentByName(name);
    
    if (!agent) {
      return res.status(404).json({
        success: false,
        error: 'User agent not found',
        agent: null
      });
    }
    
    res.json({
      success: true,
      agent: agent
    });
    
  } catch (error) {
    console.error('❌ Error querying Firestore for user agent:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to query user agent from Firestore',
      message: error.message 
    });
  }
});

// Embeddings proxy API
//Returns embedding vector of input string and embedding model ("i3-embedding" or "i3-embedding-large")
app.post('/api/embeddings', async (req, res) => {
  try {
    const { model = 'i3-embedding', input } = req.body;
    const apiKey = req.headers['i3-api-key'] || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
    
    if (!input) {
      return res.status(400).json({ error: 'Input text is required' });
    }
    
    console.log('🔍 Proxying embeddings request:', { model, inputLength: input.length });
    
    const response = await fetch('http://34.71.119.178:8000/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'I3-API-Key': apiKey
      },
      body: JSON.stringify({ model, input })
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ Embeddings API error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText || 'Embeddings API error' });
    }
    
    const data = await response.json();
    console.log('✅ Embeddings response received');
    res.json(data);
    
  } catch (error) {
    console.error('❌ Embeddings proxy error:', error);
    res.status(500).json({ error: 'Failed to get embeddings' });
  }
});

// Helper: Check if model is a user agent
function isUserAgent(modelName) {
  if (!modelName) return false;
  
  // Check if model name starts with user/agent prefix
  if (modelName.startsWith('user-') || modelName.startsWith('agent-')) return true;
  
  // Check if model exists in MODEL_DATA (if not, likely a user agent)
  try {
    const modelDataPath = path.join(__dirname, 'model-data.js');
    delete require.cache[require.resolve(modelDataPath)];
    const modelDataModule = require(modelDataPath);
    if (!modelDataModule.MODEL_DATA || !modelDataModule.MODEL_DATA[modelName]) {
      // Not in MODEL_DATA, likely a user agent
      return true;
    }
    // Check if it has isUserAgent flag
    if (modelDataModule.MODEL_DATA[modelName].isUserAgent === true) {
      return true;
    }
  } catch (e) {
    console.warn('Error checking MODEL_DATA:', e);
  }
  
  return false;
}

// ============================================================================
// GEMINI CODE (COMMENTED OUT - Now using I3 API/AutoRouter as backend)
// ============================================================================
/*
// Helper: Check if Gemini test mode is enabled
function isGeminiTestMode() {
  // Check environment variable first
  if (process.env.GEMINI_TEST_MODE === 'true' || process.env.GEMINI_TEST_MODE === '1') {
    return true;
  }
  
  // Check config.js
  try {
    const configPath = path.join(__dirname, 'config.js');
    delete require.cache[require.resolve(configPath)];
    const config = require(configPath);
    return config.gemini?.testMode === true;
  } catch (e) {
    return false;
  }
}

// Helper: Generate mock Gemini response for testing
function generateMockGeminiResponse(userMessage, systemInstruction, stream = false) {
  const mockResponse = `This is a test response from the mock Gemini API. You said: "${userMessage}". In test mode, we bypass the real Gemini API to avoid quota limits.`;
  
  if (stream) {
    // Return a mock streaming response
    return {
      stream: true,
      generate: function* () {
        // Simulate streaming by chunking the response
        const chunks = mockResponse.match(/.{1,10}/g) || [mockResponse];
        for (const chunk of chunks) {
          yield JSON.stringify({
            candidates: [{
              content: {
                parts: [{ text: chunk }]
              },
              finishReason: null
            }]
          }) + '\n';
        }
        // Final chunk
        yield JSON.stringify({
          candidates: [{
            content: {
              parts: [{ text: '' }]
            },
            finishReason: 'STOP'
          }]
        }) + '\n';
      }
    };
  } else {
    // Return a mock non-streaming response
    return {
      candidates: [{
        content: {
          parts: [{ text: mockResponse }]
        },
        finishReason: 'STOP'
      }],
      usageMetadata: {
        promptTokenCount: 10,
        candidatesTokenCount: 20,
        totalTokenCount: 30
      }
    };
  }
}

// Helper: Get Gemini API key
function getGeminiApiKey() {
  // Try from config.js
  try {
    const configPath = path.join(__dirname, 'config.js');
    delete require.cache[require.resolve(configPath)];
    const config = require(configPath);
    if (config.gemini && config.gemini.apiKey) {
      return config.gemini.apiKey;
    }
  } catch (e) {
    console.warn('Error loading config:', e);
  }
  
  // Try from environment variable
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }
  
  return null;
}
*/

// Helper: Transform OpenAI format to Gemini format
/*
function transformToGeminiFormat(messages, systemInstruction = null) {
  const contents = [];
  let systemParts = [];
  
  // Extract system message if present
  const systemMessages = messages.filter(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system');
  
  if (systemMessages.length > 0) {
    systemParts = systemMessages.map(m => {
      if (typeof m.content === 'string') {
        return { text: m.content };
      }
      // Handle array content (text + images)
      return Array.isArray(m.content) ? m.content : { text: String(m.content) };
    });
  }
  
  if (systemInstruction) {
    systemParts.push({ text: systemInstruction });
  }
  
  // Process user/assistant messages
  let currentRole = null;
  let currentParts = [];
  
  userMessages.forEach(msg => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    
    if (role !== currentRole && currentParts.length > 0) {
      contents.push({ role: currentRole, parts: currentParts });
      currentParts = [];
    }
    
    currentRole = role;
    
    if (typeof msg.content === 'string') {
      currentParts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      // Handle multimodal content (text + images)
      msg.content.forEach(part => {
        if (part.type === 'text') {
          currentParts.push({ text: part.text || '' });
        } else if (part.type === 'image_url' && part.image_url) {
          // Convert data URL to base64
          const dataUrl = part.image_url.url || part.image_url;
          if (dataUrl.startsWith('data:')) {
            const [header, base64Data] = dataUrl.split(',');
            const mimeMatch = header.match(/data:([^;]+)/);
            const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
            
            currentParts.push({
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            });
          }
        }
      });
    } else {
      currentParts.push({ text: String(msg.content) });
    }
  });
  
  if (currentParts.length > 0) {
    contents.push({ role: currentRole, parts: currentParts });
  }
  
  const requestBody = {
    contents: contents
  };
  
  if (systemParts.length > 0) {
    requestBody.systemInstruction = {
      parts: systemParts
    };
  }
  
  return requestBody;
}
*/

// Helper: Transform Gemini response to OpenAI format
/*
function transformFromGeminiFormat(geminiResponse, modelName) {
  const choices = [];
  
  if (geminiResponse.candidates && geminiResponse.candidates.length > 0) {
    const candidate = geminiResponse.candidates[0];
    if (candidate.content && candidate.content.parts) {
      const text = candidate.content.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('');
      
      choices.push({
        index: 0,
        message: {
          role: 'assistant',
          content: text
        },
        finish_reason: candidate.finishReason || 'stop'
      });
    }
  }
  
  return {
    id: `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName || 'gemini-1.5-pro',
    choices: choices,
    usage: geminiResponse.usageMetadata ? {
      prompt_tokens: geminiResponse.usageMetadata.promptTokenCount || 0,
      completion_tokens: geminiResponse.usageMetadata.candidatesTokenCount || 0,
      total_tokens: geminiResponse.usageMetadata.totalTokenCount || 0
    } : null
  };
}
*/
// ============================================================================
// END OF GEMINI CODE
// ============================================================================

// Chat completions proxy API
app.post('/api/chat/completions', async (req, res) => {
  try {
    const { model, messages, stream, systemInstruction } = req.body;
    const apiKey = req.headers['i3-api-key'] || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
    
    // Check test mode from header (frontend toggle)
    // Express normalizes headers to lowercase
    const testModeHeader = req.headers['x-test-mode'] || req.headers['X-Test-Mode'];
    const testModeFromHeader = testModeHeader === 'true';
    // Note: isGeminiTestMode() is commented out - now using I3 API/AutoRouter
    // const testModeFromConfig = isGeminiTestMode();
    const isTestMode = testModeFromHeader; // Removed Gemini test mode check
    
    console.log('🚀 Processing chat completions request for model:', model, '| Test mode:', { header: testModeHeader, fromHeader: testModeFromHeader, isTestMode });
    
    // ============================================================================
    // OLD CODE: User agent routing to Gemini API (COMMENTED OUT - can restore later)
    // ============================================================================
    /*
    // Check if this is a user agent - route to Gemini
    if (isUserAgent(model)) {
      console.log('🤖 Detected user agent, routing to Gemini API');
      
      // Log test mode status (but still call real Gemini API)
      if (isTestMode) {
        console.log('🧪 TEST MODE: Calling real Gemini API (coin/payment constraints bypassed on frontend)');
      }
      
      const geminiApiKey = getGeminiApiKey();
      if (!geminiApiKey) {
        return res.status(500).json({ 
          error: 'Gemini API key not configured. Please set GEMINI_API_KEY environment variable or add it to config.js' 
        });
      }
      
      // Get Gemini model name (from config or env, default to gemini-2.0-flash)
      let geminiModel = process.env.GEMINI_MODEL;
      if (!geminiModel) {
        try {
          const configPath = path.join(__dirname, 'config.js');
          delete require.cache[require.resolve(configPath)];
          const config = require(configPath);
          geminiModel = config.gemini?.model || 'gemini-2.0-flash';
        } catch (e) {
          geminiModel = 'gemini-2.0-flash';
        }
      }
      
      // Remove 'models/' prefix if present (API expects just the model name)
      geminiModel = geminiModel.replace(/^models\//, '');
      
      // Transform OpenAI format to Gemini format
      const geminiRequest = transformToGeminiFormat(messages, systemInstruction);
      
      // Call Gemini API
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;
      
      if (stream) {
        // For streaming, use streamGenerateContent endpoint
        // Remove 'models/' prefix if present
        const streamModel = geminiModel.replace(/^models\//, '');
        const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${streamModel}:streamGenerateContent?key=${geminiApiKey}`;
        
        const geminiResponse = await fetch(streamUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(geminiRequest)
        });
        
        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text().catch(() => '');
          console.error('❌ Gemini API error:', geminiResponse.status, errorText);
          
          // Parse error for better user message
          let errorMessage = 'Gemini API error';
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              if (errorJson.error.code === 429 || errorJson.error.status === 'RESOURCE_EXHAUSTED') {
                errorMessage = 'Gemini API quota exceeded. The free tier quota has been exhausted. Please:\n' +
                  '1. Check your quota at https://ai.dev/usage?tab=rate-limit\n' +
                  '2. Enable billing in Google Cloud Console to increase limits\n' +
                  '3. Wait for the quota to reset (usually daily)\n' +
                  '4. Or use a different API key with available quota';
              } else {
                errorMessage = errorJson.error.message || errorMessage;
              }
            }
          } catch (e) {
            // If parsing fails, use the raw error text
            errorMessage = errorText || errorMessage;
          }
          
          return res.status(geminiResponse.status).json({ error: errorMessage });
        }
        
        // Transform Gemini streaming response to OpenAI SSE format
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // node-fetch v2: response.body is a Node.js stream, not a ReadableStream with getReader()
        const stream = geminiResponse.body;
        let buffer = '';
        let fullText = '';
        let hasSentData = false;
        
        // Helper function to check if a string is a complete JSON object
        function isCompleteJSON(str) {
          const trimmed = str.trim();
          if (!trimmed.startsWith('{')) return false;
          
          let depth = 0;
          let inString = false;
          let escapeNext = false;
          
          for (let i = 0; i < trimmed.length; i++) {
            const char = trimmed[i];
            
            if (escapeNext) {
              escapeNext = false;
              continue;
            }
            
            if (char === '\\') {
              escapeNext = true;
              continue;
            }
            
            if (char === '"') {
              inString = !inString;
              continue;
            }
            
            if (inString) continue;
            
            if (char === '{') depth++;
            if (char === '}') {
              depth--;
              if (depth === 0) {
                // Found the end of the root object
                return true;
              }
            }
          }
          
          return false;
        }
        
        stream.on('data', (chunk) => {
          const chunkStr = chunk.toString('utf-8');
          buffer += chunkStr;
          
          // Gemini streaming returns newline-delimited JSON objects
          // But each JSON object can span multiple lines
          // We need to find complete JSON objects (not just complete lines)
          // Process all complete JSON objects in the buffer
          while (true) {
            // Find the start of a JSON object
            const jsonStart = buffer.indexOf('{');
            if (jsonStart === -1) break; // No JSON object found
            
            // Remove any content before the JSON object
            if (jsonStart > 0) {
              buffer = buffer.substring(jsonStart);
            }
            
            // Check if we have a complete JSON object
            if (!isCompleteJSON(buffer)) {
              // Not complete yet, wait for more data
              break;
            }
            
            // Find the end of the complete JSON object
            let depth = 0;
            let inString = false;
            let escapeNext = false;
            let jsonEnd = -1;
            
            for (let i = 0; i < buffer.length; i++) {
              const char = buffer[i];
              
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                escapeNext = true;
                continue;
              }
              
              if (char === '"') {
                inString = !inString;
                continue;
              }
              
              if (inString) continue;
              
              if (char === '{') depth++;
              if (char === '}') {
                depth--;
                if (depth === 0) {
                  jsonEnd = i + 1;
                  break;
                }
              }
            }
            
            if (jsonEnd === -1) {
              // Didn't find complete JSON, wait for more
              break;
            }
            
            // Extract the complete JSON object
            const jsonStr = buffer.substring(0, jsonEnd);
            // Remove the JSON object and any trailing newline from buffer
            buffer = buffer.substring(jsonEnd).replace(/^\n+/, '');
            
            try {
              const geminiChunk = JSON.parse(jsonStr);
              
              if (geminiChunk.candidates && geminiChunk.candidates[0]) {
                const candidate = geminiChunk.candidates[0];
                
                // Handle errors from Gemini
                if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'RECITATION') {
                  console.warn('⚠️ Gemini safety/recitation filter triggered');
                  const errorChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [{
                      index: 0,
                      delta: { content: '\n\n[Response blocked by safety filters]' },
                      finish_reason: candidate.finishReason
                    }]
                  };
                  res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
                  hasSentData = true;
                  continue;
                }
                
                if (candidate.content && candidate.content.parts) {
                  const parts = candidate.content.parts || [];
                  // Join parts - Gemini should already include proper spacing in text
                  const newText = parts.filter(p => p.text).map(p => p.text).join('');
                  
                  // State reconciliation: Extract delta safely, with defensive checks
                  if (newText && newText !== fullText) {
                    const oldFullText = fullText; // Save for logging
                    let delta = '';
                    
                    // Defensive delta extraction: ensure we never skip characters
                    if (newText.length >= fullText.length) {
                      // Normal case: newText extends fullText
                      // Verify that newText starts with fullText (safety check)
                      if (newText.startsWith(fullText)) {
                        delta = newText.slice(fullText.length);
                      } else {
                        // Text doesn't match - this shouldn't happen, but handle gracefully
                        // Find the longest common prefix to avoid losing characters
                        let commonPrefixLength = 0;
                        const minLen = Math.min(fullText.length, newText.length);
                        for (let i = 0; i < minLen; i++) {
                          if (fullText[i] === newText[i]) {
                            commonPrefixLength++;
                          } else {
                            break;
                          }
                        }
                        // Send everything after the common prefix
                        delta = newText.slice(commonPrefixLength);
                        console.warn('⚠️ Text mismatch detected, using common prefix', {
                          oldFullTextLen: oldFullText.length,
                          newTextLen: newText.length,
                          commonPrefixLen: commonPrefixLength,
                          oldFullTextEnd: oldFullText.substring(Math.max(0, oldFullText.length - 30)),
                          newTextStart: newText.substring(0, 30),
                          delta: delta.substring(0, 50)
                        });
                      }
                    } else {
                      // Text decreased - Gemini reset the response
                      // Send the full new text as delta
                      delta = newText;
                      const oldLength = oldFullText.length;
                      console.warn('⚠️ Gemini text length decreased, resetting fullText', {
                        oldLength: oldLength,
                        newLength: newText.length,
                        oldTextEnd: oldFullText.substring(Math.max(0, oldLength - 30)),
                        newTextStart: newText.substring(0, 30)
                      });
                    }
                    
                    // Validate delta BEFORE updating fullText (only if text increased)
                    if (delta && delta.length > 0 && newText.length >= oldFullText.length) {
                      const expectedNewText = oldFullText + delta;
                      if (expectedNewText !== newText) {
                        console.warn('⚠️ Delta validation failed - oldFullText + delta != newText', {
                          oldFullTextLen: oldFullText.length,
                          deltaLen: delta.length,
                          newTextLen: newText.length,
                          expectedLen: expectedNewText.length,
                          oldFullTextEnd: oldFullText.substring(Math.max(0, oldFullText.length - 20)),
                          deltaStart: delta.substring(0, 20),
                          newTextStart: newText.substring(0, 40),
                          expectedStart: expectedNewText.substring(0, 40)
                        });
                        // Fix: recalculate delta correctly
                        if (newText.startsWith(oldFullText)) {
                          delta = newText.slice(oldFullText.length);
                        } else {
                          // Fallback: find common prefix and send remainder
                          let commonPrefixLength = 0;
                          const minLen = Math.min(oldFullText.length, newText.length);
                          for (let i = 0; i < minLen; i++) {
                            if (oldFullText[i] === newText[i]) {
                              commonPrefixLength++;
                            } else {
                              break;
                            }
                          }
                          delta = newText.slice(commonPrefixLength);
                          console.warn('⚠️ Recalculated delta using common prefix', {
                            commonPrefixLen: commonPrefixLength,
                            newDelta: delta.substring(0, 30)
                          });
                        }
                      }
                    }
                    
                    // Update fullText after validation/fixing
                    fullText = newText;
                    
                    // Send delta if non-empty
                    if (delta && delta.length > 0) {
                      const openAIChunk = {
                        id: `chatcmpl-${Date.now()}`,
                        object: 'chat.completion.chunk',
                        created: Math.floor(Date.now() / 1000),
                        model: model,
                        choices: [{
                          index: 0,
                          delta: { content: delta },
                          finish_reason: null
                        }]
                      };
                      
                      res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                      hasSentData = true;
                    } else if (newText !== fullText) {
                      // Log if we have newText but no delta (shouldn't happen)
                      console.warn('⚠️ newText differs from fullText but delta is empty', {
                        fullTextLen: fullText.length,
                        newTextLen: newText.length,
                        fullTextEnd: fullText.substring(Math.max(0, fullText.length - 30)),
                        newTextStart: newText.substring(0, 30)
                      });
                    }
                  }
                }
                
                // Check if finished
                if (candidate.finishReason && candidate.finishReason !== 'STOP') {
                  const finalChunk = {
                    id: `chatcmpl-${Date.now()}`,
                    object: 'chat.completion.chunk',
                    created: Math.floor(Date.now() / 1000),
                    model: model,
                    choices: [{
                      index: 0,
                      delta: {},
                      finish_reason: candidate.finishReason
                    }]
                  };
                  res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                }
              } else {
                // No candidates - might be an error or empty response
                if (!hasSentData) {
                  console.warn('⚠️ Gemini chunk has no candidates:', JSON.stringify(geminiChunk).substring(0, 200));
                }
              }
            } catch (e) {
              // If JSON parsing fails, it might be incomplete - put back in buffer
              if (trimmed.length > 10) {
                buffer = line + '\n' + buffer;
                break;
              }
            }
          }
        });
        
        stream.on('end', () => {
          // Process any remaining buffer
          const trimmed = buffer.trim();
          if (trimmed && trimmed.startsWith('{')) {
            try {
              // Try to extract complete JSON objects from the buffer
              // Look for complete JSON objects (balanced braces)
              let jsonStart = trimmed.indexOf('{');
              if (jsonStart !== -1) {
                let depth = 0;
                let inString = false;
                let escapeNext = false;
                let jsonEnd = -1;
                
                for (let i = jsonStart; i < trimmed.length; i++) {
                  const char = trimmed[i];
                  
                  if (escapeNext) {
                    escapeNext = false;
                    continue;
                  }
                  
                  if (char === '\\') {
                    escapeNext = true;
                    continue;
                  }
                  
                  if (char === '"') {
                    inString = !inString;
                    continue;
                  }
                  
                  if (inString) continue;
                  
                  if (char === '{') depth++;
                  if (char === '}') {
                    depth--;
                    if (depth === 0) {
                      jsonEnd = i;
                      break;
                    }
                  }
                }
                
                if (jsonEnd !== -1) {
                  const jsonStr = trimmed.substring(jsonStart, jsonEnd + 1);
                  const geminiChunk = JSON.parse(jsonStr);
                  
                  if (geminiChunk.candidates && geminiChunk.candidates[0] && geminiChunk.candidates[0].content) {
                    const parts = geminiChunk.candidates[0].content.parts || [];
                    const text = parts.filter(p => p.text).map(p => p.text).join('');
                    if (text && text.length > fullText.length) {
                      const delta = text.slice(fullText.length);
                      if (delta) {
                        const openAIChunk = {
                          id: `chatcmpl-${Date.now()}`,
                          object: 'chat.completion.chunk',
                          created: Math.floor(Date.now() / 1000),
                          model: model,
                          choices: [{
                            index: 0,
                            delta: { content: delta },
                            finish_reason: geminiChunk.candidates[0].finishReason || 'stop'
                          }]
                        };
                        res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                        hasSentData = true;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              if (!hasSentData) {
                console.warn('⚠️ Failed to parse final buffer:', e.message, 'Buffer preview:', trimmed.substring(0, 200));
              }
            }
          }
          
          // Send final [DONE] message
          res.write('data: [DONE]\n\n');
          res.end();
        });
        
        stream.on('error', (error) => {
          console.error('❌ Stream error:', error);
          res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
          res.end();
        });
        
      } else {
        // Non-streaming request
        const geminiResponse = await fetch(geminiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(geminiRequest)
        });
        
        if (!geminiResponse.ok) {
          const errorText = await geminiResponse.text().catch(() => '');
          console.error('❌ Gemini API error:', geminiResponse.status, errorText);
          
          // Parse error for better user message
          let errorMessage = 'Gemini API error';
          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error) {
              if (errorJson.error.code === 429 || errorJson.error.status === 'RESOURCE_EXHAUSTED') {
                errorMessage = 'Gemini API quota exceeded. The free tier quota has been exhausted. Please:\n' +
                  '1. Check your quota at https://ai.dev/usage?tab=rate-limit\n' +
                  '2. Enable billing in Google Cloud Console to increase limits\n' +
                  '3. Wait for the quota to reset (usually daily)\n' +
                  '4. Or use a different API key with available quota';
              } else {
                errorMessage = errorJson.error.message || errorMessage;
              }
            }
          } catch (e) {
            // If parsing fails, use the raw error text
            errorMessage = errorText || errorMessage;
          }
          
          return res.status(geminiResponse.status).json({ error: errorMessage });
        }
        
        const geminiData = await geminiResponse.json();
        const openAIResponse = transformFromGeminiFormat(geminiData, model);
        res.json(openAIResponse);
      }
      
      return;
    }
    */
    // ============================================================================
    // END OF OLD CODE
    // ============================================================================
    
    // Route all models (including user agents) to I3 API
    // Try to get modelId from Firestore if this is a user agent
    let agentModelId = null;
    if (isUserAgent(model)) {
      console.log('🤖 Detected user agent, querying Firestore for modelId...');
      
      // Query Firestore to get the agent's modelId
      // If anything fails (not found, missing modelId, query error, Firestore not configured),
      // just treat it as a regular model and route to I3 API
      if (userAgentsFirestore && userAgentsFirestore.isFirestoreConfigured()) {
        try {
          const agent = await userAgentsFirestore.getUserAgentByName(model); //getUserAgentByName is imported from user-agents-firestore.js
          if (agent && agent.modelId) {
            agentModelId = agent.modelId;
            console.log(`✅ Found user agent in Firestore: ${model} → modelId: ${agentModelId}`);
            console.log(`   Purpose: ${agent.purpose || 'N/A'}`);
            console.log(`   Use Case: ${agent.useCase || 'N/A'}`);
            
            // RAG: Retrieve relevant knowledge chunks from AlloyDB
            if (alloydb && alloydb.isAlloyDBConnected()) {
              try {
                // Extract last user message for embedding
                const userMessages = messages.filter(m => m.role === 'user');
                const lastUserMessage = userMessages.length > 0 
                  ? (typeof userMessages[userMessages.length - 1].content === 'string' 
                      ? userMessages[userMessages.length - 1].content 
                      : JSON.stringify(userMessages[userMessages.length - 1].content))
                  : null;
                
                if (lastUserMessage) {
                  console.log('🔍 Generating embedding for user query...');
                  
                  // Generate embedding for user query using I3 API
                  const apiKey = req.headers['i3-api-key'] || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
                  const embeddingResponse = await fetch('http://34.71.119.178:8000/embeddings', {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      'I3-API-Key': apiKey
                    },
                    body: JSON.stringify({ 
                      model: 'i3-embedding', 
                      input: lastUserMessage 
                    })
                  });
                  
                  if (embeddingResponse.ok) {
                    const embeddingData = await embeddingResponse.json();
                    let queryEmbedding = embeddingData.data?.[0]?.embedding;
                    
                    if (queryEmbedding && Array.isArray(queryEmbedding)) {
                      console.log(`✅ Generated query embedding (dimension: ${queryEmbedding.length})`);
                      
                      // Truncate to 768 dimensions if needed (to match stored chunks in AlloyDB)
                      if (queryEmbedding.length > 768) {
                        console.log(`⚠️ Truncating query embedding from ${queryEmbedding.length} to 768 dimensions for schema compatibility`);
                        queryEmbedding = queryEmbedding.slice(0, 768);
                      }
                      
                      // Search AlloyDB for similar chunks using cosine similarity
                      const similarChunks = await alloydb.searchSimilarChunks(
                        agentModelId, 
                        queryEmbedding, 
                        { limit: 5 }
                      );
                      
                      if (similarChunks && similarChunks.length > 0) {
                        console.log(`📚 Retrieved ${similarChunks.length} relevant knowledge chunks`);
                        
                        // Format chunks for system instruction
                        const chunksText = similarChunks
                          .map((chunk, idx) => `[Knowledge Chunk ${idx + 1}]\n${chunk.content}`)
                          .join('\n\n');
                        
                        // Add chunks to system instruction
                        const ragContext = `\n\n=== Relevant Knowledge Base Context ===\n${chunksText}\n=== End of Knowledge Base Context ===\n`;
                        
                        // Update system instruction with RAG context
                        if (systemInstruction) {
                          req.body.systemInstruction = systemInstruction + ragContext;
                        } else {
                          req.body.systemInstruction = ragContext;
                        }
                        
                        console.log(`✅ Added ${similarChunks.length} knowledge chunks to system instruction`);
                      } else {
                        console.log('⚠️ No similar chunks found in knowledge base');
                      }
                    } else {
                      console.warn('⚠️ Invalid embedding format received');
                    }
                  } else {
                    console.warn('⚠️ Failed to generate embedding, continuing without RAG context');
                  }
                } else {
                  console.log('⚠️ No user message found, skipping RAG');
                }
              } catch (error) {
                console.warn(`⚠️ Error during RAG retrieval: ${error.message} - continuing without RAG context`);
              }
            } else {
              console.warn('⚠️ AlloyDB not connected - skipping RAG retrieval');
            }
          } else {
            console.warn(`⚠️ User agent "${model}" not found in Firestore or missing modelId - routing as regular model`);
          }
        } catch (error) {
          console.warn(`⚠️ Error querying Firestore for user agent "${model}": ${error.message} - routing as regular model`);
        }
      } else {
        console.warn(`⚠️ Firestore not configured - routing user agent "${model}" as regular model`);
      }
    }
    
    console.log('📡 Routing to I3 API');
    
    const response = await fetch('http://34.71.119.178:8000/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'I3-API-Key': apiKey
      },
      body: JSON.stringify(req.body)
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('❌ Chat completions API error:', response.status, errorText);
      return res.status(response.status).json({ error: errorText || 'Chat completions API error' });
    }
    
    // For streaming responses, pipe the response
    if (req.body.stream) {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      // Pipe the response stream directly
      response.body.pipe(res);
    } else {
      const data = await response.json();
      res.json(data);
    }
    
  } catch (error) {
    console.error('❌ Chat completions proxy error:', error);
    res.status(500).json({ error: 'Failed to get chat completions: ' + error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    message: 'The requested resource was not found'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: 'Something went wrong!'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Intelligence Cubed Homepage Server is running on port ${PORT}`);
  console.log(`📱 Local: http://localhost:${PORT}`);
  console.log(`📊 API: http://localhost:${PORT}/api/models`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Node version: ${process.version}`);
}).on('error', (err) => {
  console.error('❌ Server failed to start:', err);
  process.exit(1);
}); 