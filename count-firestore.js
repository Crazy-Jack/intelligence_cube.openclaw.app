// Quick script to count documents in Firestore
const userAgentsFirestore = require('./src/user-agents-firestore.js');

async function countDocuments() {
  try {
    userAgentsFirestore.initializeFirestore();
    
    if (!userAgentsFirestore.isFirestoreConfigured()) {
      console.log('❌ Firestore not configured');
      return;
    }
    
    const db = userAgentsFirestore.initializeFirestore();
    
    // Count all documents in models collection
    console.log('📊 Counting documents in Firestore...\n');
    
    // Get all models (no filter)
    const allModelsRef = db.collection('models');
    const allModelsSnapshot = await allModelsRef.get();
    console.log(`📋 Total documents in 'models' collection: ${allModelsSnapshot.size}`);
    
    // Count by source
    const userModels = allModelsSnapshot.docs.filter(doc => doc.data().source === 'user');
    const officialModels = allModelsSnapshot.docs.filter(doc => doc.data().source === 'official');
    const otherModels = allModelsSnapshot.docs.filter(doc => !doc.data().source || (doc.data().source !== 'user' && doc.data().source !== 'official'));
    
    console.log(`   - User models (source: "user"): ${userModels.length}`);
    console.log(`   - Official models (source: "official"): ${officialModels.length}`);
    console.log(`   - Other/Unknown source: ${otherModels.length}`);
    
    // Show sample of all models
    console.log('\n📝 Sample of all models:');
    allModelsSnapshot.docs.slice(0, 10).forEach((doc, index) => {
      const data = doc.data();
      console.log(`   ${index + 1}. ID: ${doc.id}`);
      console.log(`      Name: ${data.name || 'N/A'}`);
      console.log(`      Source: ${data.source || 'N/A'}`);
      console.log(`      Owner: ${data.ownerAddress || 'N/A'}`);
      console.log('');
    });
    
    if (allModelsSnapshot.size > 10) {
      console.log(`   ... and ${allModelsSnapshot.size - 10} more`);
    }
    
    // Test the listUserAgents function
    console.log('\n🔍 Testing listUserAgents() function:');
    const userAgents = await userAgentsFirestore.listUserAgents({ publicOnly: false });
    console.log(`   Found ${userAgents.length} user agents`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
  
  process.exit(0);
}

countDocuments();

