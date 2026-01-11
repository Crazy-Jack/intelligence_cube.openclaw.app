// 🔧 User Agents Firestore Helper
// This module queries Firestore for user agents (models with source: "user" or ownerAddress != null)
// 
// User agents are stored in Firestore collection: models/{modelId}
// NOT in AlloyDB (AlloyDB is only for knowledge chunks/RAG)

const admin = require('firebase-admin');
const { Firestore } = require('@google-cloud/firestore');

// Initialize Firebase Admin (if not already initialized)
let firestore = null;

function initializeFirestore() {
  if (firestore) {
    return firestore;
  }

  try {
    // Get project ID and database ID from environment or defaults
    const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'i3-testnet';
    const databaseId = process.env.FIRESTORE_DATABASE_ID || 'i3-testnet';
    
    // Use @google-cloud/firestore directly to specify database ID
    // This allows us to connect to a specific database (not just the default)
    const firestoreConfig = {
      projectId: projectId,
      databaseId: databaseId
    };
    
    // If service account key is provided, use it
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const serviceAccount = require(process.env.GOOGLE_APPLICATION_CREDENTIALS);
      firestoreConfig.keyFilename = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    }
    // Otherwise, use application default credentials (already set up via gcloud auth)
    
    firestore = new Firestore(firestoreConfig);
    console.log(`✅ Firestore initialized (project: ${projectId}, database: ${databaseId})`);
    return firestore;
  } catch (error) {
    console.error('❌ Error initializing Firestore Admin:', error);
    console.warn('⚠️ Make sure GOOGLE_APPLICATION_CREDENTIALS is set or running on GCP');
    return null;
  }
}

/**
 * Get all user agents from Firestore
 * Per PDF spec: User agents are models where source: "user"
 * Model ID format: model_{walletAddress}_{uuid}
 * 
 * @param {Object} options - Query options
 * @param {string} options.ownerAddress - Filter by owner wallet address (optional)
 * @param {boolean} options.publicOnly - Only return public models (optional)
 * @returns {Promise<Array>} Array of user agent objects with modelId and name
 */
async function listUserAgents(options = {}) {
  const db = initializeFirestore();
  if (!db) {
    throw new Error('Firestore not initialized. Please set up Firebase Admin credentials.');
  }

  try {
    const modelsRef = db.collection('models');
    
    // Per PDF spec: User models have source: "user"
    let query = modelsRef.where('source', '==', 'user');
    
    // Optional: Filter by owner address
    if (options.ownerAddress) {
      query = query.where('ownerAddress', '==', options.ownerAddress);
    }
    
    // Optional: Filter by public visibility
    if (options.publicOnly) {
      query = query.where('isPublic', '==', true);
    }
    
    const snapshot = await query.get();
    
    // Convert to array with modelId (document ID) and name
    const agents = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      agents.push({
        modelId: doc.id,                    // e.g., "model_0x0610..._abc123"
        name: data.name,                    // Model display name
        ownerAddress: data.ownerAddress,    // Wallet address of owner
        isPublic: data.isPublic || false,   // Visibility flag
        purpose: data.purpose,
        useCase: data.useCase,
        category: data.category,
        industry: data.industry,
        tokenPrice: data.tokenPrice,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        // Include all other fields
        ...data
      });
    });
    
    console.log(`✅ Retrieved ${agents.length} user agents from Firestore`);
    return agents;
    
  } catch (error) {
    console.error('❌ Error querying Firestore for user agents:', error);
    throw error;
  }
}

/**
 * Get a specific user agent by name from Firestore
 * Per PDF spec: Query models collection where source: "user" AND name matches
 * 
 * @param {string} name - Agent name (model name field)
 * @returns {Promise<Object|null>} User agent object with modelId and name, or null if not found
 */
async function getUserAgentByName(name) {
  if (!name) {
    throw new Error('Agent name is required');
  }

  const db = initializeFirestore();
  if (!db) {
    throw new Error('Firestore not initialized. Please set up Firebase Admin credentials.');
  }

  try {
    const modelsRef = db.collection('models');
    
    // Per PDF spec: User models have source: "user"
    // Query by name and source
    // NOTE: This requires a composite index in Firestore:
    // Collection: models, Fields: source (Ascending), name (Ascending)
    // If index doesn't exist, Firestore will throw an error with a link to create it
    const nameQuery = modelsRef
      .where('source', '==', 'user')
      .where('name', '==', name)
      .limit(1);
    
    const snapshot = await nameQuery.get(); //Query firestore
    
    if (snapshot.empty) {
      console.log(`⚠️ No user model found with name: ${name}`);
      return null;
    }
    
    const doc = snapshot.docs[0];
    const data = doc.data();
    
    console.log(`✅ Found user agent: ${name} (modelId: ${doc.id})`);
    return {
      modelId: doc.id,                    // e.g., "model_0x0610..._abc123"
      name: data.name,                    // Model display name
      ownerAddress: data.ownerAddress,    // Wallet address
      isPublic: data.isPublic || false,
      purpose: data.purpose,
      useCase: data.useCase,
      category: data.category,
      industry: data.industry,
      tokenPrice: data.tokenPrice,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      // Include all other fields
      ...data
    };
    
  } catch (error) {
    console.error('❌ Error querying Firestore for user agent:', error);
    
    // Check if error is about missing composite index
    if (error.message && (error.message.includes('index') || error.message.includes('Index'))) {
      console.error('⚠️ Firestore composite index required!');
      console.error('   Collection: models');
      console.error('   Fields: source (Ascending), name (Ascending)');
      console.error('   Firestore will provide a link in the error message to create it automatically');
    }
    
    throw error;
  }
}

/**
 * Get user agent by modelId (document ID)
 * Per PDF spec: Model ID format is model_{walletAddress}_{uuid}
 * 
 * @param {string} modelId - Firestore document ID (e.g., "model_0x0610..._abc123")
 * @returns {Promise<Object|null>} User agent object with modelId and name, or null if not found
 */
async function getUserAgentById(modelId) {
  if (!modelId) {
    throw new Error('Model ID is required');
  }

  const db = initializeFirestore();
  if (!db) {
    throw new Error('Firestore not initialized. Please set up Firebase Admin credentials.');
  }

  try {
    const docRef = db.collection('models').doc(modelId);
    const doc = await docRef.get();
    
    if (!doc.exists) {
      console.log(`⚠️ No model found with ID: ${modelId}`);
      return null;
    }
    
    const data = doc.data();
    
    // Per PDF spec: Verify it's a user agent (source: "user")
    if (data.source !== 'user') {
      console.log(`⚠️ Model "${modelId}" is not a user model (source: ${data.source})`);
      return null;
    }
    
    console.log(`✅ Found user agent by ID: ${modelId} (name: ${data.name})`);
    return {
      modelId: doc.id,                    // e.g., "model_0x0610..._abc123"
      name: data.name,                    // Model display name
      ownerAddress: data.ownerAddress,    // Wallet address
      isPublic: data.isPublic || false,
      purpose: data.purpose,
      useCase: data.useCase,
      category: data.category,
      industry: data.industry,
      tokenPrice: data.tokenPrice,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      // Include all other fields
      ...data
    };
    
  } catch (error) {
    console.error('❌ Error querying Firestore for user agent by ID:', error);
    throw error;
  }
}

/**
 * Check if Firestore is properly initialized
 * @returns {boolean} True if initialized, false otherwise
 */
function isFirestoreConfigured() {
  return firestore !== null;
}

module.exports = {
  listUserAgents,
  getUserAgentByName,
  getUserAgentById,
  isFirestoreConfigured,
  initializeFirestore
};

