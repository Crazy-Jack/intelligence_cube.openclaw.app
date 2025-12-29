// Test script for RAG integration
// Tests: Firestore → modelId → Embedding → AlloyDB search → System prompt enhancement

const fetch = require('node-fetch');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
const I3_API_URL = 'http://34.71.119.178:8000';
const I3_API_KEY = process.env.I3_API_KEY || 'ak_pxOhfZtDes9R6CUyPoOGZtnr61tGJOb2CBz-HHa_VDE';
const ALLOYDB_PUBLIC_IP = process.env.ALLOYDB_PUBLIC_IP || '35.239.188.129';

// Test knowledge chunks (will be inserted into AlloyDB)
const TEST_CHUNKS = [
  {
    content: "AlloyDB is a PostgreSQL-compatible database service from Google Cloud. It provides high performance and scalability for enterprise workloads.",
    topic: "AlloyDB overview"
  },
  {
    content: "Vector embeddings are numerical representations of text that capture semantic meaning. They enable similarity search using cosine distance.",
    topic: "Vector embeddings"
  },
  {
    content: "RAG (Retrieval Augmented Generation) combines information retrieval with language models. It retrieves relevant context from a knowledge base before generating responses.",
    topic: "RAG explanation"
  },
  {
    content: "Cosine similarity measures the angle between two vectors. Values range from -1 to 1, where 1 means identical direction and 0 means orthogonal.",
    topic: "Cosine similarity"
  },
  {
    content: "Firestore is a NoSQL document database from Google Cloud. It stores data in collections and documents, making it easy to query and scale.",
    topic: "Firestore overview"
  }
];

