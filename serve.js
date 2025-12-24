console.log('🚀 Starting Intelligence Cubed Homepage Server...');
console.log('📦 Loading dependencies...');

const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const { Storage } = require('@google-cloud/storage');
const { VertexAI } = require('@google-cloud/vertexai');
const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');
const { Pool } = require('pg');
const pdf = require('pdf-parse');
const fs = require('fs');
const { spawn } = require('child_process');
const { GoogleAuth } = require('google-auth-library');
const multer = require('multer');

console.log('✅ Dependencies loaded successfully');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    let credential;
    
    // Try service account key file first (if GOOGLE_APPLICATION_CREDENTIALS is set)
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('📝 Using service account key file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      credential = admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } else {
      // Fall back to application default credentials
      console.log('📝 Using application default credentials (gcloud)');
      credential = admin.credential.applicationDefault();
    }
    
    admin.initializeApp({
      credential: credential,
      projectId: 'i3-testnet'
    });
    
    // Initialize Firestore with named database 'i3-testnet'
    // Use the EXACT same method as the migration script: getFirestore() without parameters
    // Migration script: const db = getFirestore();
    // The migration script works, so we'll use the same approach
    let firestoreDb;
    let actualDatabaseId = '(default)';
    
    try {
      // Use getFirestore() exactly as in the migration script
      // This should connect to the named database if it's the project default
      // OR if environment variable FIRESTORE_DATABASE_ID is set
      firestoreDb = getFirestore(admin.app());
      
      // Check the actual database ID from the instance
      // This will be verified in the async check below
      actualDatabaseId = 'i3-testnet'; // We'll verify this is correct
      
      console.log('✅ Firebase Admin initialized');
      console.log('📝 Firestore: Using getFirestore() (same as migration script)');
      console.log('   Will verify actual database ID in async check...');
    } catch (dbError) {
      console.log('❌ ERROR: Could not initialize Firestore');
      console.log('   Error:', dbError.message);
      console.log('   Stack:', dbError.stack);
      throw dbError;
    }
    
    // Verify database connection asynchronously (non-blocking)
    // This will check the actual database ID and update our tracking
    (async () => {
      try {
        // First, check the database ID from the Firestore instance
        const verifiedDbId = firestoreDb._databaseId?.database || firestoreDb._settings?.databaseId || '(default)';
        
        console.log(`🔍 Database verification (async):`);
        console.log(`   Firestore instance _databaseId: ${firestoreDb._databaseId?.database || 'undefined'}`);
        console.log(`   Firestore instance _settings: ${JSON.stringify(firestoreDb._settings || {})}`);
        console.log(`   Detected Database ID: ${verifiedDbId}`);
        
        // If we're connected to default, immediately try to connect to named database
        if (verifiedDbId === '(default)' || verifiedDbId === 'default') {
          console.log('⚠️  Detected default database, attempting to connect to named database "i3-testnet"...');
          try {
            // Try to get a new instance with explicit database ID
            const namedDb = getFirestore(admin.app(), 'i3-testnet');
            
            // Test the connection by querying models collection
            const namedTestRef = namedDb.collection('models').limit(1);
            const namedTestSnapshot = await namedTestRef.get();
            console.log(`   Named database test: Found ${namedTestSnapshot.size} document(s)`);
            
            // Verify the database ID of the new instance
            const namedDbId = namedDb._databaseId?.database || namedDb._settings?.databaseId || '(default)';
            console.log(`   Named database instance ID: ${namedDbId}`);
            
            // If this works, use the named database instance
            firestoreDb = namedDb;
            admin.firestoreDb = namedDb;
            admin.firestoreDbId = 'i3-testnet';
            actualDatabaseId = 'i3-testnet';
            console.log(`✅ Successfully connected to named database: i3-testnet`);
          } catch (namedError) {
            console.log('❌ ERROR: Could not connect to named database "i3-testnet"');
            console.log('   Error:', namedError.message);
            console.log('   Stack:', namedError.stack);
            admin.firestoreDbId = '(default)';
            actualDatabaseId = '(default)';
            console.log('   Using default database');
          }
        } else {
          // We're already connected to a named database, verify it works
          try {
            const testRef = firestoreDb.collection('models').limit(1);
            const testSnapshot = await testRef.get();
            console.log(`   Models collection: Found ${testSnapshot.size} document(s)`);
            admin.firestoreDbId = verifiedDbId;
            actualDatabaseId = verifiedDbId;
            console.log(`✅ Successfully verified connection to database: ${verifiedDbId}`);
          } catch (queryError) {
            console.log('⚠️  Query failed, but database ID is:', verifiedDbId);
            admin.firestoreDbId = verifiedDbId;
            actualDatabaseId = verifiedDbId;
          }
        }
      } catch (verifyError) {
        console.log('⚠️  Could not verify database connection:', verifyError.message);
        // Even if verification fails, try to connect to named database
        try {
          console.log('   Attempting to connect to named database "i3-testnet"...');
          const namedDb = getFirestore(admin.app(), 'i3-testnet');
          const namedTestRef = namedDb.collection('models').limit(1);
          await namedTestRef.get();
          
          firestoreDb = namedDb;
          admin.firestoreDb = namedDb;
          admin.firestoreDbId = 'i3-testnet';
          actualDatabaseId = 'i3-testnet';
          console.log(`✅ Successfully connected to named database: i3-testnet`);
        } catch (namedError) {
          const verifiedDbId = firestoreDb._databaseId?.database || firestoreDb._settings?.databaseId || '(default)';
          admin.firestoreDbId = verifiedDbId;
          actualDatabaseId = verifiedDbId;
          console.log(`   Using database: ${verifiedDbId}`);
        }
      }
    })().catch(err => {
      console.log('⚠️  Error in async database verification:', err.message);
    });
    
    // Helper function to get Firestore instance - always returns the latest instance
    // This ensures we use the named database instance if it was connected during async verification
    admin.getFirestore = function() {
      // Always return admin.firestoreDb which gets updated during async verification
      // This ensures we use the named database if it was successfully connected
      // If admin.firestoreDb exists and has been updated, use it; otherwise fall back to initial instance
      if (admin.firestoreDb) {
        // Verify it's the named database instance
        const dbId = admin.firestoreDb._databaseId?.database || admin.firestoreDb._settings?.databaseId;
        if (dbId === 'i3-testnet' || admin.firestoreDbId === 'i3-testnet') {
          return admin.firestoreDb;
        }
      }
      // Fall back to initial instance (should be updated during async verification)
      return admin.firestoreDb || firestoreDb;
    };
    
    // Store reference and metadata for use in API endpoints
    // Initialize with the current instance, will be updated during async verification if needed
    admin.firestoreDb = firestoreDb;
    admin.firestoreDbId = actualDatabaseId;
    
    // Final warning if we're not on the right database
    if (actualDatabaseId === '(default)' || actualDatabaseId === 'default') {
      console.log('');
      console.log('⚠️  ⚠️  ⚠️  CRITICAL WARNING ⚠️  ⚠️  ⚠️');
      console.log('   Cannot connect to named database "i3-testnet"');
      console.log('   Data will be written to DEFAULT database');
      console.log('   Please check:');
      console.log('   1. Does the named database "i3-testnet" exist in Firebase Console?');
      console.log('   2. Does your service account have access to it?');
      console.log('   3. Is the database name correct?');
      console.log('');
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    console.error('');
    console.error('💡 To fix authentication issues:');
    console.error('   1. Re-authenticate with gcloud:');
    console.error('      gcloud auth application-default login');
    console.error('      gcloud config set project i3-testnet');
    console.error('');
    console.error('   2. Or use a service account key file:');
    console.error('      export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json');
    console.error('');
    throw error;
  }
}

// Initialize Google Cloud Storage
let storage, bucket;
try {
  // Configure Storage with options to avoid SSL/TLS issues
  const storageOptions = {
    projectId: 'i3-testnet',
    // Use same credential approach as Firebase Admin
    keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
    // Force use of Node.js built-in HTTP/HTTPS instead of node-fetch
    // This helps avoid SSL/TLS protocol version issues with Node.js 24
    apiEndpoint: undefined, // Use default
    useAuthWithCustomEndpoint: false
  };
  
  storage = new Storage(storageOptions);
  bucket = storage.bucket('i3-testnet-rag');
  console.log('✅ Google Cloud Storage initialized');
} catch (error) {
  console.error('❌ Google Cloud Storage initialization failed:', error.message);
  throw error;
}

// Initialize Vertex AI
let vertexAI = null;

try {
  vertexAI = new VertexAI({
    project: 'i3-testnet',
    location: 'us-central1'
  });
  console.log('✅ Vertex AI initialized (using gemini-embedding-001 via REST API)');
} catch (error) {
  console.warn('⚠️ Vertex AI initialization warning:', error.message);
}

// Initialize AlloyDB connection pool
let dbPool = null;

