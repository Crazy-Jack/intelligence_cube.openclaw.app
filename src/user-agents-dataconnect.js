// 🔧 User Agents Data Connect Helper
// This module provides functions to query AlloyDB for user agents via Firebase Data Connect
// 
// NOTE: Before using this, you must:
// 1. Set up Firebase Data Connect queries in Firebase Console:
//    - Query: ListUserAgents (returns all user agents)
//    - Query: GetUserAgentByName (returns single agent by name)
// 2. Regenerate the SDK: firebase dataconnect:sdk:generate
// 3. The generated functions will be available in src/dataconnect-generated/

const { getDataConnect } = require('firebase/data-connect');

// Try to load the generated SDK
let dataconnectGenerated = null;
let connectorConfig = null;

try {
  dataconnectGenerated = require('./dataconnect-generated/index.cjs.js');
  connectorConfig = dataconnectGenerated.connectorConfig;
} catch (error) {
  console.warn('⚠️ Firebase Data Connect SDK not found. User agent queries will not work until SDK is generated.');
}

/**
 * Initialize Data Connect instance
 * @returns {DataConnect|null} Data Connect instance or null if not available
 */
function getDataConnectInstance() {
  if (!connectorConfig) {
    return null;
  }
  
  try {
    return getDataConnect(connectorConfig);
  } catch (error) {
    console.error('❌ Error initializing Data Connect:', error);
    return null;
  }
}

/**
 * Get all user agents from AlloyDB
 * @returns {Promise<Array>} Array of user agents
 */
async function listUserAgents() {
  const dataConnect = getDataConnectInstance();
  if (!dataConnect) {
    throw new Error('Data Connect not initialized. Please set up Firebase Data Connect queries first.');
  }

  // TODO: Once the query is set up in Firebase Console and SDK is regenerated,
  // uncomment and use the generated function:
  // 
  // if (dataconnectGenerated && dataconnectGenerated.listUserAgents) {
  //   const { data } = await dataconnectGenerated.listUserAgents(dataConnect);
  //   return data.userAgents || [];
  // }
  
  // For now, return empty array
  console.warn('⚠️ listUserAgents query not yet available. Please set up Firebase Data Connect query.');
  return [];
}

/**
 * Get a specific user agent by name from AlloyDB
 * @param {string} name - Agent name
 * @returns {Promise<Object|null>} User agent object or null if not found
 */
async function getUserAgentByName(name) {
  if (!name) {
    throw new Error('Agent name is required');
  }

  const dataConnect = getDataConnectInstance();
  if (!dataConnect) {
    throw new Error('Data Connect not initialized. Please set up Firebase Data Connect queries first.');
  }

  // TODO: Once the query is set up in Firebase Console and SDK is regenerated,
  // uncomment and use the generated function:
  // 
  // if (dataconnectGenerated && dataconnectGenerated.getUserAgentByName) {
  //   const { data } = await dataconnectGenerated.getUserAgentByName(dataConnect, { name });
  //   return data.userAgent || null;
  // }
  
  // For now, return null
  console.warn('⚠️ getUserAgentByName query not yet available. Please set up Firebase Data Connect query.');
  return null;
}

/**
 * Check if Data Connect is properly configured
 * @returns {boolean} True if configured, false otherwise
 */
function isDataConnectConfigured() {
  return connectorConfig !== null && dataconnectGenerated !== null;
}

module.exports = {
  listUserAgents,
  getUserAgentByName,
  isDataConnectConfigured,
  getDataConnectInstance
};

