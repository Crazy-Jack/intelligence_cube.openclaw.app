// hardhat-bscscan-opbnb.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true 
    }
  },

  networks: {
    // Local dev
    hardhat: { chainId: 1337 },

    // BNB Smart Chain Mainnet
    bscmainnet: {
      url: "https://bsc-dataseed1.binance.org/",
      chainId: 56,
      gasPrice: 3e9,
      accounts: process.env.PRIVATE_KEY_MAINNET ? [process.env.PRIVATE_KEY_MAINNET] : [],
      timeout: 120000,
      confirmations: 3
    },

    // opBNB Mainnet (使用 BscScan 的浏览器)
    opbnbmainnet: {
      url: "https://opbnb-mainnet-rpc.bnbchain.org",
      chainId: 204,
      gasPrice: 1e9,
      accounts: process.env.PRIVATE_KEY_MAINNET ? [process.env.PRIVATE_KEY_MAINNET] : [],
      timeout: 120000,
      confirmations: 1
    }
  },

  etherscan: {
    // 关键修改：使用统一的 BSCSCAN_API_KEY
    apiKey: process.env.BSCSCAN_API_KEY || "",
    
    customChains: [
      {
        // opBNB 通过 BscScan 验证
        network: "opbnbmainnet",
        chainId: 204,
        urls: {
          // BscScan 的 opBNB API 端点
          apiURL: "https://api-opbnb.bscscan.com/api",
          browserURL: "https://opbnb.bscscan.com"
        }
      }
    ]
  },

  sourcify: {
    enabled: false
  },

  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
    gasPrice: 3,
    coinmarketcap: process.env.COINMARKETCAP_API_KEY
  },

  mocha: {
    timeout: 120000
  },

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache", 
    artifacts: "./artifacts"
  }
};