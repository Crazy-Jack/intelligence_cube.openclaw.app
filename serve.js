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

// I3 API Configuration
const I3_API_BASE_URL = process.env.I3_API_BASE_URL || 'http://34.71.119.178:8000';
const I3_API_KEY = process.env.I3_API_KEY || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';

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

// Initialize Vertex AI (kept for potential future use, but embeddings now use I3 API)
let vertexAI = null;

try {
  vertexAI = new VertexAI({
    project: 'i3-testnet',
    location: 'us-central1'
  });
  console.log('✅ Vertex AI initialized (embeddings now use I3 API with i3-embedding model for 1536 dimensions)');
} catch (error) {
  console.warn('⚠️ Vertex AI initialization warning:', error.message);
}

// Initialize AlloyDB connection pool
let dbPool = null;

async function initAlloyDB() {
  try {
    // AlloyDB connection - prioritize private IP for secure VPC connection
    // Private IP is used for Cloud Run via VPC Connector
    // Public IP is fallback for local development
    const dbHost = process.env.ALLOYDB_PRIVATE_IP || process.env.ALLOYDB_PUBLIC_IP || process.env.DB_HOST;
    
    if (!dbHost) {
      console.log('⚠️ ALLOYDB_PRIVATE_IP or ALLOYDB_PUBLIC_IP not set');
      console.log('💡 For Cloud Run deployment (recommended):');
      console.log('   export ALLOYDB_PRIVATE_IP');
      console.log('💡 For local development with public IP:');
      console.log('   export ALLOYDB_PUBLIC_IP');
      throw new Error('ALLOYDB_PRIVATE_IP or ALLOYDB_PUBLIC_IP environment variable is required');
    }
    
    // Extract IP address if port is included 
    let cleanHost = dbHost;
    if (dbHost.includes(':')) {
      cleanHost = dbHost.split(':')[0];
      console.log(`ℹ️  Extracted IP from "${dbHost}" -> "${cleanHost}" (port will be 5432)`);
    }
    
    // Detect connection type (private IP vs public IP)
    const isPrivateIP = /^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.)/.test(cleanHost);
    
    if (isPrivateIP) {
      console.log(`🔒 Connecting to AlloyDB via private IP: ${cleanHost}:5432`);
      console.log('   Using secure VPC connection (recommended for Cloud Run)');
    } else {
      console.log(`🔌 Connecting to AlloyDB via public IP: ${cleanHost}:5432`);
      console.log('   ⚠️  Consider using private IP (ALLOYDB_PRIVATE_IP) for better security');
    }
    
    // Configure connection pool
    const poolConfig = {
      host: cleanHost,
      port: 5432,
      database: 'postgres',
      user: 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: {
        rejectUnauthorized: false  // Google Cloud internal networks use SSL but don't require strict verification
      },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: isPrivateIP ? 5000 : 15000  // Private IP is faster (internal network)
    };
    
    if (!poolConfig.password) {
      throw new Error('DB_PASSWORD environment variable is required. Please set it before starting the server.');
    }
    
    // Test connection first
    console.log(`🧪 Testing connection to AlloyDB...`);
    const testPool = new Pool(poolConfig);
    
    try {
      const testResult = await testPool.query('SELECT NOW() as now, version(), inet_server_addr() as server_ip');
      console.log('✅ AlloyDB connection test successful!');
      console.log(`   Database time: ${testResult.rows[0].now}`);
      console.log(`   Database server IP: ${testResult.rows[0].server_ip}`);
      console.log(`   PostgreSQL: ${testResult.rows[0].version.split(' ')[0]} ${testResult.rows[0].version.split(' ')[1]}`);
      await testPool.end();
    } catch (testError) {
      await testPool.end();
      console.error('❌ AlloyDB connection test failed:', testError.message);
      console.error('   Error code:', testError.code);
      
      if (testError.code === 'ETIMEDOUT') {
        console.error('');
        console.error('💡 Connection timeout troubleshooting:');
        if (isPrivateIP) {
          console.error('   For private IP connections from Cloud Run:');
          console.error('   1. Ensure VPC Connector is created and attached to Cloud Run service');
          console.error('   2. Check firewall rule allows traffic from VPC Connector to AlloyDB (port 5432)');
          console.error('   3. Verify VPC Connector IP range');
          console.error('   See deployment guide for VPC Connector setup');
        } else {
          console.error('   For public IP connections:');
          console.error('   1. Verify public IP is enabled on AlloyDB instance');
          console.error('   2. Check authorized networks list includes your IP');
          console.error('   3. Verify firewall rules allow connections on port 5432');
        }
      }
      
      throw testError;
    }
    
    // Create main connection pool
    dbPool = new Pool(poolConfig);
    
    // Verify the main pool
    const result = await dbPool.query('SELECT NOW() as now');
    console.log('✅ AlloyDB connection pool ready');
    console.log(`   Connection type: ${isPrivateIP ? 'Private IP (VPC)' : 'Public IP'}`);
    console.log(`   Database time: ${result.rows[0].now}`);
    
  } catch (error) {
    console.error('❌ AlloyDB connection error:', error.message);
    throw error;
  }
}

// Initialize AlloyDB on startup (non-blocking)
initAlloyDB().catch(err => {
  console.error('⚠️ AlloyDB initialization failed, will retry on first API request:', err.message);
  console.log('💡 Make sure to set ALLOYDB_PRIVATE_IP (for Cloud Run) or ALLOYDB_PUBLIC_IP (for local dev)');
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

// Serve static files from dist folder (built/bundled files)
// In production, all frontend files should be served from dist/
app.use(express.static(path.join(__dirname, 'dist')));

// For development, also serve from root (but dist takes priority)
if (process.env.NODE_ENV !== 'production') {
  app.use(express.static(__dirname));
}

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
  
  // Try private IP first (Cloud Run), then public IP (local dev), then Auth Proxy
  const privateIP = process.env.ALLOYDB_PRIVATE_IP;
  const publicIP = process.env.ALLOYDB_PUBLIC_IP || process.env.ALLOYDB_HOST;
  const useAlloyDBAuthProxy = process.env.USE_ALLOYDB_AUTH_PROXY === 'true';
  
  if (privateIP) {
    // Use private IP connection (recommended for Cloud Run)
    alloydb.initializeAlloyDB({ host: privateIP });
    console.log(`🔒 Connecting to AlloyDB via private IP: ${privateIP}`);
  } else if (publicIP) {
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
      console.log('⚠️ AlloyDB not connected. Set ALLOYDB_PRIVATE_IP, ALLOYDB_PUBLIC_IP, or USE_ALLOYDB_AUTH_PROXY=true');
      if (!privateIP && !publicIP && !useAlloyDBAuthProxy) {
        console.log('   Option 1 (recommended): Set ALLOYDB_PRIVATE_IP for VPC connection');
        console.log('   Option 2: Set ALLOYDB_PUBLIC_IP for direct connection');
        console.log('   Option 3: Set USE_ALLOYDB_AUTH_PROXY=true and start the proxy');
      }
    }
  }, 1000);
} catch (error) {
  console.warn('⚠️ AlloyDB connection not available:', error.message);
  console.warn('   To enable: Set ALLOYDB_PRIVATE_IP (for Cloud Run) or ALLOYDB_PUBLIC_IP (for local dev)');
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
    const apiKey = req.headers['i3-api-key'] || I3_API_KEY;
    
    if (!input) {
      return res.status(400).json({ error: 'Input text is required' });
    }
    
    console.log('🔍 Proxying embeddings request:', { model, inputLength: input.length });
    
    const response = await fetch(`${I3_API_BASE_URL}/embeddings`, {
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
    const apiKey = req.headers['i3-api-key'] || I3_API_KEY;
    
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
    // Extract system instruction from messages if not provided separately
    // Frontend sends system message in messages array, but backend also accepts systemInstruction field
    let extractedSystemInstruction = systemInstruction;
    if (!extractedSystemInstruction && messages && Array.isArray(messages)) {
      const systemMessages = messages.filter(m => m.role === 'system');
      if (systemMessages.length > 0) {
        extractedSystemInstruction = systemMessages.map(m => 
          typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
        ).join('\n\n');
        // Remove system messages from messages array (I3 API will get systemInstruction separately)
        req.body.messages = messages.filter(m => m.role !== 'system');
        // Set systemInstruction in request body for I3 API
        req.body.systemInstruction = extractedSystemInstruction;
      }
    }
    
    // Try to get agent from Firestore
    // Priority: 1) Use modelId if provided (unique, collision-proof)
    //           2) Fall back to name lookup (legacy, may have collisions)
    let agentModelId = null;
    const providedModelId = req.body.modelId; // New: modelId passed from frontend
    
    if (providedModelId || isUserAgent(model)) {
      console.log('🤖 Looking up agent in Firestore...', providedModelId ? `(modelId: ${providedModelId})` : `(name: ${model})`);
      
      // Query Firestore to get the agent
      // If anything fails (not found, missing modelId, query error, Firestore not configured),
      // just treat it as a regular model and route to I3 API
      if (userAgentsFirestore && userAgentsFirestore.isFirestoreConfigured()) {
        try {
          // Prefer modelId lookup (unique) over name lookup (may have collisions)
          let agent = null;
          if (providedModelId) {
            agent = await userAgentsFirestore.getUserAgentById(providedModelId);
          } else {
            // Legacy fallback: query by name (may return wrong agent if names collide)
            console.log('⚠️ No modelId provided, falling back to name lookup (potential collision risk)');
            agent = await userAgentsFirestore.getUserAgentByName(model);
          }
          
          if (agent && agent.modelId) {
            agentModelId = agent.modelId;
            console.log(`✅ Found user agent in Firestore: ${agent.name} → modelId: ${agentModelId}`);
            console.log(`   Purpose: ${agent.purpose || 'N/A'}`);
            console.log(`   Use Case: ${agent.useCase || 'N/A'}`);
            console.log(`   Custom System Prompt: ${agent.systemPrompt ? 'Yes (' + agent.systemPrompt.length + ' chars)' : 'No'}`);
            
            // Increment access count for this model
            try {
              const db = admin.getFirestore();
              if (db) {
                // Get today's date in YYYY-MM-DD format
                const today = new Date().toISOString().split('T')[0];
                
                // Update this model's accessCount and dailyStats
                db.collection('models').doc(agentModelId).update({
                  accessCount: admin.firestore.FieldValue.increment(1),
                  [`dailyStats.${today}`]: admin.firestore.FieldValue.increment(1),
                  lastAccessedAt: admin.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                  console.log(`📊 Incremented accessCount and dailyStats[${today}] for ${model}`);
                }).catch(err => {
                  console.warn(`⚠️ Failed to increment accessCount: ${err.message}`);
                });
                
                // Recursively increment forkedUsage up the entire fork chain
                // If A → B → C, when C is queried, both B and A get forkedUsage credit
                const incrementForkChain = async (modelId, depth = 0) => {
                  // Safety limit to prevent infinite loops (max 10 levels deep)
                  if (depth > 10) {
                    console.warn(`⚠️ Fork chain depth limit reached at ${modelId}`);
                    return;
                  }
                  
                  try {
                    const doc = await db.collection('models').doc(modelId).get();
                    if (!doc.exists) return;
                    
                    const data = doc.data();
                    if (!data.forkedFrom) return; // Reached original model, stop
                    
                    // Increment parent's forkedUsage and dailyStats
                    await db.collection('models').doc(data.forkedFrom).update({
                      forkedUsage: admin.firestore.FieldValue.increment(1),
                      [`dailyStats.${today}`]: admin.firestore.FieldValue.increment(1)
                    });
                    console.log(`📊 Incremented forkedUsage for ancestor (depth ${depth}): ${data.forkedFrom}`);
                    
                    // Recursively continue up the chain
                    await incrementForkChain(data.forkedFrom, depth + 1);
                  } catch (err) {
                    console.warn(`⚠️ Failed to increment fork chain at depth ${depth}: ${err.message}`);
                  }
                };
                
                // Start the recursive chain from this model
                incrementForkChain(agentModelId, 0);
              }
            } catch (accessCountError) {
              console.warn(`⚠️ Could not increment accessCount: ${accessCountError.message}`);
            }
            
            // If agent has a custom system prompt, use it instead of the frontend-generated one
            if (agent.systemPrompt) {
              console.log('🔄 Using custom system prompt from Firestore');
              req.body.systemInstruction = agent.systemPrompt;
              extractedSystemInstruction = agent.systemPrompt;
            } else {
              // Build default system prompt from purpose and useCase
              const defaultPrompt = `You are ${model}. ${agent.purpose || ''}\n\nUse Case: ${agent.useCase || ''}\n\nIMPORTANT: When "Relevant Knowledge Base Context" is provided below, prioritize information from those knowledge chunks to answer the user's question. Cite or reference the relevant chunks when applicable. If the knowledge base doesn't contain relevant information, use your general knowledge to provide a helpful response.\n\nAnswer the user's question as this specialized model would.`;
              console.log('🔄 Using default system prompt (built from purpose/useCase)');
              req.body.systemInstruction = defaultPrompt;
              extractedSystemInstruction = defaultPrompt; //extractedSystemInstruction is then used to build the system prompt to pass onto I3 API
            }
            
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
                  const apiKey = req.headers['i3-api-key'] || I3_API_KEY;
                  const embeddingResponse = await fetch(`${I3_API_BASE_URL}/embeddings`, {
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
                    // Handle I3 API response format: {success: true, data: {data: [{embedding: [...]}]}}
                    let queryEmbedding = embeddingData.data?.data?.[0]?.embedding || embeddingData.data?.[0]?.embedding;
                    
                    if (queryEmbedding && Array.isArray(queryEmbedding)) {
                      console.log(`✅ Generated query embedding (dimension: ${queryEmbedding.length})`);
                      
                      // No truncation needed - both model creator and user chat use 1536 dimensions
                      
                      // Search AlloyDB for similar chunks using cosine similarity
                      const similarChunks = await alloydb.searchSimilarChunks(
                        agentModelId, 
                        queryEmbedding, 
                        { limit: 5 }
                      );
                      
                      if (similarChunks && similarChunks.length > 0) {
                        console.log(`📚 Retrieved ${similarChunks.length} relevant knowledge chunks`);
                        
                        // Log similarity scores
                        console.log('📊 Similarity scores:');
                        similarChunks.forEach((chunk, idx) => {
                          const similarity = chunk.similarity ? chunk.similarity.toFixed(4) : 'N/A';
                          const preview = chunk.content.substring(0, 60).replace(/\n/g, ' ');
                          console.log(`   ${idx + 1}. Similarity: ${similarity} - "${preview}..."`);
                        });
                        
                        // Format chunks for system instruction
                        const chunksText = similarChunks
                          .map((chunk, idx) => `[Knowledge Chunk ${idx + 1}]\n${chunk.content}`)
                          .join('\n\n');
                        
                        // Add chunks to system instruction
                        const ragContext = `\n\n=== Relevant Knowledge Base Context ===\n${chunksText}\n=== End of Knowledge Base Context ===\n`;
                        
                        // Update system instruction with RAG context
                        if (req.body.systemInstruction || extractedSystemInstruction) {
                          req.body.systemInstruction = (req.body.systemInstruction || extractedSystemInstruction) + ragContext;
                        } else {
                          req.body.systemInstruction = ragContext;
                        }
                        
                        console.log(`✅ Added ${similarChunks.length} knowledge chunks to system instruction`);
                        console.log('📝 Final system instruction length:', req.body.systemInstruction.length, 'characters');
                        console.log('\n📋 Full System Instruction:');
                        console.log('─'.repeat(80));
                        console.log(req.body.systemInstruction);
                        console.log('─'.repeat(80));
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
    
    // Prepare request body for I3 API
    // If this is a user agent, replace the model name with a valid I3 model name
    const i3RequestBody = { ...req.body };
    if (isUserAgent(model)) {
      // I3 API doesn't recognize user agent names - use default I3 model
      const defaultI3Model = 'I3-Generic-Foundation-LLM';
      console.log(`🔄 Replacing user agent model "${model}" with I3 model "${defaultI3Model}"`);
      i3RequestBody.model = defaultI3Model;
    }
    
    // Convert systemInstruction to system message for I3 API (OpenAI format)
    // I3 API expects system messages in the messages array, not as a separate field
    if (i3RequestBody.systemInstruction) {
      console.log('🔄 Converting systemInstruction to system message in messages array');
      const systemMessage = {
        role: 'system',
        content: i3RequestBody.systemInstruction
      };
      // Add system message at the beginning of messages array
      i3RequestBody.messages = [systemMessage, ...(i3RequestBody.messages || [])];
      // Remove systemInstruction field as I3 API doesn't use it
      delete i3RequestBody.systemInstruction;
      console.log('✅ System message added to messages array (length:', systemMessage.content.length, 'characters)');
    }
    
    console.log('📤 Sending request to I3 API with', i3RequestBody.messages?.length || 0, 'messages');
    const response = await fetch(`${I3_API_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'I3-API-Key': apiKey
      },
      body: JSON.stringify(i3RequestBody)
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

// ========== Personal Co-Creation RAG Processing API ==========

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

// Helper: Get embedding from I3 API using i3-embedding (1536 dimensions)
// With retry logic for API errors
async function getEmbedding(text, maxRetries = 3) {
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Use I3 API for embeddings (consistent with user query embeddings)
      const embeddingResponse = await fetch(`${I3_API_BASE_URL}/embeddings`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'I3-API-Key': I3_API_KEY
        },
        body: JSON.stringify({ 
          model: 'i3-embedding', 
          input: text 
        })
      });
      
      if (!embeddingResponse.ok) {
        const errorText = await embeddingResponse.text();
        console.error('❌ I3 API error response:', errorText);
        throw new Error(`I3 API error: ${embeddingResponse.status} - ${errorText}`);
      }
      
      const embeddingData = await embeddingResponse.json();
      // Handle I3 API response format: {success: true, data: {data: [{embedding: [...]}]}}
      let embedding = embeddingData.data?.data?.[0]?.embedding || embeddingData.data?.[0]?.embedding;
      
      if (!embedding || !Array.isArray(embedding)) {
        console.error('❌ Invalid embedding response:', JSON.stringify(embeddingData, null, 2));
        throw new Error('Invalid response format from I3 API. Expected array of numbers.');
      }
      
      // Ensure all values are numbers
      embedding = embedding.map(v => typeof v === 'number' ? v : parseFloat(v));
      
      // I3 API embedding should return 1536 dimensions
      if (embedding.length !== 1536) {
        console.warn(`⚠️ Expected 1536 dimensions, got ${embedding.length}. Using as-is.`);
      }
      
      // Success! Return the embedding
      return embedding;
    } catch (error) {
      lastError = error;
      
      // Retry logic for network errors
      const errorMessage = error.message || error.toString() || '';
      const isRetryableError = (
        errorMessage.includes('ECONNREFUSED') ||
        errorMessage.includes('ETIMEDOUT') ||
        errorMessage.includes('ENOTFOUND') ||
        errorMessage.includes('fetch failed')
      );
      
      if (isRetryableError && attempt < maxRetries) {
        // Exponential backoff: wait 1s, 2s, 4s
        const waitTime = Math.pow(2, attempt - 1) * 1000;
        console.warn(`⚠️  Network error on attempt ${attempt}/${maxRetries} for embedding, retrying in ${waitTime}ms...`);
        console.warn(`   Error: ${errorMessage.substring(0, 200)}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      } else {
        // Not retryable or max retries reached
        if (attempt >= maxRetries) {
          console.error(`❌ I3 API embedding error after ${maxRetries} attempts:`, errorMessage);
        } else {
          console.error('❌ I3 API embedding error (non-retryable):', errorMessage);
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
// ========== Personal Co-Creation - Model Management APIs ==========

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
    const { name, ownerAddress, isPublic, purpose, useCase, systemPrompt, category, industry, tokenPrice } = req.body;
    
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
      console.error('❌ Firestore database is null/undefined');
      console.error('   admin.firestoreDb:', admin.firestoreDb);
      console.error('   admin.firestoreDbId:', admin.firestoreDbId);
      console.error('   admin.apps.length:', admin.apps.length);
      return res.status(500).json({ 
        error: 'Firestore database not initialized',
        details: 'Firebase Admin SDK may not have initialized correctly. Check server logs for initialization errors.'
      });
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
      systemPrompt: systemPrompt || null, // Custom system prompt for the agent
      category: category || null,
      industry: industry || null,
      tokenPrice: tokenPrice !== null && tokenPrice !== undefined ? tokenPrice : 2, // Default to 2 if not provided
      forkedUsagePrice: 1, // Default forked usage price
      purchasedPercent: null,
      sharePrice: 10, // Default sharePrice is 10, not user-editable
      change: null,
      rating: null,
      usage: null,
      compatibility: null,
      totalScore: null,
      paperLink: null,
      accessCount: 0, // Track number of times this model is accessed
      forkedCount: 0, // Track number of times this model is forked
      forkedUsage: 0, // Track usage from forked models
      dailyStats: {}, // Daily query counts { "2024-01-18": 5, ... }
      lastAccessedAt: null, // Timestamp of last access
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

// Fork an existing public agent
app.post('/api/personal-agent/fork', async (req, res) => {
  try {
    const { sourceModelId, ownerAddress } = req.body;
    
    if (!sourceModelId || !ownerAddress) {
      return res.status(400).json({ error: 'sourceModelId and ownerAddress are required' });
    }
    
    console.log(`🔀 Fork request: ${sourceModelId} → ${ownerAddress}`);
    
    // Get Firestore database
    let db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    // Step 1: Get the source agent from Firestore
    const sourceDoc = await db.collection('models').doc(sourceModelId).get();
    if (!sourceDoc.exists) {
      return res.status(404).json({ error: 'Source agent not found' });
    }
    
    const sourceData = sourceDoc.data();
    
    // Verify source is public (only public agents can be forked)
    if (!sourceData.isPublic) {
      return res.status(403).json({ error: 'Only public agents can be forked' });
    }
    /*
    // Don't allow forking your own agent
    if (sourceData.ownerAddress?.toLowerCase() === ownerAddress.toLowerCase()) {
      return res.status(400).json({ error: 'You cannot fork your own agent' });
    }
    */
    // Step 2: Generate new model ID for the forked agent
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const newModelId = `model_${ownerAddress.toLowerCase().replace('0x', '')}_${timestamp}_${random}`;
    
    // Step 3: Create the forked agent in Firestore
    const forkedModelData = {
      name: `[Fork] ${sourceData.name}`,
      slug: newModelId,
      ownerAddress: ownerAddress.toLowerCase(),
      source: 'user',
      isPublic: false, // Forked agents start as private
      purpose: sourceData.purpose || null,
      hiddenPurpose: null,
      useCase: sourceData.useCase || null,
      hiddenUseCase: null,
      systemPrompt: sourceData.systemPrompt || null,
      category: sourceData.category || null,
      industry: sourceData.industry || null,
      tokenPrice: sourceData.tokenPrice ?? 2,
      forkedUsagePrice: sourceData.forkedUsagePrice ?? 1,
      purchasedPercent: null,
      sharePrice: 10,
      change: null,
      rating: null,
      usage: null,
      compatibility: null,
      totalScore: null,
      paperLink: null,
      accessCount: 0,
      forkedCount: 0,
      forkedUsage: 0,
      dailyStats: {}, // Daily query counts
      lastAccessedAt: null,
      // Fork attribution
      forkedFrom: sourceModelId,
      forkedFromName: sourceData.name,
      forkedFromOwner: sourceData.ownerAddress,
      forkedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    const newModelRef = db.collection('models').doc(newModelId);
    await newModelRef.set(forkedModelData);
    console.log(`✅ Forked agent created in Firestore: ${newModelId}`);
    
    // Increment forkedCount on the source model
    try {
      await db.collection('models').doc(sourceModelId).update({
        forkedCount: admin.firestore.FieldValue.increment(1)
      });
      console.log(`✅ Incremented forkedCount for source model: ${sourceModelId}`);
    } catch (updateError) {
      console.warn(`⚠️ Failed to increment forkedCount: ${updateError.message}`);
      // Don't fail the fork if this update fails
    }
    
    // Step 4: Copy embeddings from AlloyDB
    let embeddingsCopied = 0;
    if (alloydb && alloydb.isAlloyDBConnected()) {
      try {
        // Copy all knowledge_chunks from source to new model
        const copyResult = await alloydb.query(`
          INSERT INTO knowledge_chunks (model_id, chunk_text, embedding, source_file, chunk_index, created_at)
          SELECT 
            $1,
            chunk_text,
            embedding,
            '[Inherited]',
            chunk_index,
            NOW()
          FROM knowledge_chunks
          WHERE model_id = $2
        `, [newModelId, sourceModelId]);
        
        embeddingsCopied = copyResult.rowCount || 0;
        console.log(`✅ Copied ${embeddingsCopied} embeddings from AlloyDB`);
      } catch (alloyError) {
        console.warn(`⚠️ Failed to copy embeddings: ${alloyError.message}`);
        // Don't fail the entire fork - agent is still created, just without embeddings
      }
    } else {
      console.log('⚠️ AlloyDB not connected - skipping embedding copy');
    }
    
    // Step 5: Return success response
    res.json({
      success: true,
      newModelId: newModelId,
      name: forkedModelData.name,
      forkedFrom: sourceModelId,
      embeddingsCopied: embeddingsCopied,
      message: `Successfully forked "${sourceData.name}" as "${forkedModelData.name}"`
    });
    
    console.log(`✅ Fork complete: ${sourceModelId} → ${newModelId} (${embeddingsCopied} embeddings copied)`);
    
  } catch (error) {
    console.error('❌ Fork error:', error);
    res.status(500).json({ error: 'Failed to fork agent: ' + error.message });
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
      systemPrompt: updates.systemPrompt,
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

// Download file - generate signed URL for file access
app.get('/api/personal-agent/files/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    
    console.log(`📥 Generating download URL for file: ${fileId}`);
    
    // Get file metadata from Firestore
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const filesRef = db.collection('modelFiles');
    const snapshot = await filesRef.where('fileId', '==', fileId).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    let fileData = null;
    snapshot.forEach(doc => {
      fileData = doc.data();
    });
    
    if (!fileData || !fileData.storagePath) {
      return res.status(404).json({ error: 'File storage path not found' });
    }
    
    // Extract GCS path from storagePath (e.g., "gs://i3-testnet-rag/raw/modelId/filename" -> "raw/modelId/filename")
    const storagePath = fileData.storagePath;
    let gcsPath = storagePath;
    if (storagePath.startsWith('gs://')) {
      // Remove "gs://bucket-name/" prefix
      const parts = storagePath.replace('gs://', '').split('/');
      parts.shift(); // Remove bucket name
      gcsPath = parts.join('/');
    }
    
    console.log(`   Storage path: ${storagePath}`);
    console.log(`   GCS path: ${gcsPath}`);
    
    // Check if bucket is initialized
    if (!bucket) {
      return res.status(500).json({ error: 'Google Cloud Storage not initialized' });
    }
    
    // Generate signed URL (valid for 15 minutes)
    const file = bucket.file(gcsPath);
    
    // Check if file exists
    const [exists] = await file.exists();
    if (!exists) {
      console.error(`❌ File does not exist in GCS: ${gcsPath}`);
      return res.status(404).json({ error: 'File not found in storage' });
    }
    
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      expires: Date.now() + 15 * 60 * 1000, // 15 minutes
      responseDisposition: `inline; filename="${fileData.filename || 'download'}"`,
      responseType: fileData.mimeType || 'application/pdf'
    });
    
    console.log(`✅ Generated signed URL for ${fileData.filename}`);
    
    res.json({ 
      downloadUrl: signedUrl,
      filename: fileData.filename,
      mimeType: fileData.mimeType || 'application/pdf'
    });
    
  } catch (error) {
    console.error('❌ Error generating download URL:', error);
    res.status(500).json({ error: 'Failed to generate download URL: ' + error.message });
  }
});

// Extract text content from file (for auto-generation features)
app.get('/api/personal-agent/files/:fileId/text', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { maxLength } = req.query; // Optional parameter to limit text length
    
    console.log(`📄 Extracting text from file: ${fileId}`);
    
    // Get file metadata from Firestore
    const db = admin.getFirestore();
    if (!db) {
      return res.status(500).json({ error: 'Firestore database not initialized' });
    }
    
    const filesRef = db.collection('modelFiles');
    const snapshot = await filesRef.where('fileId', '==', fileId).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    let fileData = null;
    snapshot.forEach(doc => {
      fileData = doc.data();
    });
    
    if (!fileData || !fileData.storagePath) {
      return res.status(404).json({ error: 'File storage path not found' });
    }
    
    // Extract GCS path from storagePath
    const storagePath = fileData.storagePath;
    let gcsPath = storagePath;
    if (storagePath.startsWith('gs://')) {
      const parts = storagePath.replace('gs://', '').split('/');
      parts.shift(); // Remove bucket name
      gcsPath = parts.join('/');
    }
    
    // Check if bucket is initialized
    if (!bucket) {
      return res.status(500).json({ error: 'Google Cloud Storage not initialized' });
    }
    
    // Download file from GCS
    const file = bucket.file(gcsPath);
    const [exists] = await file.exists();
    
    if (!exists) {
      return res.status(404).json({ error: 'File not found in storage' });
    }
    
    const [fileBuffer] = await file.download();
    
    let extractedText = '';
    
    // Extract text based on file type
    const mimeType = fileData.mimeType || '';
    const filename = fileData.filename || '';
    
    if (mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      // Extract text from PDF
      try {
        const pdfData = await pdf(fileBuffer);
        extractedText = pdfData.text || '';
      } catch (pdfError) {
        console.error('PDF parsing error:', pdfError);
        return res.status(500).json({ error: 'Failed to extract text from PDF' });
      }
    } else if (mimeType.startsWith('text/') || 
               filename.toLowerCase().endsWith('.txt') ||
               filename.toLowerCase().endsWith('.md') ||
               filename.toLowerCase().endsWith('.json') ||
               filename.toLowerCase().endsWith('.csv')) {
      // Plain text files
      extractedText = fileBuffer.toString('utf-8');
    } else {
      // Unsupported file type
      return res.status(400).json({ 
        error: 'Unsupported file type for text extraction',
        mimeType: mimeType,
        filename: filename
      });
    }
    
    // Apply max length if specified
    if (maxLength && extractedText.length > parseInt(maxLength)) {
      extractedText = extractedText.slice(0, parseInt(maxLength));
    }
    
    console.log(`✅ Extracted ${extractedText.length} characters from ${filename}`);
    
    res.json({
      success: true,
      text: extractedText,
      filename: fileData.filename,
      mimeType: fileData.mimeType,
      length: extractedText.length
    });
    
  } catch (error) {
    console.error('❌ Error extracting text:', error);
    res.status(500).json({ error: 'Failed to extract text: ' + error.message });
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

// Get a single model by ID
app.get('/api/personal-agent/models/:modelId', async (req, res) => {
  try {
    const { modelId } = req.params;
    
    if (!modelId) {
      return res.status(400).json({ error: 'modelId is required' });
    }
    
    const db = admin.getFirestore();
    
    if (!db) {
      return res.status(500).json({ 
        error: 'Firestore database not initialized'
      });
    }
    
    const modelDoc = await db.collection('models').doc(modelId).get();
    
    if (!modelDoc.exists) {
      return res.status(404).json({ error: 'Model not found' });
    }
    
    const data = modelDoc.data();
    const modelData = { id: modelDoc.id, ...data };
    
    // Convert Firestore Timestamps
    if (data.createdAt) {
      if (data.createdAt.toDate && typeof data.createdAt.toDate === 'function') {
        modelData.createdAt = data.createdAt.toDate().toISOString();
      } else if (data.createdAt.seconds !== undefined) {
        modelData.createdAt = new Date(data.createdAt.seconds * 1000).toISOString();
      } else if (data.createdAt._seconds !== undefined) {
        modelData.createdAt = new Date(data.createdAt._seconds * 1000).toISOString();
      }
    }
    
    res.json({ model: modelData });
  } catch (error) {
    console.error('❌ Error fetching model:', error);
    res.status(500).json({ error: 'Failed to fetch model: ' + error.message });
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
        console.log(`      🔍 Getting embedding from I3 API...`);
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

// Serve the main page from dist folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
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