async function initAlloyDB() {
  try {
    // AlloyDB connection using Public IP (since public IP is enabled)
    let publicIP = process.env.ALLOYDB_PUBLIC_IP;
    
    if (!publicIP) {
      console.log('⚠️ ALLOYDB_PUBLIC_IP not set');
      console.log('💡 Please set the AlloyDB public IP address (IP only, no port):');
      console.log('   export ALLOYDB_PUBLIC_IP=35.239.188.129');
      console.log('💡 You can find the public IP in Google Cloud Console:');
      console.log('   AlloyDB > Clusters > personal-agent-cluster > Instances > personal-agent-cluster-primary');
      throw new Error('ALLOYDB_PUBLIC_IP environment variable is required');
    }
    
    // Extract IP address if port is included (e.g., "35.239.188.129:5432" -> "35.239.188.129")
    if (publicIP.includes(':')) {
      const originalIP = publicIP;
      publicIP = publicIP.split(':')[0];
      console.log(`ℹ️  Extracted IP from "${originalIP}" -> "${publicIP}" (port will be 5432)`);
    }
    
    // Check if IP looks like a private IP (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(publicIP);
    if (isPrivateIP) {
      console.warn('⚠️ WARNING: The IP address appears to be a private IP:', publicIP);
      console.warn('   Private IPs (10.x.x.x, 172.16-31.x.x, 192.168.x.x) cannot be accessed from outside the VPC');
      console.warn('   Please check the AlloyDB instance for the correct PUBLIC IP address');
      console.warn('   Public IPs typically start with 34.x.x.x, 35.x.x.x, or other public ranges');
    }
    
    console.log(`🔌 Connecting to AlloyDB at ${publicIP}:5432...`);
    
    // Test connection first
    const testPool = new Pool({
      host: publicIP,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'u6fF4uvXqvN?S]:q',
      ssl: {
        rejectUnauthorized: false  // AlloyDB uses SSL for public connections
      },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000
    });
    
    try {
      const testResult = await testPool.query('SELECT NOW(), version()');
      console.log('✅ AlloyDB connection test successful');
      console.log(`   Database time: ${testResult.rows[0].now}`);
      console.log(`   PostgreSQL version: ${testResult.rows[0].version.split(' ')[0]} ${testResult.rows[0].version.split(' ')[1]}`);
      testPool.end();
    } catch (testError) {
      testPool.end();
      console.error('❌ AlloyDB connection test failed:', testError.message);
      console.error('   Error code:', testError.code);
      
      if (testError.code === 'ECONNREFUSED') {
        console.error('');
        console.error('💡 Troubleshooting steps:');
        console.error('   1. Verify the IP address is correct (should be PUBLIC IP, not private)');
        console.error('   2. Check if AlloyDB instance has Public IP enabled');
        console.error('   3. Verify your IP is in the authorized networks list');
        console.error('   4. Check firewall rules allow connections on port 5432');
        console.error('   5. Try: gcloud alloydb instances describe personal-agent-cluster-primary \\');
        console.error('        --cluster=personal-agent-cluster --region=us-central1 \\');
        console.error('        --format="value(ipAddress)"');
      }
      
      throw testError;
    }
    
    // Create main connection pool
    dbPool = new Pool({
      host: publicIP,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: 'u6fF4uvXqvN?S]:q',
      ssl: {
        rejectUnauthorized: false
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000
    });
    
    // Test the main pool
    const result = await dbPool.query('SELECT NOW()');
    console.log('✅ AlloyDB connection pool ready:', result.rows[0].now);
    
  } catch (error) {
    console.error('❌ AlloyDB connection error:', error.message);
    throw error;
  }
}

// Initialize AlloyDB on startup (non-blocking)
initAlloyDB().catch(err => {
  console.error('⚠️ AlloyDB initialization failed, will retry on first API request:', err.message);
  console.log('💡 Make sure to set ALLOYDB_PUBLIC_IP environment variable');
});

const app = express();
const PORT = process.env.PORT || 3001;

console.log(`🔧 Server configuration: PORT=${PORT}, NODE_ENV=${process.env.NODE_ENV || 'development'}`);

// Enable CORS
app.use(cors());

// Parse JSON request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads (memory storage)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

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

// 新增：聊天完成代理API
app.post('/api/chat/completions', async (req, res) => {
  try {
    const apiKey = req.headers['i3-api-key'] || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
    
    console.log('🚀 Proxying chat completions request');
    
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
    res.status(500).json({ error: 'Failed to get chat completions' });
  }
});

// ========== Personal Agent RAG Processing API ==========

// Helper: Clean text for database storage (remove null bytes and invalid UTF-8)
function cleanTextForDatabase(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  // Remove null bytes (\x00) which PostgreSQL TEXT cannot store
  // Remove other control characters except newlines, tabs, and carriage returns
  return text
    .replace(/\x00/g, '') // Remove null bytes
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove other control chars except \n, \t, \r
    .replace(/\uFFFD/g, '') // Remove replacement characters (invalid UTF-8)
    .trim();
}

// Helper: Retry GCS operations with exponential backoff for SSL/TLS errors
async function retryGCSOperation(operation, operationName, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const errorMessage = error.message || '';
      const errorCode = error.code || '';
      
      // Check if it's an SSL/TLS error (similar to getEmbedding)
      const isSSLError = errorCode === 'EPROTO' || 
                        errorMessage.includes('tlsv1 alert protocol version') ||
                        errorMessage.includes('SSL routines') ||
                        errorMessage.includes('EPROTO');
      
      if (isSSLError && attempt < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⚠️  SSL/TLS error on ${operationName} (attempt ${attempt}/${maxRetries}), retrying in ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      } else {
        // Not retryable or max retries reached
        if (attempt >= maxRetries && isSSLError) {
          console.error(`❌ ${operationName} failed after ${maxRetries} attempts due to SSL/TLS error`);
        }
        throw error;
      }
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error(`Failed ${operationName} after all retries`);
}

// Helper: Chunk text into smaller pieces
function chunkText(text, chunkSize = 4000, overlap = 800) {
  // Clean text before chunking
  text = cleanTextForDatabase(text);
  
  const chunks = [];
  let start = 0;
  
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    let chunk = text.slice(start, end);
    
    // Try to break at sentence boundaries
    if (end < text.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      const lastNewline = chunk.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      
      if (breakPoint > chunkSize * 0.5) {
        chunk = chunk.slice(0, breakPoint + 1);
        start += breakPoint + 1 - overlap;
      } else {
        start += chunkSize - overlap;
      }
    } else {
      start = text.length;
    }
    
    // Clean chunk before adding
    const cleanedChunk = cleanTextForDatabase(chunk);
    if (cleanedChunk.length > 0) {
      chunks.push(cleanedChunk);
    }
  }
  
  return chunks;
}

