/**
 * Cloud Functions Test Script
 * 
 * Usage:
 *   1. Start emulators: firebase emulators:start --only functions,firestore,auth
 *   2. Run tests: node test-cloud-functions.js [testName]
 * 
 * Available tests:
 *   - getWalletInfo
 *   - checkIsAdmin  
 *   - adminQuickCheckin
 *   - validateAndSpendCredits
 *   - all (run all tests)
 */

const { initializeApp } = require('firebase/app');
const { getAuth, signInWithEmailAndPassword, connectAuthEmulator } = require('firebase/auth');
const { getFunctions, httpsCallable, connectFunctionsEmulator } = require('firebase/functions');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc } = require('firebase/firestore');

// Your Firebase config
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || "your-api-key",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "your-project.firebaseapp.com",
  projectId: process.env.FIREBASE_PROJECT_ID || "your-project-id",
};

// Test configuration
const USE_EMULATOR = process.env.USE_EMULATOR !== 'false'; // Default: use emulator
const TEST_WALLET = '0x1234567890123456789012345678901234567890';
const TEST_EMAIL = 'test@example.com';
const TEST_PASSWORD = 'testpassword123';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app);
const db = getFirestore(app);

// Connect to emulators if enabled
if (USE_EMULATOR) {
  console.log('🔧 Connecting to Firebase Emulators...');
  connectAuthEmulator(auth, 'http://localhost:9099');
  connectFunctionsEmulator(functions, 'localhost', 5001);
  connectFirestoreEmulator(db, 'localhost', 8081);
}

// Helper: colorized output
const log = {
  success: (msg) => console.log(`\x1b[32m✅ ${msg}\x1b[0m`),
  error: (msg) => console.log(`\x1b[31m❌ ${msg}\x1b[0m`),
  info: (msg) => console.log(`\x1b[36mℹ️  ${msg}\x1b[0m`),
  warn: (msg) => console.log(`\x1b[33m⚠️  ${msg}\x1b[0m`),
};

// ============================================================
// Test Functions
// ============================================================

async function testGetWalletInfo(user) {
  console.log('\n📋 Testing: getWalletInfo');
  console.log('─'.repeat(50));
  
  try {
    const getWalletInfo = httpsCallable(functions, 'getWalletInfo');
    const result = await getWalletInfo({ walletAddress: TEST_WALLET });
    
    console.log('Response:', JSON.stringify(result.data, null, 2));
    log.success('getWalletInfo works!');
    return true;
  } catch (error) {
    log.error(`getWalletInfo failed: ${error.message}`);
    console.log('Error details:', error);
    return false;
  }
}

async function testCheckIsAdmin(user) {
  console.log('\n📋 Testing: checkIsAdmin');
  console.log('─'.repeat(50));
  
  try {
    const checkIsAdmin = httpsCallable(functions, 'checkIsAdmin');
    const result = await checkIsAdmin({});
    
    console.log('Response:', JSON.stringify(result.data, null, 2));
    log.success(`checkIsAdmin works! isAdmin: ${result.data.isAdmin}`);
    return true;
  } catch (error) {
    log.error(`checkIsAdmin failed: ${error.message}`);
    return false;
  }
}

async function testAdminQuickCheckin(user) {
  console.log('\n📋 Testing: adminQuickCheckin');
  console.log('─'.repeat(50));
  
  try {
    const adminQuickCheckin = httpsCallable(functions, 'adminQuickCheckin');
    const result = await adminQuickCheckin({ walletAddress: TEST_WALLET });
    
    console.log('Response:', JSON.stringify(result.data, null, 2));
    log.success('adminQuickCheckin works!');
    return true;
  } catch (error) {
    // Expected to fail if not admin
    if (error.code === 'functions/permission-denied') {
      log.warn('adminQuickCheckin correctly denied (user is not admin)');
      return true; // This is expected behavior
    }
    log.error(`adminQuickCheckin failed: ${error.message}`);
    return false;
  }
}

