// Script to check detailed embedding information for an agent
const alloydb = require('./src/alloydb-connection.js');

const AGENT_NAME = 'Test Agent Complex';
const ALLOYDB_PUBLIC_IP = process.env.ALLOYDB_PUBLIC_IP || '35.239.188.129';

async function checkAgentEmbeddings() {
  console.log(`🔍 Checking detailed embedding info for "${AGENT_NAME}"...\n`);
  
  // First get the agent from Firestore to get modelId
  const fetch = require('node-fetch');
  try {
    const response = await fetch(`http://localhost:3001/api/user-agents`);
    const data = await response.json();
    
    if (!data.success || !data.agents) {
      console.log('❌ Failed to query Firestore');
      return;
    }
    
    const agent = data.agents.find(a => a.name === AGENT_NAME);
    if (!agent) {
      console.log(`❌ Agent "${AGENT_NAME}" not found in Firestore`);
      return;
    }
    
    console.log(`✅ Found agent: ${agent.name}`);
    console.log(`   Model ID: ${agent.modelId}\n`);
    
    // Connect to AlloyDB
    alloydb.initializeAlloyDB({ host: ALLOYDB_PUBLIC_IP });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (!alloydb.isAlloyDBConnected()) {
      console.log('❌ AlloyDB not connected');
      return;
    }
    
    const pool = alloydb.getPool();
    
    // Get all chunks with embedding info
    const chunksQuery = await pool.query(
      `SELECT 
        chunk_index,
        LENGTH(content) as content_length,
        embedding,
        LEFT(content, 150) as content_preview,
        created_at
      FROM knowledge_chunks 
      WHERE model_id = $1 
      ORDER BY chunk_index`,
      [agent.modelId]
    );
    
    console.log(`📊 Found ${chunksQuery.rows.length} knowledge chunk(s):\n`);
    console.log('='.repeat(80));
    
    let totalDimensions = 0;
    let minDimensions = Infinity;
    let maxDimensions = 0;
    
    chunksQuery.rows.forEach((row, idx) => {
      // Extract embedding dimensions from pgvector
      let embeddingDims = 0;
      if (row.embedding) {
        // pgvector returns embeddings as a string or array-like structure
        // Try to get dimensions by checking the embedding structure
        if (Array.isArray(row.embedding)) {
          embeddingDims = row.embedding.length;
        } else if (typeof row.embedding === 'string') {
          // If it's a string representation, try to parse
          try {
            const parsed = JSON.parse(row.embedding);
            if (Array.isArray(parsed)) {
              embeddingDims = parsed.length;
            }
          } catch (e) {
            // If parsing fails, try to count dimensions another way
            // pgvector might store as '[0.1,0.2,...]' format
            const match = row.embedding.match(/\[([^\]]+)\]/);
            if (match) {
              embeddingDims = match[1].split(',').length;
            }
          }
        }
        
        totalDimensions += embeddingDims;
        minDimensions = Math.min(minDimensions, embeddingDims);
        maxDimensions = Math.max(maxDimensions, embeddingDims);
      }
      
      console.log(`\n📄 Chunk ${row.chunk_index}:`);
      console.log(`   Content length: ${row.content_length} characters`);
      console.log(`   Embedding dimensions: ${embeddingDims || 'N/A'}`);
      console.log(`   Created: ${row.created_at ? new Date(row.created_at).toISOString() : 'N/A'}`);
      console.log(`   Preview: ${row.content_preview}...`);
    });
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📈 Embedding Statistics:');
    console.log(`   Total chunks: ${chunksQuery.rows.length}`);
    if (chunksQuery.rows.length > 0 && totalDimensions > 0) {
      const avgDims = totalDimensions / chunksQuery.rows.length;
      console.log(`   Average dimensions: ${avgDims.toFixed(0)}`);
      console.log(`   Min dimensions: ${minDimensions === Infinity ? 'N/A' : minDimensions}`);
      console.log(`   Max dimensions: ${maxDimensions}`);
    }
    
    await alloydb.closeConnection();
    console.log('\n✅ AlloyDB connection closed\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkAgentEmbeddings().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