// Helper: Get embedding from Vertex AI using gemini-embedding-001 (768 dimensions)
// With retry logic for SSL/TLS errors
async function getEmbedding(text, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });
      
      const client = await auth.getClient();
      const accessToken = await client.getAccessToken();
      
      // Use Vertex AI REST API for gemini-embedding-001
      // Endpoint: projects/{project}/locations/{location}/publishers/google/models/gemini-embedding-001:predict
      const apiUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/i3-testnet/locations/us-central1/publishers/google/models/gemini-embedding-001:predict`;
      
      // Request body format for gemini-embedding-001
      const requestBody = {
        instances: [{
          content: text
        }],
        parameters: {
          outputDimensionality: 768  // Specify 768 dimensions
        }
      };
      
      // Use node-fetch with timeout and better error handling
      const fetchOptions = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody),
        // Add timeout to prevent hanging
        timeout: 30000 // 30 seconds
      };
      
      let response;
      try {
        response = await fetch(apiUrl, fetchOptions);
      } catch (fetchError) {
        // Check if it's an SSL/TLS error
        if (fetchError.message && (
          fetchError.message.includes('EPROTO') ||
          fetchError.message.includes('tlsv1 alert protocol version') ||
          fetchError.message.includes('SSL') ||
          fetchError.message.includes('TLS')
        )) {
          lastError = fetchError;
          if (attempt < maxRetries) {
            // Exponential backoff: wait 1s, 2s, 4s
            const waitTime = Math.pow(2, attempt - 1) * 1000;
            console.warn(`⚠️  SSL/TLS error on attempt ${attempt}/${maxRetries}, retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue; // Retry
          } else {
            throw fetchError; // Max retries reached
          }
        } else {
          // Not an SSL error, throw immediately
          throw fetchError;
        }
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ Vertex AI API error response:', errorText);
        throw new Error(`Vertex AI API error: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
    
    // Handle gemini-embedding-001 response format
    // Response structure: { predictions: [{ embeddings: { values: [...] } }] }
    let embedding = null;
    
    if (result.predictions && result.predictions[0]) {
      const prediction = result.predictions[0];
      
      // Try different possible response formats
      if (prediction.embeddings) {
        if (prediction.embeddings.values) {
          embedding = prediction.embeddings.values;
        } else if (Array.isArray(prediction.embeddings)) {
          embedding = prediction.embeddings;
        } else {
          // If embeddings is an object, try to extract values
          embedding = prediction.embeddings;
        }
      } else if (prediction.values) {
        embedding = prediction.values;
      } else if (Array.isArray(prediction)) {
        embedding = prediction;
      }
    }
    
    // If embedding is still not an array, try to extract from nested structure
    if (!Array.isArray(embedding)) {
      // Handle structValue format (from gRPC/Protobuf)
      if (embedding && embedding.structValue) {
        const struct = embedding.structValue.fields;
        if (struct.embeddings && struct.embeddings.structValue) {
          const embStruct = struct.embeddings.structValue.fields;
          if (embStruct.values && embStruct.values.listValue) {
            embedding = embStruct.values.listValue.values.map(v => v.numberValue);
          }
        } else if (struct.values && struct.values.listValue) {
          embedding = struct.values.listValue.values.map(v => v.numberValue);
        }
      }
    }
    
    if (!embedding || !Array.isArray(embedding)) {
      console.error('❌ Invalid embedding response:', JSON.stringify(result, null, 2));
      throw new Error('Invalid response format from Vertex AI. Expected array of numbers.');
    }
    
    // Ensure all values are numbers
    embedding = embedding.map(v => typeof v === 'number' ? v : parseFloat(v));
    
    // gemini-embedding-001 with outputDimensionality: 768 should return 768 dimensions
    if (embedding.length !== 768) {
      console.warn(`⚠️ Expected 768 dimensions, got ${embedding.length}. Using as-is.`);
    }
    
    // Success! Return the embedding
    return embedding;
    } catch (error) {
      lastError = error;
      
      // Check if it's an SSL/TLS error that we should retry
      const errorMessage = error.message || error.toString() || '';
      const isSSLError = (
        errorMessage.includes('EPROTO') ||
        errorMessage.includes('tlsv1 alert protocol version') ||
        errorMessage.includes('SSL') ||
        errorMessage.includes('TLS') ||
        errorMessage.includes('protocol version')
      );
      
      if (isSSLError && attempt < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⚠️  SSL/TLS error on attempt ${attempt}/${maxRetries} for embedding, retrying in ${waitTime}ms...`);
        console.warn(`   Error: ${errorMessage.substring(0, 200)}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      } else {
        // Not retryable or max retries reached
        if (attempt >= maxRetries) {
          console.error(`❌ Vertex AI embedding error after ${maxRetries} attempts:`, errorMessage);
        } else {
          console.error('❌ Vertex AI embedding error (non-retryable):', errorMessage);
        }
        throw error;
      }
    }
  }
  
  // Should never reach here, but just in case
  throw lastError || new Error('Failed to get embedding after all retries');
}

// Helper: Store chunk in AlloyDB
async function storeChunkInAlloyDB(chunkData) {
  // Ensure connection is ready
  if (!dbPool) {
    try {
      await initAlloyDB();
    } catch (error) {
      console.error('❌ Failed to initialize AlloyDB:', error);
      throw new Error(`AlloyDB connection failed: ${error.message}`);
    }
  }
  
  // Test connection before use
  try {
    await dbPool.query('SELECT 1');
  } catch (testError) {
    console.warn('⚠️ Connection lost, reinitializing...');
    try {
      await initAlloyDB();
    } catch (reinitError) {
      throw new Error(`AlloyDB reconnection failed: ${reinitError.message}`);
    }
  }
  
  const { modelId, fileId, chunkIndex, content, sourceUri, embedding } = chunkData;
  
  // Clean content before storing in database (remove null bytes and invalid UTF-8)
  const cleanedContent = cleanTextForDatabase(content);
  
  if (!cleanedContent || cleanedContent.length === 0) {
    throw new Error(`Chunk ${chunkIndex} is empty after cleaning`);
  }
  
  // Convert embedding array to PostgreSQL vector format: '[1,2,3,...]'
  // The pgvector extension expects the format: '[0.1,0.2,0.3,...]'
  const embeddingStr = '[' + embedding.map(v => typeof v === 'number' ? v : parseFloat(v)).join(',') + ']';
  
  const query = `
    INSERT INTO knowledge_chunks (model_id, file_id, chunk_index, content, source_uri, embedding)
    VALUES ($1, $2, $3, $4, $5, $6::vector)
    RETURNING id
  `;
  
  try {
    const result = await dbPool.query(query, [
      modelId,
      fileId,
      chunkIndex,
      cleanedContent, // Use cleaned content
      sourceUri,
      embeddingStr
    ]);
    
    return result.rows[0].id;
  } catch (error) {
    console.error('❌ Error storing chunk in AlloyDB:', error);
    console.error('   Query:', query);
    console.error('   Content length:', cleanedContent.length);
    console.error('   Content preview:', cleanedContent.substring(0, 100));
    console.error('   Embedding length:', embedding.length);
    throw error;
  }
}

// Helper: Save chunk JSON to GCS
async function saveChunkToGCS(modelId, fileId, chunkIndex, chunkData) {
  const chunkPath = `chunks/${modelId}/${fileId}/chunk_${String(chunkIndex).padStart(4, '0')}.json`;
  const file = bucket.file(chunkPath);
  
  const jsonContent = JSON.stringify(chunkData, null, 2);
  
  // Use save() method with resumable: false to avoid SSL/TLS issues
  try {
    await file.save(jsonContent, {
      contentType: 'application/json',
      metadata: {
        modelId,
        fileId,
        chunkIndex: chunkIndex.toString()
      },
      resumable: false, // Disable resumable uploads to avoid SSL/TLS issues
      validation: 'md5'
    });
  } catch (saveError) {
    // If save() fails, try stream-based upload as fallback
    console.warn(`⚠️  save() failed for chunk ${chunkIndex}, trying stream:`, saveError.message);
    const stream = file.createWriteStream({
      metadata: {
        contentType: 'application/json',
        metadata: {
          modelId,
          fileId,
          chunkIndex: chunkIndex.toString()
        }
      },
      resumable: false,
      validation: false
    });
    
    await new Promise((resolve, reject) => {
      stream.on('error', reject);
      stream.on('finish', resolve);
      stream.end(Buffer.from(jsonContent, 'utf-8'));
    });
  }
  
  return `gs://i3-testnet-rag/${chunkPath}`;
}

// Helper: Update Firestore file status
async function updateFileStatus(fileId, status, error = null) {
  try {
    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    if (!db) {
      throw new Error('Firestore database not initialized');
    }
    const filesRef = db.collection('modelFiles');
    const snapshot = await filesRef.where('fileId', '==', fileId).get();
    
    if (!snapshot.empty) {
      const batch = db.batch();
      snapshot.forEach(doc => {
        const updateData = {
          status,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };
        if (error) {
          updateData.error = error;
        }
        batch.update(doc.ref, updateData);
      });
      await batch.commit();
      console.log(`✅ Updated file ${fileId} status to ${status}`);
    }
  } catch (error) {
    console.error('❌ Error updating Firestore status:', error);
  }
}

// Main API: Process RAG file
// ========== Personal Agent - Model Management APIs ==========

// Test endpoint: List ALL models in the database (for debugging)
app.get('/api/personal-agent/list-all-models', async (req, res) => {
  try {
    const db = admin.getFirestore();
    
    if (!db) {
      return res.status(500).json({ error: 'Firestore not initialized' });
    }
    
    const dbId = db._databaseId?.database || db._settings?.databaseId || admin.firestoreDbId || '(default)';
    
    // Get all models
    const modelsRef = db.collection('models');
    const snapshot = await modelsRef.limit(100).get();
    
    const allModels = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      allModels.push({
        id: doc.id,
        name: data.name,
        ownerAddress: data.ownerAddress,
        source: data.source,
        isPublic: data.isPublic,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt
      });
    });
    
    res.json({
      success: true,
      database: dbId,
      totalModels: allModels.length,
      models: allModels,
      firebaseConsoleUrl: `https://console.firebase.google.com/project/i3-testnet/firestore/databases/${dbId}/data/~2Fmodels`,
      note: dbId === '(default)' 
        ? '⚠️ You are viewing the DEFAULT database. User models are in the "i3-testnet" named database.'
        : '✅ You are viewing the correct named database "i3-testnet".'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test endpoint: Verify a specific model exists
app.get('/api/personal-agent/verify-model/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const db = admin.getFirestore();
    
    if (!db) {
      return res.status(500).json({ error: 'Firestore not initialized' });
    }
    
    const dbId = db._databaseId?.database || db._settings?.databaseId || admin.firestoreDbId || '(default)';
    
    // Try to read the model
    const modelRef = db.collection('models').doc(modelId);
    const modelDoc = await modelRef.get();
    
    if (modelDoc.exists) {
      const modelData = modelDoc.data();
      res.json({
        success: true,
        found: true,
        database: dbId,
        model: {
          id: modelId,
          name: modelData.name,
          ownerAddress: modelData.ownerAddress,
          source: modelData.source,
          isPublic: modelData.isPublic,
          createdAt: modelData.createdAt?.toDate?.()?.toISOString() || modelData.createdAt
        },
        firebaseConsoleUrl: `https://console.firebase.google.com/project/i3-testnet/firestore/databases/${dbId}/data/~2Fmodels~2F${modelId}`
      });
    } else {
      res.json({
        success: true,
        found: false,
        database: dbId,
        message: `Model ${modelId} not found in database ${dbId}`,
        suggestion: dbId === '(default)' 
          ? 'Model may be in the named database "i3-testnet". Check Firebase Console and select the correct database.'
          : 'Check if the model was created successfully. Try: curl http://localhost:3001/api/personal-agent/list-all-models'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Firestore connection and verify database
app.get('/api/personal-agent/test-firestore', async (req, res) => {
  try {
    // Use helper function to get the latest Firestore instance
    const db = admin.getFirestore();
    
    if (!db) {
      return res.status(500).json({ 
        success: false,
        error: 'Firestore database not initialized',
        details: 'Firebase Admin may not have initialized correctly'
      });
    }
    
    // Get database information
    const databaseId = db._databaseId?.database || db._settings?.databaseId || admin.firestoreDbId || '(default)';
    const projectId = db._databaseId?.projectId || 'i3-testnet';
    const isNamed = databaseId !== '(default)' && databaseId !== 'default';
    
    // Try to access the models collection to verify database connection
    const modelsRef = db.collection('models');
    const snapshot = await modelsRef.limit(10).get();
    
    const models = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      models.push({ 
        id: doc.id, 
        name: data.name, 
        ownerAddress: data.ownerAddress,
        source: data.source,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt
      });
    });
    
    // Also check modelFiles collection
    const filesRef = db.collection('modelFiles');
    const filesSnapshot = await filesRef.limit(10).get();
    const files = [];
    filesSnapshot.forEach(doc => {
      const data = doc.data();
      files.push({
        id: doc.id,
        fileId: data.fileId,
        modelId: data.modelId,
        filename: data.filename,
        status: data.status
      });
    });
    
    res.json({ 
      success: true,
      message: 'Firestore connection successful',
      database: {
        id: databaseId,
        projectId: projectId,
        isNamed: isNamed,
        note: isNamed ? `✅ Using named database: ${databaseId}` : '⚠️ Using default database. Check Firebase Console > Firestore Database > (default)',
        firebaseConsoleUrl: `https://console.firebase.google.com/project/${projectId}/firestore/databases/${databaseId}/data`
      },
      collectionsAccessible: true,
      modelsCollection: {
        exists: true,
        count: snapshot.size,
        totalInQuery: snapshot.size,
        sample: models
      },
      modelFilesCollection: {
        exists: true,
        count: filesSnapshot.size,
        totalInQuery: filesSnapshot.size,
        sample: files
      }
    });
  } catch (error) {
    console.error('❌ Firestore test failed:', error);
    res.status(500).json({ 
      success: false,
      error: error.message,
      code: error.code,
      details: error.code === 5 ? 'Database "i3-testnet" not found. Please verify it exists in Firebase Console.' : 'See FIRESTORE_SETUP.md for troubleshooting steps'
    });
  }
});

// Create a new model
app.post('/api/personal-agent/models', async (req, res) => {
  try {
    const { name, ownerAddress, isPublic, purpose, useCase, category, industry, tokenPrice } = req.body;
    
    if (!name || !ownerAddress) {
      return res.status(400).json({ error: 'Name and ownerAddress are required' });
    }
    
    // Generate unique ID
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const modelId = `model_${ownerAddress.toLowerCase().replace('0x', '')}_${timestamp}_${random}`;
    
    // Use helper function to ensure correct database
    let db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    // CRITICAL: Verify we're using the named database BEFORE writing
    let dbIdBeforeWrite = db._databaseId?.database || db._settings?.databaseId || admin.firestoreDbId || '(default)';
    console.log(`🔍 Before write - Database ID: ${dbIdBeforeWrite}`);
    console.log(`   admin.firestoreDbId: ${admin.firestoreDbId}`);
    console.log(`   db._databaseId: ${JSON.stringify(db._databaseId)}`);
    console.log(`   db._settings: ${JSON.stringify(db._settings)}`);
    
    if (dbIdBeforeWrite === '(default)' || dbIdBeforeWrite === 'default') {
      console.log('❌ CRITICAL ERROR: About to write to DEFAULT database!');
      console.log('   Attempting to reconnect to named database...');
      
      // Try to get the named database instance
      try {
        const { getFirestore } = require('firebase-admin/firestore');
        const namedDb = getFirestore(admin.app(), 'i3-testnet');
        const namedDbId = namedDb._databaseId?.database || namedDb._settings?.databaseId || '(default)';
        console.log(`   Named database instance ID: ${namedDbId}`);
        
        if (namedDbId === 'i3-testnet') {
          // Use the named database instance
          admin.firestoreDb = namedDb;
          admin.firestoreDbId = 'i3-testnet';
          db = namedDb; // Reassign db to use named database
          dbIdBeforeWrite = 'i3-testnet';
          console.log('✅ Switched to named database instance');
        } else {
          throw new Error('Could not connect to named database');
        }
      } catch (reconnectError) {
        console.error('❌ Failed to reconnect to named database:', reconnectError);
        return res.status(500).json({ 
          error: 'Cannot write to default database. Named database connection failed.',
          details: reconnectError.message
        });
      }
    }
    
    const modelRef = db.collection('models').doc(modelId);
    
    const modelData = {
      name,
      slug: modelId,
      ownerAddress: ownerAddress.toLowerCase(),
      source: 'user',
      isPublic: isPublic || false,
      purpose: purpose || null,
      hiddenPurpose: null,
      useCase: useCase || null,
      hiddenUseCase: null,
      category: category || null,
      industry: industry || null,
      tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : 2, // Default to 2 if not provided
      purchasedPercent: null,
      sharePrice: 10, // Default sharePrice is 10, not user-editable
      change: null,
      rating: null,
      usage: null,
      compatibility: null,
      totalScore: null,
      paperLink: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    console.log(`📝 Writing model to Firestore: ${modelId}`);
    await modelRef.set(modelData);
    console.log(`✅ Model data written to Firestore`);
    
    // Verify the write by reading it back
    const verifyDoc = await modelRef.get();
    if (!verifyDoc.exists) {
      throw new Error('Model was not created successfully - verification failed');
    }
    
    const createdData = { id: modelId, ...verifyDoc.data() };
    
    // Verify database ID AFTER write (use the same db instance we wrote to)
    const actualDbId = db._databaseId?.database || db._settings?.databaseId || admin.firestoreDbId || '(default)';
    console.log(`🔍 After write - Database ID: ${actualDbId}`);
    console.log(`✅ Model created and verified: ${modelId} by ${ownerAddress}`);
    console.log(`   Database: ${actualDbId}`);
    console.log(`   Collection: models`);
    console.log(`   Document ID: ${modelId}`);
    console.log(`   Model name: ${name}`);
    
    // Double-check by querying the database directly
    try {
      const verifyQuery = await db.collection('models').doc(modelId).get();
      if (verifyQuery.exists) {
        const verifyData = verifyQuery.data();
        console.log(`✅ Verification query successful - model exists in database`);
        console.log(`   Verified model data:`, {
          id: modelId,
          name: verifyData.name,
          ownerAddress: verifyData.ownerAddress,
          source: verifyData.source,
          isPublic: verifyData.isPublic
        });
      } else {
        console.log(`❌ WARNING: Verification query failed - model not found!`);
        throw new Error('Model verification failed - document does not exist after creation');
      }
      
      // Also verify by querying with ownerAddress filter
      const queryVerify = await db.collection('models')
        .where('ownerAddress', '==', ownerAddress.toLowerCase())
        .where('slug', '==', modelId)
        .limit(1)
        .get();
      
      if (queryVerify.empty) {
        console.log(`⚠️  WARNING: Model not found in query by ownerAddress and slug`);
      } else {
        console.log(`✅ Query verification successful - model found by ownerAddress and slug`);
      }
    } catch (verifyError) {
      console.log(`⚠️  Verification query error: ${verifyError.message}`);
      console.log(`   Stack: ${verifyError.stack}`);
    }
    
    if (actualDbId === '(default)' || actualDbId === 'default') {
      console.log('❌ ERROR: Model stored in DEFAULT database instead of "i3-testnet"!');
      console.log('   This is a configuration issue - check Firebase Admin SDK setup');
      console.log('   View in Firebase Console: Firestore Database > (default) > models collection');
      return res.status(500).json({ 
        error: 'Model was written to default database instead of named database',
        details: 'Please check Firebase Admin SDK configuration'
      });
    } else {
      console.log(`✅ Model stored in named database: ${actualDbId}`);
      console.log(`   View in Firebase Console: https://console.firebase.google.com/project/i3-testnet/firestore/databases/${actualDbId}/data/~2Fmodels~2F${modelId}`);
      console.log(`   Direct link: https://console.firebase.google.com/project/i3-testnet/firestore/databases/${actualDbId}/data/~2Fmodels~2F${modelId}`);
    }
    
    // Final verification: Try to read the model one more time after a short delay
    setTimeout(async () => {
      try {
        const finalCheck = await db.collection('models').doc(modelId).get();
        if (finalCheck.exists) {
          console.log(`✅ Final verification (after delay): Model ${modelId} exists in database ${actualDbId}`);
        } else {
          console.log(`❌ Final verification FAILED: Model ${modelId} NOT found in database ${actualDbId}`);
        }
      } catch (finalError) {
        console.log(`⚠️  Final verification error: ${finalError.message}`);
      }
    }, 1000);
    
    res.json(createdData);
  } catch (error) {
    console.error('❌ Error creating model:', error);
    
    // Check for authentication errors
    if (error.message && (error.message.includes('invalid_grant') || error.message.includes('invalid_rapt'))) {
      console.error('');
      console.error('💡 Authentication error detected. Please:');
      console.error('   1. Run: gcloud auth application-default login');
      console.error('   2. Or set: export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json');
      console.error('   See AUTHENTICATION_SETUP.md for details');
      return res.status(401).json({ 
        error: 'Authentication failed. Please check your Google Cloud credentials.',
        details: 'See AUTHENTICATION_SETUP.md for troubleshooting steps'
      });
    }
    
    res.status(500).json({ error: 'Failed to create model: ' + error.message });
  }
});

// Update model (e.g., toggle public/private)
app.patch('/api/personal-agent/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { ownerAddress, ...updates } = req.body;
    
    if (!ownerAddress) {
      return res.status(400).json({ error: 'ownerAddress is required' });
    }
    
    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const modelRef = db.collection('models').doc(modelId);
    const modelDoc = await modelRef.get();
    
    if (!modelDoc.exists) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    const modelData = modelDoc.data();
    if (modelData.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Only allow updating specific fields
    const allowedUpdates = {
      name: updates.name,
      isPublic: updates.isPublic,
      purpose: updates.purpose,
      useCase: updates.useCase,
      category: updates.category,
      industry: updates.industry,
      tokenPrice: updates.tokenPrice !== undefined ? updates.tokenPrice : undefined,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    // Remove null/undefined values
    Object.keys(allowedUpdates).forEach(key => {
      if (allowedUpdates[key] === undefined) {
        delete allowedUpdates[key];
      }
    });
    
    await modelRef.update(allowedUpdates);
    
    console.log(`✅ Model updated: ${modelId}`);
    res.json({ id: modelId, ...modelData, ...allowedUpdates });
  } catch (error) {
    console.error('❌ Error updating model:', error);
    res.status(500).json({ error: 'Failed to update model: ' + error.message });
  }
});

// Delete model
app.delete('/api/personal-agent/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    const { ownerAddress } = req.query;
    
    if (!ownerAddress) {
      return res.status(400).json({ error: 'ownerAddress is required' });
    }
    
    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const modelRef = db.collection('models').doc(modelId);
    const modelDoc = await modelRef.get();
    
    if (!modelDoc.exists) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    const modelData = modelDoc.data();
    if (modelData.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    console.log(`🗑️  Deleting model: ${modelId}`);
    
    // Step 1: Delete all files associated with this model from Firestore
    console.log(`📄 Step 1: Deleting all files from Firestore...`);
    const filesRef = db.collection('modelFiles');
    const filesSnapshot = await filesRef.where('modelId', '==', modelId).get();
    const deletePromises = [];
    filesSnapshot.forEach((doc) => {
      deletePromises.push(doc.ref.delete());
    });
    await Promise.all(deletePromises);
    console.log(`✅ Step 1 complete: Deleted ${filesSnapshot.size} file record(s) from Firestore`);
    
    // Step 2: Delete model record from Firestore
    console.log(`🗄️  Step 2: Deleting model record from Firestore...`);
    await modelRef.delete();
    console.log(`✅ Step 2 complete: Deleted model record from Firestore`);
    
    // Return success immediately so frontend can update UI
    res.json({ 
      success: true,
      message: 'Model deleted successfully. Background cleanup in progress...'
    });
    
    // Step 3-5: Asynchronously delete chunks and files in the background
    // (Don't await - let it run in background)
    (async () => {
      try {
        // Step 3: Delete all chunks from AlloyDB for this model
        console.log(`📊 [Background] Step 3: Deleting chunks from AlloyDB for model ${modelId}...`);
        try {
          if (!dbPool) {
            await initAlloyDB();
          }
          
          const deleteChunksQuery = `
            DELETE FROM knowledge_chunks 
            WHERE model_id = $1
          `;
          const deleteResult = await dbPool.query(deleteChunksQuery, [modelId]);
          console.log(`✅ [Background] Step 3 complete: Deleted ${deleteResult.rowCount} chunk(s) from AlloyDB`);
        } catch (alloyError) {
          console.error(`❌ [Background] Error deleting from AlloyDB:`, alloyError);
          // Continue with other deletions even if AlloyDB fails
        }
        
        // Step 4: Delete all chunk files from GCS (chunks/{modelId}/)
        console.log(`📁 [Background] Step 4: Deleting chunk files from GCS (chunks/${modelId}/)...`);
        try {
          if (!bucket) {
            console.error(`❌ [Background] GCS bucket not initialized`);
            throw new Error('GCS bucket not initialized');
          }
          
          const chunksPrefix = `chunks/${modelId}/`;
          console.log(`   [Background] Searching for chunks with prefix: ${chunksPrefix}`);
          
          // Use retry mechanism for bucket.getFiles()
          const [files] = await retryGCSOperation(
            () => bucket.getFiles({ prefix: chunksPrefix }),
            'bucket.getFiles() for model chunks'
          );
          console.log(`   [Background] Found ${files.length} file(s) matching prefix`);
          
          if (files.length > 0) {
            const processedFiles = new Set();
            let deletedCount = 0;
            let alreadyDeletedCount = 0;
            let failedCount = 0;
            
            for (const file of files) {
              if (processedFiles.has(file.name)) {
                continue;
              }
              processedFiles.add(file.name);
              
              try {
                const [exists] = await retryGCSOperation(
                  () => file.exists(),
                  `file.exists() for chunk file ${file.name}`
                );
                
                if (exists) {
                  await retryGCSOperation(
                    () => file.delete(),
                    `file.delete() for chunk file ${file.name}`
                  );
                  deletedCount++;
                } else {
                  alreadyDeletedCount++;
                }
              } catch (fileError) {
                const errorCode = fileError.code || (fileError.response && fileError.response.statusCode);
                const errorMessage = fileError.message || '';
                
                if (errorCode === 404 || 
                    errorMessage.includes('No such object') || 
                    errorMessage.includes('does not exist') ||
                    errorMessage.includes('notFound')) {
                  alreadyDeletedCount++;
                } else {
                  failedCount++;
                  console.error(`      [Background] ❌ Failed to delete ${file.name}:`, errorMessage);
                }
              }
            }
            
            console.log(`✅ [Background] Step 4 complete: Deleted ${deletedCount} chunk file(s) from GCS`);
            if (alreadyDeletedCount > 0) {
              console.log(`   [Background] ℹ️  ${alreadyDeletedCount} file(s) were already deleted (skipped)`);
            }
            if (failedCount > 0) {
              console.warn(`   [Background] ⚠️  ${failedCount} file(s) failed to delete (real errors)`);
            }
          } else {
            console.log(`   [Background] ℹ️  No chunk files found with prefix: ${chunksPrefix}`);
          }
        } catch (chunksError) {
          console.error(`❌ [Background] Error deleting chunk files from GCS:`, chunksError);
          // Continue with other deletions
        }
        
        // Step 5: Delete all raw files from GCS (raw/{modelId}/)
        console.log(`📄 [Background] Step 5: Deleting raw files from GCS (raw/${modelId}/)...`);
        try {
          if (!bucket) {
            console.error(`❌ [Background] GCS bucket not initialized`);
            throw new Error('GCS bucket not initialized');
          }
          
          const rawPrefix = `raw/${modelId}/`;
          console.log(`   [Background] Searching for raw files with prefix: ${rawPrefix}`);
          
          // Use retry mechanism for bucket.getFiles()
          // Get all files with the prefix (including subdirectories)
          const [files] = await retryGCSOperation(
            () => bucket.getFiles({ prefix: rawPrefix }),
            'bucket.getFiles() for model raw files'
          );
          console.log(`   [Background] Found ${files.length} file(s) matching prefix`);
          
          if (files.length > 0) {
            const processedFiles = new Set();
            let deletedCount = 0;
            let alreadyDeletedCount = 0;
            let failedCount = 0;
            
            // Delete all files in parallel for better performance
            const deletePromises = files.map(async (file) => {
              if (processedFiles.has(file.name)) {
                return { status: 'skipped', name: file.name };
              }
              processedFiles.add(file.name);
              
              try {
                const [exists] = await retryGCSOperation(
                  () => file.exists(),
                  `file.exists() for raw file ${file.name}`
                );
                
                if (exists) {
                  await retryGCSOperation(
                    () => file.delete(),
                    `file.delete() for raw file ${file.name}`
                  );
                  console.log(`      [Background] ✅ Deleted: ${file.name}`);
                  return { status: 'deleted', name: file.name };
                } else {
                  return { status: 'already_deleted', name: file.name };
                }
              } catch (fileError) {
                const errorCode = fileError.code || (fileError.response && fileError.response.statusCode);
                const errorMessage = fileError.message || '';
                
                if (errorCode === 404 || 
                    errorMessage.includes('No such object') || 
                    errorMessage.includes('does not exist') ||
                    errorMessage.includes('notFound')) {
                  return { status: 'already_deleted', name: file.name };
                } else {
                  console.error(`      [Background] ❌ Failed to delete ${file.name}:`, errorMessage);
                  return { status: 'failed', name: file.name, error: errorMessage };
                }
              }
            });
            
            const results = await Promise.all(deletePromises);
            results.forEach(result => {
              if (result.status === 'deleted') deletedCount++;
              else if (result.status === 'already_deleted') alreadyDeletedCount++;
              else if (result.status === 'failed') failedCount++;
            });
            
            console.log(`✅ [Background] Step 5 complete: Deleted ${deletedCount} raw file(s) from GCS`);
            if (alreadyDeletedCount > 0) {
              console.log(`   [Background] ℹ️  ${alreadyDeletedCount} file(s) were already deleted (skipped)`);
            }
            if (failedCount > 0) {
              console.warn(`   [Background] ⚠️  ${failedCount} file(s) failed to delete (real errors)`);
            }
            
            // Verify deletion: check if any files still exist
            console.log(`   [Background] Verifying deletion...`);
            const [remainingFiles] = await retryGCSOperation(
              () => bucket.getFiles({ prefix: rawPrefix }),
              'bucket.getFiles() for verification'
            );
            if (remainingFiles.length > 0) {
              console.warn(`   [Background] ⚠️  Warning: ${remainingFiles.length} file(s) still exist after deletion attempt`);
              remainingFiles.forEach(file => {
                console.warn(`      [Background] Still exists: ${file.name}`);
              });
            } else {
              console.log(`   [Background] ✅ Verification complete: No files remaining under prefix ${rawPrefix}`);
            }
          } else {
            console.log(`   [Background] ℹ️  No raw files found with prefix: ${rawPrefix}`);
          }
        } catch (rawError) {
          console.error(`❌ [Background] Error deleting raw files from GCS:`, rawError);
          // Continue even if raw files deletion fails
        }
        
        console.log(`✅ [Background] Model cleanup complete: ${modelId}`);
      } catch (backgroundError) {
        console.error(`❌ [Background] Unexpected error during background cleanup:`, backgroundError);
      }
    })();
    
    console.log(`✅ Model deletion initiated: ${modelId}`);
  } catch (error) {
    console.error('❌ Error deleting model:', error);
    res.status(500).json({ error: 'Failed to delete model: ' + error.message });
  }
});

// Upload file to GCS and create file record in Firestore
app.post('/api/personal-agent/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }
    
    const { fileId, modelId, ownerAddress, filename, mimeType } = req.body;
    const file = req.file;
    
    if (!fileId || !modelId || !ownerAddress) {
      return res.status(400).json({ error: 'Missing required fields: fileId, modelId, ownerAddress' });
    }
    
    console.log(`📤 Uploading file: ${filename || file.originalname}`);
    console.log(`   File ID: ${fileId}`);
    console.log(`   Model ID: ${modelId}`);
    console.log(`   Size: ${(file.size / 1024).toFixed(2)} KB`);
    console.log(`   Type: ${file.mimetype || mimeType || 'application/octet-stream'}`);
    
    // Generate storage path
    const fileName = `${fileId}_${filename || file.originalname}`;
    const rawPath = `raw/${modelId}/${fileName}`;
    const storagePath = `gs://i3-testnet-rag/${rawPath}`;
    
    // Upload to Google Cloud Storage
    // Use save() method with resumable: false to avoid SSL/TLS protocol issues
    // This uses a simpler upload method that's more compatible with Node.js 24
    console.log(`⬆️ Uploading to GCS: ${rawPath}`);
    const gcsFile = bucket.file(rawPath);
    
    // Try save() method first (simpler, less likely to have SSL issues)
    try {
      await gcsFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype || mimeType || 'application/octet-stream',
          metadata: {
            fileId,
            modelId,
            ownerAddress: ownerAddress.toLowerCase(),
            originalFilename: filename || file.originalname
          }
        },
        resumable: false, // Disable resumable uploads to avoid SSL/TLS issues
        validation: 'md5' // Use MD5 validation
      });
      console.log(`✅ File uploaded to GCS: ${storagePath}`);
    } catch (saveError) {
      // If save() fails, try stream-based upload as fallback
      console.warn(`⚠️  save() method failed, trying stream upload:`, saveError.message);
      const stream = gcsFile.createWriteStream({
        metadata: {
          contentType: file.mimetype || mimeType || 'application/octet-stream',
          metadata: {
            fileId,
            modelId,
            ownerAddress: ownerAddress.toLowerCase(),
            originalFilename: filename || file.originalname
          }
        },
        resumable: false,
        validation: false
      });
      
      await new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(file.buffer);
      });
      console.log(`✅ File uploaded to GCS (via stream): ${storagePath}`);
    }
    
    // Create file record in Firestore
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const fileData = {
      fileId,
      modelId,
      ownerAddress: ownerAddress.toLowerCase(),
      filename: filename || file.originalname,
      storagePath,
      mimeType: file.mimetype || mimeType || 'application/octet-stream',
      status: 'processing', // Set to 'processing' immediately so frontend can show it
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const filesRef = db.collection('modelFiles');
    const docRef = await filesRef.add(fileData);
    
    // Verify the write
    const verifyDoc = await docRef.get();
    if (!verifyDoc.exists) {
      throw new Error('File record was not created successfully - verification failed');
    }
    
    const createdData = { id: verifyDoc.id, ...verifyDoc.data() };
    const actualDbId = db._databaseId?.database || admin.firestoreDbId || '(default)';
    console.log(`✅ File record created: ${fileId} for model ${modelId}`);
    console.log(`   Database: ${actualDbId}`);
    console.log(`   Collection: modelFiles`);
    console.log(`   Document ID: ${verifyDoc.id}`);
    console.log(`   File: ${filename || file.originalname}`);
    
    if (actualDbId === '(default)' || actualDbId === 'default') {
      console.log('📌 File record stored in DEFAULT database');
      console.log('   View in Firebase Console: Firestore Database > (default) > modelFiles collection');
    } else {
      console.log(`📌 File record stored in named database: ${actualDbId}`);
    }
    
    res.json({
      success: true,
      fileId,
      modelId,
      storagePath,
      fileRecordId: verifyDoc.id,
      ...createdData
    });
  } catch (error) {
    console.error('❌ Error uploading file:', error);
    res.status(500).json({ error: 'Failed to upload file: ' + error.message });
  }
});

