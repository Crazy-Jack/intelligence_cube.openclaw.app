// Script to check all agents and their AlloyDB chunks
const fetch = require('node-fetch');
const alloydb = require('./src/alloydb-connection.js');

const ALLOYDB_PUBLIC_IP = process.env.ALLOYDB_PUBLIC_IP || '35.239.188.129';

async function checkAllAgents() {
  console.log(`🔍 Checking all agents in databases...\n`);
  console.log('='.repeat(60));
  
  // Step 1: Get all agents from Firestore
  console.log('\n📊 Step 1: Getting all agents from Firestore');
  console.log('-'.repeat(60));
  try {
    const response = await fetch(`http://localhost:3001/api/user-agents`);
    const data = await response.json();
    
    if (data.success && data.agents) {
      console.log(`✅ Found ${data.agents.length} agent(s) in Firestore\n`);
      
      // Step 2: Check AlloyDB for each agent
      console.log('📊 Step 2: Checking AlloyDB for knowledge chunks');
      console.log('-'.repeat(60));
      
      try {
        alloydb.initializeAlloyDB({ host: ALLOYDB_PUBLIC_IP });
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (alloydb.isAlloyDBConnected()) {
          console.log('✅ AlloyDB connected\n');
          
          const pool = alloydb.getPool();
          
          for (const agent of data.agents) {
            console.log(`\n📋 Agent: ${agent.name}`);
            console.log(`   Model ID: ${agent.modelId}`);
            
            // Count chunks
            const chunksQuery = await pool.query(
              'SELECT COUNT(*) as count FROM knowledge_chunks WHERE model_id = $1',
              [agent.modelId]
            );
            
            const chunkCount = parseInt(chunksQuery.rows[0].count);
            console.log(`   Knowledge chunks: ${chunkCount}`);
            
            if (chunkCount > 0) {
              // Get sample chunks
              const sampleQuery = await pool.query(
                'SELECT chunk_index, LEFT(content, 100) as content_preview FROM knowledge_chunks WHERE model_id = $1 ORDER BY chunk_index LIMIT 3',
                [agent.modelId]
              );
              
              console.log(`   Sample chunks:`);
              sampleQuery.rows.forEach((row, idx) => {
                console.log(`     ${idx + 1}. Chunk ${row.chunk_index}: ${row.content_preview}...`);
              });
            } else {
              console.log(`   ⚠️  No knowledge chunks (upload files to populate)`);
            }
          }
          
          await alloydb.closeConnection();
        } else {
          console.log('❌ AlloyDB not connected');
        }
      } catch (alloyError) {
        console.error('❌ Error checking AlloyDB:', alloyError.message);
      }
    } else {
      console.log('❌ Failed to query Firestore:', data.error || 'Unknown error');
    }
  } catch (error) {
    console.error('❌ Error checking Firestore:', error.message);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ Check complete\n');
}

checkAllAgents().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});

