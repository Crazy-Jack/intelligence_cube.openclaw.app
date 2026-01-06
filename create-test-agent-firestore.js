// Script to create a test agent in Firestore
// This creates the "Test" agent that the RAG integration test expects

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

// Initialize Firebase Admin (same as serve.js)
if (!admin.apps.length) {
  try {
    let credential;
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('📝 Using service account key file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
      credential = admin.credential.cert(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } else {
      console.log('📝 Using application default credentials (gcloud)');
      credential = admin.credential.applicationDefault();
    }
    
    admin.initializeApp({
      credential: credential,
      projectId: 'i3-testnet'
    });
    
    console.log('✅ Firebase Admin initialized');
  } catch (error) {
    console.error('❌ Firebase Admin initialization failed:', error.message);
    process.exit(1);
  }
}

async function createTestAgent() {
  try {
    // Get Firestore instance (try named database first)
    let db = getFirestore(admin.app());
    
    // Try to connect to named database
    try {
      const namedDb = getFirestore(admin.app(), 'i3-testnet');
      const testRef = namedDb.collection('models').limit(1);
      await testRef.get();
      db = namedDb;
      console.log('✅ Connected to named database: i3-testnet');
    } catch (e) {
      console.log('⚠️ Using default database (named database not available)');
    }
    
    // Generate modelId (same format as serve.js)
    const testOwnerAddress = '0x0000000000000000000000000000000000000000'; // Test address
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const modelId = `model_${testOwnerAddress.toLowerCase().replace('0x', '')}_${timestamp}_${random}`;
    
    // Create the test agent document
    const agentData = {
      name: 'Test',
      slug: modelId,
      ownerAddress: testOwnerAddress.toLowerCase(),
      source: 'user',
      isPublic: true,
      purpose: 'A test agent for RAG integration testing',
      useCase: 'Testing the complete RAG pipeline: Firestore → Embeddings → AlloyDB → Chat',
      category: 'Test Agent',
      industry: 'Testing',
      tokenPrice: 2,
      sharePrice: 10,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    
    console.log(`\n📝 Creating test agent "Test" in Firestore...`);
    console.log(`   Model ID: ${modelId}`);
    console.log(`   Owner: ${testOwnerAddress}`);
    
    const modelRef = db.collection('models').doc(modelId);
    await modelRef.set(agentData);
    
    // Verify it was created
    const verifyDoc = await modelRef.get();
    if (verifyDoc.exists) {
      console.log('✅ Test agent created successfully!');
      console.log(`   Name: ${verifyDoc.data().name}`);
      console.log(`   Model ID: ${modelId}`);
      console.log(`   Database: ${db._databaseId?.database || '(default)'}`);
      console.log(`\n✅ You can now run the RAG integration test`);
      process.exit(0);
    } else {
      throw new Error('Agent was not created - verification failed');
    }
  } catch (error) {
    console.error('❌ Error creating test agent:', error.message);
    console.error('   Stack:', error.stack);
    process.exit(1);
  }
}

createTestAgent();