// Create file record in Firestore (legacy endpoint, kept for compatibility)
app.post('/api/personal-agent/files', async (req, res) => {
  try {
    const { fileId, modelId, ownerAddress, filename, storagePath, mimeType } = req.body;
    
    if (!fileId || !modelId || !ownerAddress || !filename || !storagePath) {
      return res.status(400).json({ error: 'Missing required fields: fileId, modelId, ownerAddress, filename, storagePath' });
    }
    
    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const fileData = {
      fileId,
      modelId,
      ownerAddress: ownerAddress.toLowerCase(),
      filename,
      storagePath,
      mimeType: mimeType || 'application/octet-stream',
      status: 'uploaded',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const filesRef = db.collection('modelFiles');
    const docRef = await filesRef.add(fileData);
    
    // Verify the write
    const verifyDoc = await docRef.get();
    if (!verifyDoc.exists) {
      throw new Error('File record was not created successfully - verification failed');
    }
    
    const createdData = { id: verifyDoc.id, ...verifyDoc.data() };
    const actualDbId = db._databaseId?.database || admin.firestoreDbId || '(default)';
    console.log(`✅ File record created: ${fileId} for model ${modelId}`);
    console.log(`   Database: ${actualDbId}`);
    console.log(`   Collection: modelFiles`);
    console.log(`   Document ID: ${verifyDoc.id}`);
    console.log(`   File: ${filename}`);
    
    if (actualDbId === '(default)' || actualDbId === 'default') {
      console.log('📌 File record stored in DEFAULT database');
      console.log('   View in Firebase Console: Firestore Database > (default) > modelFiles collection');
    } else {
      console.log(`📌 File record stored in named database: ${actualDbId}`);
    }
    
    res.json(createdData);
  } catch (error) {
    console.error('❌ Error creating file record:', error);
    res.status(500).json({ error: 'Failed to create file record: ' + error.message });
  }
});

// Update file status
app.patch('/api/personal-agent/files/:fileId/status', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { status, error, ownerAddress } = req.body;
    
    if (!status || !ownerAddress) {
      return res.status(400).json({ error: 'status and ownerAddress are required' });
    }
    
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const filesRef = db.collection('modelFiles');
    const snapshot = await filesRef.where('fileId', '==', fileId).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    const batch = db.batch();
    snapshot.forEach(doc => {
      const fileData = doc.data();
      if (fileData.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: 'Permission denied' });
      }
      const updateData = {
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      if (error) {
        updateData.error = error;
      }
      batch.update(doc.ref, updateData);
    });
    
    await batch.commit();
    console.log(`✅ Updated file ${fileId} status to ${status}`);
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Error updating file status:', error);
    res.status(500).json({ error: 'Failed to update file status: ' + error.message });
  }
});

