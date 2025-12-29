// Test script to verify serve.js can access Firestore
// This tests the API endpoints that use Firestore

const fetch = require('node-fetch');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';

async function testFirestoreEndpoints() {
  console.log('🧪 Testing serve.js Firestore Integration\n');
  console.log('='.repeat(60));
  console.log(`📍 Testing against: ${BASE_URL}\n`);

  // Test 1: Health check
  console.log('📊 Test 1: Server Health Check');
  console.log('-'.repeat(60));
  try {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    console.log(`✅ Server is running: ${data.status}`);
    console.log(`   Message: ${data.message}`);
  } catch (error) {
    console.error('❌ Server is not running or not accessible');
    console.error(`   Error: ${error.message}`);
    console.error(`   Make sure to start the server first: npm start`);
    process.exit(1);
  }

  // Test 2: List all user agents
  console.log('\n📊 Test 2: List All User Agents');
  console.log('-'.repeat(60));
  try {
    const response = await fetch(`${BASE_URL}/api/user-agents`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ Successfully retrieved ${data.total} user agents`);
      if (data.agents && data.agents.length > 0) {
        console.log('\n📝 Sample user agent:');
        const sample = data.agents[0];
        console.log(`   Name: ${sample.name}`);
        console.log(`   Model ID: ${sample.modelId}`);
        console.log(`   Owner: ${sample.ownerAddress || 'N/A'}`);
        console.log(`   Purpose: ${sample.purpose || 'N/A'}`);
      } else {
        console.log('⚠️ No user agents found (this is OK if database is empty)');
      }
    } else {
      console.error('❌ Request failed:', data.message || data.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 3: Get specific user agent by name
  console.log('\n📊 Test 3: Get User Agent by Name');
  console.log('-'.repeat(60));
  try {
    // First, get list to find a name to test with
    const listResponse = await fetch(`${BASE_URL}/api/user-agents`);
    const listData = await listResponse.json();
    
    if (listData.agents && listData.agents.length > 0) {
      const testName = listData.agents[0].name;
      console.log(`🔍 Testing with agent name: "${testName}"`);
      
      const response = await fetch(`${BASE_URL}/api/user-agents/${encodeURIComponent(testName)}`);
      const data = await response.json();
      
      if (data.success && data.agent) {
        console.log(`✅ Successfully retrieved agent: ${data.agent.name}`);
        console.log(`   Model ID: ${data.agent.modelId}`);
        console.log(`   Owner: ${data.agent.ownerAddress || 'N/A'}`);
      } else if (data.success && !data.agent) {
        console.log(`⚠️ Agent "${testName}" not found (404)`);
      } else {
        console.error('❌ Request failed:', data.message || data.error);
      }
    } else {
      console.log('⚠️ No user agents available to test with');
      console.log('   Testing with a non-existent agent name...');
      
      const response = await fetch(`${BASE_URL}/api/user-agents/NonExistentAgent`);
      const data = await response.json();
      
      if (response.status === 404 || !data.agent) {
        console.log('✅ Correctly returned 404 for non-existent agent');
      } else {
        console.error('❌ Expected 404 but got:', data);
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 4: Filter by ownerAddress (if available)
  console.log('\n📊 Test 4: Filter User Agents by Owner');
  console.log('-'.repeat(60));
  try {
    const listResponse = await fetch(`${BASE_URL}/api/user-agents`);
    const listData = await listResponse.json();
    
    if (listData.agents && listData.agents.length > 0) {
      const testOwner = listData.agents[0].ownerAddress;
      if (testOwner) {
        console.log(`🔍 Testing with owner: ${testOwner}`);
        const response = await fetch(`${BASE_URL}/api/user-agents?ownerAddress=${encodeURIComponent(testOwner)}`);
        const data = await response.json();
        
        if (data.success) {
          console.log(`✅ Found ${data.total} agents for owner ${testOwner}`);
          // Verify all returned agents belong to this owner
          const allMatch = data.agents.every(agent => agent.ownerAddress === testOwner);
          if (allMatch) {
            console.log('✅ All returned agents match the owner filter');
          } else {
            console.error('❌ Some agents do not match the owner filter');
          }
        }
      } else {
        console.log('⚠️ No owner addresses available to test with');
      }
    } else {
      console.log('⚠️ No user agents available to test with');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  // Test 5: Test publicOnly filter
  console.log('\n📊 Test 5: Filter Public User Agents');
  console.log('-'.repeat(60));
  try {
    const response = await fetch(`${BASE_URL}/api/user-agents?publicOnly=true`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ Found ${data.total} public user agents`);
      if (data.agents && data.agents.length > 0) {
        const allPublic = data.agents.every(agent => agent.isPublic === true);
        if (allPublic) {
          console.log('✅ All returned agents are public');
        } else {
          console.error('❌ Some agents are not public');
        }
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Firestore integration tests completed\n');
}

// Run tests
testFirestoreEndpoints()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });

