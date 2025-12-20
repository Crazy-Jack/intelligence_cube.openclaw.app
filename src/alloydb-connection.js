// 🔧 AlloyDB Connection Helper
// This module connects to AlloyDB (PostgreSQL with pgvector) for RAG queries
// 
// AlloyDB stores knowledge chunks with embeddings in the `knowledge_chunks` table
// NOT user agents (those are in Firestore)

const { Pool } = require('pg');

// AlloyDB connection details from PDF
const ALLOYDB_CONFIG = {
  // Connection name format: project:region:instance
  connectionName: 'i3-testnet:us-central1:personal-agent-cluster-primary',
  
  // Resource path from PDF
  resourcePath: 'projects/i3-testnet/locations/us-central1/clusters/personal-agent-cluster/instances/personal-agent-cluster-primary',
  
  // Database credentials
  user: 'postgres',
  password: 'u6fF4uvXqvN?S]:q',
  database: 'postgres', // Default database
  
  // Connection options
  port: 5432,
  
  // For Cloud SQL Proxy (recommended for local dev)
  // If using Cloud SQL Proxy, set host to the socket path:
  // host: '/cloudsql/i3-testnet:us-central1:personal-agent-cluster-primary'
  
  // For direct connection (if public IP enabled)
  // You'll need to get the IP from GCP Console:
  // host: '34.XXX.XXX.XXX' // Get from AlloyDB instance details
};

let pool = null;

/**
 * Initialize AlloyDB connection pool
 * @param {Object} options - Connection options
 * @param {string} options.host - Database host (IP or Cloud SQL Proxy socket)
 * @param {number} options.port - Database port (default: 5432)
 * @param {boolean} options.useCloudSqlProxy - Use Cloud SQL Proxy socket (default: false)
 * @returns {Pool} PostgreSQL connection pool
 */
function initializeAlloyDB(options = {}) {
  if (pool) {
    console.log('✅ AlloyDB pool already initialized');
    return pool;
  }

  try {
    const config = {
      user: ALLOYDB_CONFIG.user,
      password: ALLOYDB_CONFIG.password,
      database: ALLOYDB_CONFIG.database,
      port: options.port || ALLOYDB_CONFIG.port,
      max: 10, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    // Option 1: Use Cloud SQL Proxy (recommended for local dev)
    // Cloud SQL Proxy v2 listens on localhost:5432 by default
    if (options.useCloudSqlProxy || process.env.USE_CLOUD_SQL_PROXY === 'true') {
      config.host = 'localhost'; // Cloud SQL Proxy listens on localhost
      console.log('🔌 Using Cloud SQL Proxy on localhost:', config.host + ':' + config.port);
    }
    // Option 2: Direct connection with IP (if public IP enabled)
    else if (options.host || process.env.ALLOYDB_HOST) {
      config.host = options.host || process.env.ALLOYDB_HOST;
      console.log('🔌 Using direct connection to:', config.host);
    }
    // Option 3: Try environment variable first, then prompt user
    else {
      throw new Error(
        'AlloyDB host not configured. Set ALLOYDB_HOST environment variable or use Cloud SQL Proxy.\n' +
        'To get the IP: Go to GCP Console → AlloyDB → personal-agent-cluster → personal-agent-cluster-primary → Primary IP\n' +
        'Or install Cloud SQL Proxy and set USE_CLOUD_SQL_PROXY=true'
      );
    }

    pool = new Pool(config);

    // Test connection
    pool.query('SELECT NOW()', (err, res) => {
      if (err) {
        console.error('❌ AlloyDB connection test failed:', err.message);
        console.warn('⚠️ Make sure AlloyDB is accessible and credentials are correct');
      } else {
        console.log('✅ AlloyDB connected successfully');
        console.log('   Database time:', res.rows[0].now);
      }
    });

    return pool;
  } catch (error) {
    console.error('❌ Error initializing AlloyDB:', error);
    throw error;
  }
}

/**
 * Check if AlloyDB is connected
 * @returns {boolean} True if connected
 */
function isAlloyDBConnected() {
  return pool !== null;
}

/**
 * Get AlloyDB connection pool
 * @returns {Pool} PostgreSQL connection pool
 */
function getPool() {
  if (!pool) {
    throw new Error('AlloyDB not initialized. Call initializeAlloyDB() first.');
  }
  return pool;
}

/**
 * Query knowledge chunks by model_id
 * @param {string} modelId - Model ID from Firestore (e.g., "model_0x0610..._abc123")
 * @param {Object} options - Query options
 * @param {number} options.limit - Maximum number of chunks to return (default: 100)
 * @returns {Promise<Array>} Array of knowledge chunks
 */
async function getKnowledgeChunksByModelId(modelId, options = {}) {
  const db = getPool();
  const limit = options.limit || 100;

  try {
    const query = `
      SELECT 
        id,
        model_id,
        file_id,
        chunk_index,
        content,
        embedding,
        source_uri,
        created_at
      FROM knowledge_chunks
      WHERE model_id = $1
      ORDER BY chunk_index ASC
      LIMIT $2
    `;

    const result = await db.query(query, [modelId, limit]);
    console.log(`✅ Retrieved ${result.rows.length} knowledge chunks for model: ${modelId}`);
    return result.rows;
  } catch (error) {
    console.error('❌ Error querying knowledge chunks:', error);
    throw error;
  }
}

/**
 * Vector similarity search in AlloyDB
 * @param {string} modelId - Model ID from Firestore
 * @param {Array<number>} queryEmbedding - 768-dimensional embedding vector
 * @param {Object} options - Search options
 * @param {number} options.limit - Number of top results (default: 5)
 * @param {number} options.threshold - Similarity threshold (optional)
 * @returns {Promise<Array>} Array of similar knowledge chunks, ordered by similarity
 */
async function searchSimilarChunks(modelId, queryEmbedding, options = {}) {
  const db = getPool();
  const limit = options.limit || 5;

  try {
    // Convert embedding array to PostgreSQL vector format
    const embeddingString = `[${queryEmbedding.join(',')}]`;

    // Vector similarity search using cosine distance (<=> operator)
    // Lower distance = more similar
    const query = `
      SELECT 
        id,
        model_id,
        file_id,
        chunk_index,
        content,
        embedding,
        source_uri,
        created_at,
        1 - (embedding <=> $1::vector) as similarity
      FROM knowledge_chunks
      WHERE model_id = $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `; // <=> is the cosine distance operator

    const result = await db.query(query, [embeddingString, modelId, limit]);
    
    console.log(`✅ Found ${result.rows.length} similar chunks for model: ${modelId}`);
    return result.rows;
  } catch (error) {
    console.error('❌ Error performing vector search:', error);
    throw error;
  }
}

/**
 * Close AlloyDB connection pool
 */
async function closeConnection() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ AlloyDB connection closed');
  }
}

module.exports = {
  initializeAlloyDB,
  isAlloyDBConnected,
  getPool,
  getKnowledgeChunksByModelId,
  searchSimilarChunks,
  closeConnection,
  ALLOYDB_CONFIG
};