// Get files for a model
app.get('/api/personal-agent/files', async (req, res) => {
  try {
    const { modelId } = req.query;
    
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }
    
    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const filesRef = db.collection('modelFiles')
      .where('modelId', '==', modelId);
    
    const snapshot = await filesRef.get();
    const files = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Convert Firestore Timestamp to ISO string for frontend
      const fileData = { id: doc.id, ...data };
      if (data.createdAt) {
        if (data.createdAt.toDate && typeof data.createdAt.toDate === 'function') {
          fileData.createdAt = data.createdAt.toDate().toISOString();
        } else if (data.createdAt.seconds !== undefined) {
          fileData.createdAt = new Date(data.createdAt.seconds * 1000).toISOString();
        } else if (data.createdAt._seconds !== undefined) {
          fileData.createdAt = new Date(data.createdAt._seconds * 1000).toISOString();
        }
      }
      files.push(fileData);
    });
    
    // Sort by createdAt descending
    files.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
    
    // Suppress logs for polling requests to reduce noise
    // Check if this is a polling request via custom header
    const isPollingRequest = req.get('X-Polling-Request') === 'true';
    
    // Only log non-polling requests or when there are significant changes
    // This dramatically reduces log noise during file processing
    if (!isPollingRequest) {
      const hasProcessingFiles = files.some(f => f.status === 'processing');
      // Log initial loads, completed states, or when there are processing files
      if (files.length === 0 || !hasProcessingFiles) {
        console.log(`✅ Retrieved ${files.length} files for model ${modelId}`);
      }
    }
    // For polling requests, completely suppress logs to avoid noise
    res.json({ files });
  } catch (error) {
    console.error('❌ Error loading files:', error);
    res.status(500).json({ error: 'Failed to load files: ' + error.message });
  }
});