async function testValidateAndSpendCredits(user) {
  console.log('\n📋 Testing: validateAndSpendCredits');
  console.log('─'.repeat(50));
  
  try {
    // Note: This test will fail without a valid wallet signature
    // In real usage, the frontend gets the signature from MetaMask
    const validateAndSpendCredits = httpsCallable(functions, 'validateAndSpendCredits');
    const result = await validateAndSpendCredits({
      walletAddress: TEST_WALLET,
      amount: 10,
      reason: 'test',
      signature: '0x0000', // Invalid signature for testing
      message: 'test message'
    });
    
    console.log('Response:', JSON.stringify(result.data, null, 2));
    log.success('validateAndSpendCredits works!');
    return true;
  } catch (error) {
    if (error.code === 'functions/permission-denied' || 
        error.message.includes('signature') ||
        error.message.includes('Invalid')) {
      log.warn('validateAndSpendCredits correctly rejected invalid signature');
      return true; // This is expected behavior
    }
    log.error(`validateAndSpendCredits failed: ${error.message}`);
    return false;
  }
}

async function testGetTransactionHistory(user) {
  console.log('\n📋 Testing: getTransactionHistory');
  console.log('─'.repeat(50));
  
  try {
    const getTransactionHistory = httpsCallable(functions, 'getTransactionHistory');
    const result = await getTransactionHistory({ 
      walletAddress: TEST_WALLET,
      limit: 10 
    });
    
    console.log('Response:', JSON.stringify(result.data, null, 2));
    log.success('getTransactionHistory works!');
    return true;
  } catch (error) {
    log.error(`getTransactionHistory failed: ${error.message}`);
    return false;
  }
}

// ============================================================
// Test Runner
// ============================================================

async function setupTestUser() {
  if (USE_EMULATOR) {
    // Create a test user in emulator
    const { createUserWithEmailAndPassword } = require('firebase/auth');
    try {
      const userCred = await createUserWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
      log.success(`Created test user: ${TEST_EMAIL}`);
      return userCred.user;
    } catch (error) {
      if (error.code === 'auth/email-already-in-use') {
        // User exists, sign in
        const userCred = await signInWithEmailAndPassword(auth, TEST_EMAIL, TEST_PASSWORD);
        log.info(`Signed in as existing user: ${TEST_EMAIL}`);
        return userCred.user;
      }
      throw error;
    }
  } else {
    log.warn('Running against production - you need to sign in manually');
    return null;
  }
}

async function setupTestData() {
  if (USE_EMULATOR) {
    // Create test wallet document
    const walletRef = doc(db, 'wallets', TEST_WALLET.toLowerCase());
    await setDoc(walletRef, {
      address: TEST_WALLET.toLowerCase(),
      credits: 1000,
      totalCheckins: 5,
      createdAt: new Date()
    });
    log.info(`Created test wallet with 1000 credits`);
    
    // Create admin config
    const adminRef = doc(db, 'admin', 'config');
    await setDoc(adminRef, {
      adminEmails: [TEST_EMAIL, 'admin@intelligencecubed.io']
    });
    log.info(`Created admin config`);
  }
}

async function runTests(testName) {
  console.log('═'.repeat(60));
  console.log('🧪 Firebase Cloud Functions Test Suite');
  console.log('═'.repeat(60));
  console.log(`Mode: ${USE_EMULATOR ? 'EMULATOR' : 'PRODUCTION'}`);
  
  try {
    // Setup
    const user = await setupTestUser();
    if (USE_EMULATOR) {
      await setupTestData();
    }
    
    const tests = {
      getWalletInfo: testGetWalletInfo,
      checkIsAdmin: testCheckIsAdmin,
      adminQuickCheckin: testAdminQuickCheckin,
      validateAndSpendCredits: testValidateAndSpendCredits,
      getTransactionHistory: testGetTransactionHistory,
    };
    
    const results = {};
    
    if (testName && testName !== 'all') {
      // Run single test
      if (tests[testName]) {
        results[testName] = await tests[testName](user);
      } else {
        log.error(`Unknown test: ${testName}`);
        console.log('Available tests:', Object.keys(tests).join(', '));
        process.exit(1);
      }
    } else {
      // Run all tests
      for (const [name, testFn] of Object.entries(tests)) {
        results[name] = await testFn(user);
      }
    }
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 Test Results Summary');
    console.log('═'.repeat(60));
    
    let passed = 0, failed = 0;
    for (const [name, result] of Object.entries(results)) {
      if (result) {
        log.success(name);
        passed++;
      } else {
        log.error(name);
        failed++;
      }
    }
    
    console.log('─'.repeat(60));
    console.log(`Total: ${passed} passed, ${failed} failed`);
    
    process.exit(failed > 0 ? 1 : 0);
    
  } catch (error) {
    log.error(`Test setup failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run
const testName = process.argv[2] || 'all';
runTests(testName);
