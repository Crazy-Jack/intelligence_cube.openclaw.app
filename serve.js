console.log('🚀 Starting Intelligence Cubed Homepage Server...');
console.log('📦 Loading dependencies...');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');

console.log('✅ Dependencies loaded successfully');

const app = express();
const PORT = process.env.PORT || 3001;

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

// 新增：分页加载模型数据的API
app.get('/api/models', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const sortBy = req.query.sortBy || 'totalScore';
    
    // 动态加载 model-data.js 来获取数据
    const modelDataPath = path.join(__dirname, 'model-data.js');
    // Use require for CommonJS since we removed ES module exports
    delete require.cache[require.resolve(modelDataPath)];
    const modelDataModule = require(modelDataPath);
    
    // 获取模型数据
    const models = Object.entries(modelDataModule.MODEL_DATA).map(([name, data]) => ({
      name,
      ...data
    }));
    
    // 排序
    models.sort((a, b) => b[sortBy] - a[sortBy]);
    
    // 分页
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

// 新增：获取模型统计信息的API
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

// 新增：嵌入向量代理API
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

// Helper: Transform OpenAI format to Gemini format
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

// Helper: Transform Gemini response to OpenAI format
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

// 新增：聊天完成代理API
app.post('/api/chat/completions', async (req, res) => {
  try {
    const { model, messages, stream, systemInstruction } = req.body;
    const apiKey = req.headers['i3-api-key'] || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
    
    // Check test mode from header (frontend toggle) first, then config
    const testModeHeader = req.headers['x-test-mode'];
    const testModeFromHeader = testModeHeader === 'true';
    const testModeFromConfig = isGeminiTestMode();
    const isTestMode = testModeFromHeader || testModeFromConfig;
    
    console.log('🚀 Processing chat completions request for model:', model);
    
    // Check if this is a user agent - route to Gemini
    if (isUserAgent(model)) {
      console.log('🤖 Detected user agent, routing to Gemini API');
      
      // Check if test mode is enabled (from header or config)
      if (isTestMode) {
        console.log('🧪 TEST MODE: Using mock Gemini responses (bypassing API to avoid quota limits)');
        
        // Extract user message for mock response
        const userMessages = messages.filter(m => m.role === 'user');
        const lastUserMessage = userMessages[userMessages.length - 1];
        const userText = typeof lastUserMessage?.content === 'string' 
          ? lastUserMessage.content 
          : (Array.isArray(lastUserMessage?.content) 
              ? lastUserMessage.content.find(p => p.type === 'text')?.text || 'Hello'
              : 'Hello');
        
        if (stream) {
          // Mock streaming response
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          
          const mockResponse = `🧪 [TEST MODE] This is a mock response. You said: "${userText}". In test mode, we bypass the real Gemini API to avoid quota limits. The agent is working correctly!`;
          
          // Simulate streaming by sending chunks
          const chunks = mockResponse.match(/.{1,15}/g) || [mockResponse];
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isLast = i === chunks.length - 1;
            
            const openAIChunk = {
              id: `chatcmpl-${Date.now()}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: model,
              choices: [{
                index: 0,
                delta: { content: chunk },
                finish_reason: isLast ? 'stop' : null
              }]
            };
            
            res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
            
            // Small delay to simulate streaming
            if (!isLast) {
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          
          res.write('data: [DONE]\n\n');
          return res.end();
        } else {
          // Mock non-streaming response
          const mockResponse = `🧪 [TEST MODE] This is a mock response. You said: "${userText}". In test mode, we bypass the real Gemini API to avoid quota limits. The agent is working correctly!`;
          
          const openAIResponse = {
            id: `chatcmpl-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: mockResponse
              },
              finish_reason: 'stop'
            }],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 20,
              total_tokens: 30
            }
          };
          
          return res.json(openAIResponse);
        }
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
                  const newText = parts.filter(p => p.text).map(p => p.text).join('');
                  
                  if (newText && newText.length > fullText.length) {
                    // Only send the new delta
                    const delta = newText.slice(fullText.length);
                    fullText = newText;
                    
                    if (delta) {
                      // Transform to OpenAI SSE format
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
    
    // Not a user agent - route to I3 API (existing behavior)
    console.log('📡 Routing to I3 API for regular model');
    
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