// Delete file
app.delete('/api/personal-agent/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { ownerAddress } = req.query;

    if (!ownerAddress) {
      return res.status(400).json({ error: 'ownerAddress is required' });
    }

    console.log(`🗑️  Deleting file: ${fileId} for owner: ${ownerAddress}`);

    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }

    // Find the file document
    const filesRef = db.collection('modelFiles');
    const snapshot = await filesRef.where('fileId', '==', fileId).get();

    if (snapshot.empty) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get file data and check ownership
    let fileData = null;
    let fileDocRef = null;
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.ownerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
        return res.status(403).json({ error: 'Permission denied' });
      }
      fileData = data;
      fileDocRef = doc.ref;
    });

    if (!fileData) {
      return res.status(403).json({ error: 'Permission denied' });
    }

    const { modelId, storagePath } = fileData;
    console.log(`   Model ID: ${modelId}`);
    console.log(`   Storage Path: ${storagePath}`);

    // Step 1: Delete file record from Firestore FIRST (so frontend can update immediately)
    console.log(`🗄️  Step 1: Deleting file record from Firestore...`);
    await fileDocRef.delete();
    console.log(`✅ Deleted file record from Firestore: ${fileId}`);

    // Return success immediately so frontend can update UI
    res.json({ 
      success: true,
      fileId,
      message: 'File deleted successfully. Background cleanup in progress...'
    });

    // Step 2-4: Asynchronously delete chunks and files in the background
    // (Don't await - let it run in background)
    (async () => {
      try {
        // Step 2: Delete from AlloyDB
        console.log(`📊 [Background] Step 2: Deleting chunks from AlloyDB...`);
        try {
          if (!dbPool) {
            await initAlloyDB();
          }
          
          const deleteChunksQuery = `
            DELETE FROM knowledge_chunks 
            WHERE file_id = $1
          `;
          const deleteResult = await dbPool.query(deleteChunksQuery, [fileId]);
          console.log(`✅ [Background] Deleted ${deleteResult.rowCount} chunk(s) from AlloyDB`);
        } catch (alloyError) {
          console.error(`❌ [Background] Error deleting from AlloyDB:`, alloyError);
          // Continue with other deletions even if AlloyDB fails
        }

        // Step 3: Delete chunk JSON files from GCS
        console.log(`📁 [Background] Step 3: Deleting chunk JSON files from GCS...`);
        try {
          if (!bucket) {
            console.error(`❌ [Background] GCS bucket not initialized`);
            throw new Error('GCS bucket not initialized');
          }
          
          const chunksPrefix = `chunks/${modelId}/${fileId}/`;
          console.log(`   [Background] Searching for chunks with prefix: ${chunksPrefix}`);
          
          // Use retry mechanism for bucket.getFiles()
          const [files] = await retryGCSOperation(
            () => bucket.getFiles({ prefix: chunksPrefix }),
            'bucket.getFiles() for chunks'
          );
          console.log(`   [Background] Found ${files.length} file(s) matching prefix`);
          
          if (files.length > 0) {
            // Delete files one by one with detailed logging
            // Use a Set to track processed files and avoid duplicates
            const processedFiles = new Set();
            let deletedCount = 0;
            let alreadyDeletedCount = 0;
            let failedCount = 0;
            
            for (const file of files) {
              // Skip if we've already processed this file
              if (processedFiles.has(file.name)) {
                continue;
              }
              processedFiles.add(file.name);
              
              try {
                // Check if file exists before attempting to delete (with retry)
                const [exists] = await retryGCSOperation(
                  () => file.exists(),
                  `file.exists() for ${file.name}`
                );
                
                if (exists) {
                  // Delete file (with retry)
                  await retryGCSOperation(
                    () => file.delete(),
                    `file.delete() for ${file.name}`
                  );
                  deletedCount++;
                } else {
                  alreadyDeletedCount++;
                }
              } catch (fileError) {
                // Check if error is "file not found" (404) - this is acceptable
                const errorCode = fileError.code || (fileError.response && fileError.response.statusCode);
                const errorMessage = fileError.message || '';
                
                if (errorCode === 404 || 
                    errorMessage.includes('No such object') || 
                    errorMessage.includes('does not exist') ||
                    errorMessage.includes('notFound')) {
                  alreadyDeletedCount++;
                } else {
                  failedCount++;
                  console.error(`      [Background] ❌ Failed to delete ${file.name}:`, errorMessage);
                }
              }
            }
            
            console.log(`✅ [Background] Step 3 complete: Deleted ${deletedCount} chunk file(s) from GCS`);
            if (alreadyDeletedCount > 0) {
              console.log(`   [Background] ℹ️  ${alreadyDeletedCount} file(s) were already deleted (skipped)`);
            }
            if (failedCount > 0) {
              console.warn(`   [Background] ⚠️  ${failedCount} file(s) failed to delete (real errors)`);
            }
          } else {
            console.log(`   [Background] ⚠️  No chunk files found with prefix: ${chunksPrefix}`);
          }
        } catch (chunksError) {
          console.error(`❌ [Background] Error deleting chunk files from GCS:`, chunksError);
          // Continue with other deletions
        }

        // Step 4: Delete original file from GCS
        console.log(`📄 [Background] Step 4: Deleting original file from GCS...`);
        if (storagePath) {
          try {
            const gcsPath = storagePath.replace('gs://i3-testnet-rag/', '');
            const file = bucket.file(gcsPath);
            
            // Check if file exists (with retry)
            const [exists] = await retryGCSOperation(
              () => file.exists(),
              `file.exists() for original file ${gcsPath}`
            );
            
            if (exists) {
              // Delete file (with retry)
              await retryGCSOperation(
                () => file.delete(),
                `file.delete() for original file ${gcsPath}`
              );
              console.log(`✅ [Background] Deleted original file from GCS: ${gcsPath}`);
            } else {
              console.log(`ℹ️  [Background] Original file not found in GCS (already deleted?): ${gcsPath}`);
            }
          } catch (storageError) {
            // Check if error is "file not found" (404) - this is acceptable
            const errorCode = storageError.code || (storageError.response && storageError.response.statusCode);
            const errorMessage = storageError.message || '';
            
            if (errorCode === 404 || 
                errorMessage.includes('No such object') || 
                errorMessage.includes('does not exist') ||
                errorMessage.includes('notFound')) {
              console.log(`ℹ️  [Background] Original file was already deleted from GCS: ${storagePath}`);
            } else {
              console.error(`❌ [Background] Error deleting original file from GCS:`, storageError.message);
            }
          }
        }

        console.log(`✅ [Background] File cleanup complete: ${fileId}`);
      } catch (backgroundError) {
        console.error(`❌ [Background] Unexpected error during background cleanup:`, backgroundError);
      }
    })();
  } catch (error) {
    console.error('❌ Error deleting file:', error);
    res.status(500).json({ error: 'Failed to delete file: ' + error.message });
  }
});

// Get user's models
app.get('/api/personal-agent/models', async (req, res) => {
  try {
    const { ownerAddress } = req.query;
    
    if (!ownerAddress) {
      return res.status(400).json({ error: 'ownerAddress is required' });
    }
    
    // Use helper function to ensure correct database
    const db = admin.getFirestore();
    
    if (!db) {
      return res.status(500).json({ 
        error: 'Firestore database not initialized',
        details: 'Firebase Admin may not have initialized correctly'
      });
    }
    
    // Query models by ownerAddress
    // Note: If orderBy is needed, a composite index is required
    // Try to use orderBy if index exists, otherwise fetch all and sort in memory
    let snapshot;
    let needsSorting = false;
    
    try {
      // Try query with orderBy first
      const modelsRef = db.collection('models')
        .where('ownerAddress', '==', ownerAddress.toLowerCase())
        .orderBy('createdAt', 'desc');
      snapshot = await modelsRef.get();
    } catch (indexError) {
      if (indexError.code === 9) {
        // Index doesn't exist, fetch without orderBy and sort in memory
        // Only log once per server instance to avoid spam
        if (!admin._indexWarningLogged) {
          console.log('⚠️  Composite index not found, fetching without orderBy and sorting in memory');
          console.log('💡 To create the index, visit:', indexError.details || 'Firebase Console > Firestore > Indexes');
          console.log('   (This warning will only appear once. The system will continue to work without the index.)');
          admin._indexWarningLogged = true;
        }
        snapshot = await db.collection('models')
          .where('ownerAddress', '==', ownerAddress.toLowerCase())
          .get();
        needsSorting = true;
      } else {
        throw indexError;
      }
    }
    
    const models = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Convert Firestore Timestamp to ISO string for frontend
      const modelData = { id: doc.id, ...data };
      if (data.createdAt) {
        if (data.createdAt.toDate && typeof data.createdAt.toDate === 'function') {
          modelData.createdAt = data.createdAt.toDate().toISOString();
        } else if (data.createdAt.seconds !== undefined) {
          modelData.createdAt = new Date(data.createdAt.seconds * 1000).toISOString();
        } else if (data.createdAt._seconds !== undefined) {
          modelData.createdAt = new Date(data.createdAt._seconds * 1000).toISOString();
        }
      }
      if (data.updatedAt) {
        if (data.updatedAt.toDate && typeof data.updatedAt.toDate === 'function') {
          modelData.updatedAt = data.updatedAt.toDate().toISOString();
        } else if (data.updatedAt.seconds !== undefined) {
          modelData.updatedAt = new Date(data.updatedAt.seconds * 1000).toISOString();
        } else if (data.updatedAt._seconds !== undefined) {
          modelData.updatedAt = new Date(data.updatedAt._seconds * 1000).toISOString();
        }
      }
      models.push(modelData);
    });
    
    // Sort in memory if needed
    if (needsSorting) {
      models.sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bTime - aTime; // Descending order
      });
    }
    
    res.json({ models });
  } catch (error) {
    console.error('❌ Error loading models:', error);
    
    if (error.code === 5) {
      return res.status(404).json({ 
        error: 'Firestore database not found',
        details: error.message,
        suggestion: 'See FIRESTORE_SETUP.md for troubleshooting steps'
      });
    }
    
    res.status(500).json({ error: 'Failed to load models: ' + error.message });
  }
});