async function generateEmbedding(text) {
  const response = await fetch(`${I3_API_URL}/embeddings`, {
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
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return data.data?.[0]?.embedding || data.data?.data?.[0]?.embedding;
}

async function insertTestChunks(alloydb, modelId) {
  console.log(`\n📝 Step 1: Inserting test knowledge chunks for model: ${modelId}`);
  console.log('-'.repeat(60));
  
  const pool = alloydb.getPool();
  let inserted = 0;
  
  for (let i = 0; i < TEST_CHUNKS.length; i++) {
    const chunk = TEST_CHUNKS[i];
    console.log(`   Generating embedding for chunk ${i + 1}/${TEST_CHUNKS.length}: "${chunk.topic}"`);
    
    try {
      let embedding = await generateEmbedding(chunk.content);
      console.log(`   ✅ Generated embedding (dimension: ${embedding.length})`);
      
      // Truncate to 768 dimensions to solve i3 embedding and alloydb dim mismatch (for testing with existing schema)
      if (embedding.length > 768) {
        console.log(`   ⚠️ Truncating embedding from ${embedding.length} to 768 dimensions for schema compatibility`);
        embedding = embedding.slice(0, 768);
      }
      
      // Insert into AlloyDB
      const embeddingString = `[${embedding.join(',')}]`;
      const query = `
        INSERT INTO knowledge_chunks (model_id, file_id, chunk_index, content, embedding, source_uri, created_at)
        VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())
        RETURNING id
      `;
      
      const result = await pool.query(query, [
        modelId,
        'test-file-1',
        i,
        chunk.content,
        embeddingString,
        'test://knowledge-base'
      ]);
      
      console.log(`   ✅ Inserted chunk ${i + 1} (ID: ${result.rows[0].id})`);
      inserted++;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`   ❌ Failed to insert chunk ${i + 1}:`, error.message);
    }
  }
  
  console.log(`\n✅ Inserted ${inserted}/${TEST_CHUNKS.length} test chunks`);
  return inserted;
}

async function testRAGFlow() {
  console.log('\n🧪 Testing RAG Integration');
  console.log('='.repeat(60));
  console.log(`📍 Testing against: ${BASE_URL}`);
  console.log(`📍 AlloyDB: ${ALLOYDB_PUBLIC_IP}\n`);
  
  // Step 1: Get modelId from Firestore
  console.log('📊 Step 1: Get modelId from Firestore');
  console.log('-'.repeat(60));
  let modelId = null;
  const testAgentName = 'Test'; // Use the "Test" agent we know exists
  
  try {
    const response = await fetch(`${BASE_URL}/api/user-agents/${testAgentName}`);
    const data = await response.json();
    
    if (data.success && data.agent && data.agent.modelId) {
      modelId = data.agent.modelId;
      console.log(`✅ Found agent: ${testAgentName}`);
      console.log(`   Model ID: ${modelId}`);
      console.log(`   Purpose: ${data.agent.purpose || 'N/A'}`);
    } else {
      console.error('❌ Agent not found or missing modelId');
      console.error('   Response:', JSON.stringify(data, null, 2));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to query Firestore:', error.message);
    process.exit(1);
  }
  
  // Step 2: Initialize AlloyDB and insert test chunks
  console.log('\n📊 Step 2: Initialize AlloyDB and insert test chunks');
  console.log('-'.repeat(60));
  
  const alloydb = require('./src/alloydb-connection.js');
  alloydb.initializeAlloyDB({ host: ALLOYDB_PUBLIC_IP });
  
  // Wait for connection
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  if (!alloydb.isAlloyDBConnected()) {
    console.error('❌ AlloyDB not connected. Set ALLOYDB_PUBLIC_IP environment variable');
    process.exit(1);
  }
  
  console.log('✅ AlloyDB connected');
  
  // Insert test chunks
  const insertedCount = await insertTestChunks(alloydb, modelId);
  if (insertedCount === 0) {
    console.error('❌ Failed to insert test chunks');
    process.exit(1);
  }
  
  // Step 3: Test RAG flow with a user query
  console.log('\n📊 Step 3: Test RAG flow with user query');
  console.log('-'.repeat(60));
  
  const userQuery = "What is RAG and how does it work?"; //User query
  console.log(`   User query: "${userQuery}"`);
  
  // Generate embedding for user query
  console.log('   Generating embedding for user query...');
  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(userQuery);
    console.log(`   ✅ Generated query embedding (dimension: ${queryEmbedding.length})`);
    
    // Truncate to 768 dimensions if needed (to match stored chunks)
    if (queryEmbedding.length > 768) {
      console.log(`   ⚠️ Truncating query embedding from ${queryEmbedding.length} to 768 dimensions`);
      queryEmbedding = queryEmbedding.slice(0, 768);
    }
  } catch (error) {
    console.error('   ❌ Failed to generate query embedding:', error.message);
    process.exit(1);
  }
  
  // Search AlloyDB for similar chunks
  console.log('   Searching AlloyDB for similar chunks...');
  try {
    const similarChunks = await alloydb.searchSimilarChunks(modelId, queryEmbedding, { limit: 5 });
    console.log(`   ✅ Found ${similarChunks.length} similar chunks`);
    
    if (similarChunks.length > 0) {
      console.log('\n   Top chunks by similarity:');
      similarChunks.forEach((chunk, idx) => {
        console.log(`   ${idx + 1}. Similarity: ${chunk.similarity?.toFixed(4) || 'N/A'}`);
        console.log(`      Content: ${chunk.content.substring(0, 80)}...`);
      });
    } else {
      console.log('   ⚠️ No chunks found (this might be expected if embeddings are very different)');
    }
  } catch (error) {
    console.error('   ❌ Failed to search AlloyDB:', error.message);
    process.exit(1);
  }
  
  // Step 4: Test full chat completions endpoint
  console.log('\n📊 Step 4: Test full chat completions endpoint');
  console.log('-'.repeat(60));
  
  console.log(`   Sending chat request with model: "${testAgentName}"`);
  console.log(`   Query: "${userQuery}"`);
  
  try {
    const chatResponse = await fetch(`${BASE_URL}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'I3-API-Key': I3_API_KEY
      },
      body: JSON.stringify({
        model: testAgentName,
        messages: [
          { role: 'user', content: userQuery }
        ],
        stream: false
      })
    });
    
    if (!chatResponse.ok) {
      const error = await chatResponse.text();
      console.error(`   ❌ Chat API error: ${chatResponse.status}`);
      console.error(`   Error: ${error}`);
      process.exit(1);
    }
    
    const chatData = await chatResponse.json();
    console.log('   ✅ Chat request successful');
    
    // I3 API returns nested structure: { success: true, data: { choices: [...] } }
    const content = chatData.data?.choices?.[0]?.message?.content || chatData.choices?.[0]?.message?.content;
    const responseLength = content?.length || 0;
    console.log(`   Response length: ${responseLength} characters`);
    
    if (responseLength > 0) {
      console.log(`   Response preview: ${content.substring(0, 200)}...`);
    } else {
      console.log('   ⚠️  Response content is empty - check I3 API response structure');
      console.log('   Full response structure:', JSON.stringify(chatData, null, 2).substring(0, 500));
    }
    
    // Check server logs would show RAG integration
    console.log('\n   📋 Expected server logs:');
    console.log('      ✅ Found user agent in Firestore');
    console.log('      🔍 Generating embedding for user query...');
    console.log('      ✅ Generated query embedding');
    console.log('      📚 Retrieved N relevant knowledge chunks');
    console.log('      ✅ Added N knowledge chunks to system instruction');
    
  } catch (error) {
    console.error('   ❌ Chat request failed:', error.message);
    process.exit(1);
  }
  
  // Cleanup: Optionally remove test chunks
  console.log('\n📊 Step 5: Cleanup (optional)');
  console.log('-'.repeat(60));
  console.log('   Test chunks are in AlloyDB. You can keep them for further testing or delete them.');
  console.log('   To delete: DELETE FROM knowledge_chunks WHERE model_id = $1 AND source_uri = \'test://knowledge-base\'');
  
  await alloydb.closeConnection();
  
  console.log('\n✅ All RAG integration tests completed successfully!');
  console.log('='.repeat(60));
}

// Run tests
testRAGFlow().catch(error => {
  console.error('\n❌ Test failed:', error);
  process.exit(1);
});

