// Script to check if an agent exists in Firestore and AlloyDB
const fetch = require('node-fetch');
const alloydb = require('./src/alloydb-connection.js');

const AGENT_NAME = 'Test Agent Complex';
const ALLOYDB_PUBLIC_IP = process.env.ALLOYDB_PUBLIC_IP || '35.239.188.129';

async function checkAgentDatabases() {
  console.log(`🔍 Checking agent "${AGENT_NAME}" in databases...\n`);
  console.log('='.repeat(60));
  
  // Step 1: Check Firestore
  console.log('\n📊 Step 1: Checking Firestore');
  console.log('-'.repeat(60));
  try {
    const response = await fetch(`http://localhost:3001/api/user-agents`);
    const data = await response.json();
    
    if (data.success && data.agents) {
      const agent = data.agents.find(a => a.name === AGENT_NAME);
      if (agent) {
        console.log(`✅ Agent found in Firestore!`);
        console.log(`   Name: ${agent.name}`);
        console.log(`   Model ID: ${agent.modelId}`);
        console.log(`   Owner: ${agent.ownerAddress}`);
        console.log(`   Created: ${new Date(agent.createdAt._seconds * 1000).toISOString()}`);
        console.log(`   Purpose: ${agent.purpose || 'N/A'}`);
        
        // Step 2: Check AlloyDB for knowledge chunks
        console.log('\n📊 Step 2: Checking AlloyDB for knowledge chunks');
        console.log('-'.repeat(60));
        
        try {
          alloydb.initializeAlloyDB({ host: ALLOYDB_PUBLIC_IP });
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          if (alloydb.isAlloyDBConnected()) {
            console.log('✅ AlloyDB connected');
            
            const pool = alloydb.getPool();
            
            // Check if there are any knowledge chunks for this model
            const chunksQuery = await pool.query(
              'SELECT COUNT(*) as count FROM knowledge_chunks WHERE model_id = $1',
              [agent.modelId]
            );
            
            const chunkCount = parseInt(chunksQuery.rows[0].count);
            console.log(`   Knowledge chunks for this agent: ${chunkCount}`);
            
            if (chunkCount > 0) {
              console.log(`   ✅ Agent has ${chunkCount} knowledge chunk(s) in AlloyDB`);
              
              // Get sample chunks
              const sampleQuery = await pool.query(
                'SELECT chunk_index, LEFT(content, 100) as content_preview FROM knowledge_chunks WHERE model_id = $1 LIMIT 3',
                [agent.modelId]
              );
              
              console.log('\n   Sample chunks:');
              sampleQuery.rows.forEach((row, idx) => {
                console.log(`   ${idx + 1}. Chunk ${row.chunk_index}: ${row.content_preview}...`);
              });
            } else {
              console.log(`   ⚠️  No knowledge chunks found for this agent`);
              console.log(`   ℹ️  This is expected - chunks are only created when files are uploaded and processed`);
            }
            
            await alloydb.closeConnection();
          } else {
            console.log('❌ AlloyDB not connected');
          }
        } catch (alloyError) {
          console.error('❌ Error checking AlloyDB:', alloyError.message);
        }
      } else {
        console.log(`❌ Agent "${AGENT_NAME}" not found in Firestore`);
        console.log(`   Available agents: ${data.agents.map(a => a.name).join(', ')}`);
      }
    } else {
      console.log('❌ Failed to query Firestore:', data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error checking Firestore:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n📋 Summary:');
  console.log('   • Firestore: Stores agent metadata (name, modelId, owner, etc.)');
  console.log('   • AlloyDB: Stores knowledge chunks (only created when files are uploaded)');
  console.log('   • When an agent is created, it is ONLY stored in Firestore');
  console.log('   • AlloyDB data is created separately when files are uploaded and processed\n');
}

checkAgentDatabases().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