app.post('/api/process-rag-file', async (req, res) => {
  const startTime = Date.now();
  let fileId, modelId, storagePath, filename, ownerAddress;
  
  try {
    ({ fileId, modelId, storagePath, filename, ownerAddress } = req.body);
    
    console.log(`\n📄 ========== Starting RAG Processing ==========`);
    console.log(`   File: ${filename}`);
    console.log(`   File ID: ${fileId}`);
    console.log(`   Model ID: ${modelId}`);
    console.log(`   Storage Path: ${storagePath}`);
    console.log(`   Owner: ${ownerAddress || 'not provided'}`);
    
    if (!fileId || !modelId || !storagePath || !filename) {
      const missing = [];
      if (!fileId) missing.push('fileId');
      if (!modelId) missing.push('modelId');
      if (!storagePath) missing.push('storagePath');
      if (!filename) missing.push('filename');
      console.error(`❌ Missing required fields: ${missing.join(', ')}`);
      return res.status(400).json({ 
        error: `Missing required fields: ${missing.join(', ')}` 
      });
    }
    
    console.log(`✅ All required fields present`);
    
    // Ensure AlloyDB is connected
    if (!dbPool) {
      console.log('🔌 Initializing AlloyDB connection...');
      await initAlloyDB();
    }
    
    // Update status to processing
    await updateFileStatus(fileId, 'processing');
    
    // Extract GCS path from storagePath
    const gcsPath = storagePath.replace('gs://i3-testnet-rag/', '');
    console.log(`📂 GCS Path: ${gcsPath}`);
    
    // Download file from GCS
    console.log(`⬇️ Step 1: Downloading file from GCS...`);
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    
    if (!exists) {
      console.error(`❌ File not found in GCS: ${gcsPath}`);
      throw new Error(`File not found in GCS: ${gcsPath}`);
    }
    console.log(`✅ File exists in GCS`);
    
    const [fileBuffer] = await file.download();
    console.log(`✅ Step 1 complete: Downloaded ${(fileBuffer.length / 1024).toFixed(2)} KB`);
    
    // Extract text from PDF
    console.log(`📖 Step 2: Extracting text from PDF...`);
    const pdfData = await pdf(fileBuffer);
    let text = pdfData.text;
    
    if (!text || text.trim().length === 0) {
      console.error(`❌ No text content found in PDF`);
      throw new Error('No text content found in PDF');
    }
    
    // Clean text immediately after extraction to remove null bytes and invalid UTF-8
    text = cleanTextForDatabase(text);
    
    if (!text || text.length === 0) {
      console.error(`❌ Text is empty after cleaning`);
      throw new Error('No valid text content found in PDF after cleaning');
    }
    
    console.log(`✅ Step 2 complete: Extracted ${text.length} characters from PDF (after cleaning)`);
    console.log(`   Preview: ${text.substring(0, 100)}...`);
    
    // Chunk the text
    console.log(`✂️ Step 3: Chunking text (size: 4000, overlap: 800)...`);
    const chunks = chunkText(text, 4000, 800);
    console.log(`✅ Step 3 complete: Created ${chunks.length} chunks`);
    if (chunks.length > 0) {
      console.log(`   First chunk preview: ${chunks[0].substring(0, 100)}...`);
    }
    
    // Process each chunk
    console.log(`🔄 Step 4: Processing ${chunks.length} chunks (embedding + storage)...`);
    let processedChunks = 0;
    const errors = [];
    
    for (let i = 0; i < chunks.length; i++) {
      try {
        const chunk = chunks[i];
        const chunkIndex = i + 1;
        
        console.log(`\n   📦 Chunk ${chunkIndex}/${chunks.length}:`);
        console.log(`      Size: ${chunk.length} characters`);
        
        // Get embedding
        console.log(`      🔍 Getting embedding from Vertex AI...`);
        let embedding;
        try {
          embedding = await getEmbedding(chunk);
          console.log(`      ✅ Got embedding (${embedding.length} dimensions)`);
        } catch (embeddingError) {
          // Log the error but continue processing other chunks
          console.error(`      ❌ Failed to get embedding for chunk ${chunkIndex}:`, embeddingError.message);
          errors.push({
            chunkIndex,
            error: embeddingError.message
          });
          continue; // Skip this chunk and continue with the next one
        }
        
        // Clean chunk content before processing
        const cleanedChunk = cleanTextForDatabase(chunk);
        if (!cleanedChunk || cleanedChunk.length === 0) {
          console.warn(`   ⚠️  Chunk ${chunkIndex} is empty after cleaning, skipping...`);
          continue; // Skip empty chunks
        }
        
        // Prepare chunk data
        const chunkData = {
          model_id: modelId,
          file_id: fileId,
          chunk_index: chunkIndex,
          content: cleanedChunk, // Use cleaned content
          source_uri: storagePath
        };
        
        // Store in AlloyDB
        console.log(`      💾 Storing in AlloyDB...`);
        const chunkId = await storeChunkInAlloyDB({
          modelId,
          fileId,
          chunkIndex,
          content: cleanedChunk, // Use cleaned content
          sourceUri: storagePath,
          embedding
        });
        console.log(`      ✅ Stored in AlloyDB (id: ${chunkId})`);
        
        // Save chunk JSON to GCS
        console.log(`      📁 Saving chunk JSON to GCS...`);
        const chunkJsonPath = await saveChunkToGCS(modelId, fileId, chunkIndex, {
          ...chunkData,
          embedding: embedding // Store embedding in JSON for reference
        });
        console.log(`      ✅ Saved to ${chunkJsonPath}`);
        
        processedChunks++;
        console.log(`   ✅ Chunk ${chunkIndex} processed successfully`);
        
        // Small delay to avoid rate limiting
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (error) {
        console.error(`   ❌ Error processing chunk ${i + 1}:`, error.message);
        console.error(`      Stack:`, error.stack);
        errors.push({ chunkIndex: i + 1, error: error.message });
      }
    }
    
    console.log(`\n✅ Step 4 complete: Processed ${processedChunks}/${chunks.length} chunks`);
    
    // Update status
    console.log(`\n📝 Step 5: Updating file status...`);
    if (processedChunks === chunks.length) {
      await updateFileStatus(fileId, 'ready');
      console.log(`✅ Step 5 complete: File status updated to 'ready'`);
      console.log(`✅ Successfully processed all ${processedChunks} chunks`);
    } else {
      const errorMsg = `Processed ${processedChunks}/${chunks.length} chunks. Errors: ${JSON.stringify(errors)}`;
      await updateFileStatus(fileId, 'failed', errorMsg);
      console.error(`❌ Step 5: File status updated to 'failed'`);
      console.error(`   Reason: ${errorMsg}`);
      throw new Error(`Failed to process all chunks: ${processedChunks}/${chunks.length} succeeded`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ ========== RAG Processing Complete ==========`);
    console.log(`   Duration: ${duration}s`);
    console.log(`   Chunks: ${processedChunks}/${chunks.length}`);
    console.log(`   Status: ready`);
    if (errors.length > 0) {
      console.log(`   ⚠️  Warnings: ${errors.length} chunk(s) had errors`);
    }
    
    res.json({
      success: true,
      status: 'ready',
      fileId,
      modelId,
      chunksProcessed: processedChunks,
      totalChunks: chunks.length,
      duration: `${duration}s`,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (error) {
    console.error(`\n❌ ========== RAG Processing Failed ==========`);
    console.error(`   File: ${filename || 'unknown'}`);
    console.error(`   File ID: ${fileId || 'unknown'}`);
    console.error(`   Error: ${error.message}`);
    console.error(`   Stack:`, error.stack);
    
    // Update status to failed
    if (fileId) {
      try {
        await updateFileStatus(fileId, 'failed', error.message);
        console.log(`✅ File status updated to 'failed'`);
      } catch (updateError) {
        console.error(`❌ Failed to update file status:`, updateError);
      }
    }
    
    res.status(500).json({
      success: false,
      status: 'failed',
      error: error.message,
      fileId,
      modelId,
      filename
    });
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