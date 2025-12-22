// Test script for Firestore and AlloyDB connections
const userAgentsFirestore = require('./src/user-agents-firestore.js');
const alloydb = require('./src/alloydb-connection.js');

async function testConnections() {
  console.log('🧪 Testing Firestore and AlloyDB Connections\n');
  console.log('='.repeat(60));

  // Test 1: Firestore Connection
  console.log('\n📊 Test 1: Firestore Connection');
  console.log('-'.repeat(60));
  try {
    userAgentsFirestore.initializeFirestore();
    
    if (userAgentsFirestore.isFirestoreConfigured()) {
      console.log('✅ Firestore initialized successfully');
      
      // Test: List user agents
      console.log('\n📋 Testing: List user agents...');
      const agents = await userAgentsFirestore.listUserAgents({ publicOnly: false });
      console.log(`✅ Found ${agents.length} user agents`);
      
      if (agents.length > 0) {
        console.log('\n📝 Sample user agent:');
        const sample = agents[0];
        console.log(`   Name: ${sample.name}`);
        console.log(`   Model ID: ${sample.modelId}`);
        console.log(`   Owner: ${sample.ownerAddress || 'N/A'}`);
        console.log(`   Purpose: ${sample.purpose || 'N/A'}`);
        
        // Test: Get user agent by name
        console.log(`\n🔍 Testing: Get user agent by name "${sample.name}"...`);
        const agentByName = await userAgentsFirestore.getUserAgentByName(sample.name);
        if (agentByName) {
          console.log(`✅ Successfully retrieved agent: ${agentByName.name} (${agentByName.modelId})`);
        } else {
          console.log('⚠️ Agent not found by name');
        }
      } else {
        console.log('⚠️ No user agents found in Firestore');
      }
    } else {
      console.log('❌ Firestore not configured');
    }
  } catch (error) {
    console.error('❌ Firestore test failed:', error.message);
    if (error.message.includes('index')) {
      console.error('   ⚠️ You may need to create a Firestore composite index');
    }
  }

  // Test 2: AlloyDB Connection
  console.log('\n\n🗄️  Test 2: AlloyDB Connection');
  console.log('-'.repeat(60));
  try {
    // Check if AlloyDB Auth Proxy or Cloud SQL Proxy is needed
    const useProxy = process.env.USE_ALLOYDB_AUTH_PROXY === 'true' || process.env.USE_CLOUD_SQL_PROXY === 'true';
    
    if (useProxy) {
      console.log('🔌 Using AlloyDB Auth Proxy (localhost:5432)');
    } else if (process.env.ALLOYDB_HOST) {
      console.log(`🔌 Using direct connection to: ${process.env.ALLOYDB_HOST}`);
    } else {
      console.log('⚠️ AlloyDB host not configured');
      console.log('   Set USE_ALLOYDB_AUTH_PROXY=true or ALLOYDB_HOST environment variable');
      console.log('   Skipping AlloyDB tests...');
      return;
    }

    alloydb.initializeAlloyDB({ 
      useAlloyDBAuthProxy: useProxy 
    });

    if (alloydb.isAlloyDBConnected()) {
      console.log('✅ AlloyDB connection pool initialized');
      
      // Wait a moment for connection to stabilize
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Test: Simple query
      console.log('\n📋 Testing: Simple database query...');
      const pool = alloydb.getPool();
      const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
      console.log(`✅ Database query successful`);
      console.log(`   Current time: ${result.rows[0].current_time}`);
      console.log(`   PostgreSQL version: ${result.rows[0].pg_version.split(' ')[0]} ${result.rows[0].pg_version.split(' ')[1]}`);
      
      // Test: Check if knowledge_chunks table exists
      console.log('\n📋 Testing: Check knowledge_chunks table...');
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'knowledge_chunks'
        )
      `);
      
      if (tableCheck.rows[0].exists) {
        console.log('✅ knowledge_chunks table exists');
        
        // Test: Count chunks
        const countResult = await pool.query('SELECT COUNT(*) as count FROM knowledge_chunks');
        const totalChunks = parseInt(countResult.rows[0].count);
        console.log(`   Total knowledge chunks: ${totalChunks}`);
        
        // Test: Get unique model IDs
        const modelIdsResult = await pool.query(`
          SELECT DISTINCT model_id, COUNT(*) as chunk_count 
          FROM knowledge_chunks 
          GROUP BY model_id 
          LIMIT 5
        `);
        
        if (modelIdsResult.rows.length > 0) {
          console.log(`\n📝 Sample model IDs with chunks:`);
          modelIdsResult.rows.forEach(row => {
            console.log(`   ${row.model_id}: ${row.chunk_count} chunks`);
          });
          
          // Test: Get chunks for a specific model
          const testModelId = modelIdsResult.rows[0].model_id;
          console.log(`\n🔍 Testing: Get chunks for model "${testModelId}"...`);
          const chunks = await alloydb.getKnowledgeChunksByModelId(testModelId, { limit: 3 });
          console.log(`✅ Retrieved ${chunks.length} chunks`);
          if (chunks.length > 0) {
            console.log(`   Sample chunk: ${chunks[0].content.substring(0, 100)}...`);
          }
        } else {
          console.log('⚠️ No knowledge chunks found in database');
        }
      } else {
        console.log('❌ knowledge_chunks table does not exist');
      }
      
      // Close connection
      await alloydb.closeConnection();
      console.log('\n✅ AlloyDB connection closed');
    } else {
      console.log('❌ AlloyDB not connected');
    }
  } catch (error) {
    console.error('❌ AlloyDB test failed:', error.message);
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   ⚠️ Connection refused. Make sure Cloud SQL Proxy is running:');
      console.error('      cloud-sql-proxy i3-testnet:us-central1:personal-agent-cluster-primary --port 5432');
    } else if (error.message.includes('timeout')) {
      console.error('   ⚠️ Connection timeout. Check your network and AlloyDB configuration.');
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Connection tests completed\n');
}

// Run tests
testConnections()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });

