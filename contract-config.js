// contract-config.js - 智能合约配置

// 合约地址配置
const CHECKIN_CONTRACTS = {
    BSC: {
        chainId: '0x38',  // 56
        chainName: 'BNB Smart Chain Mainnet',
        checkInAddress: '0x499cEA3f6e1902d8f33b56c37271C85Bac68F6FC',
        tokenAddress: '0x4ec682AAA62cafee3aDf2c4c2fD04Bd0AC1b2A9a',
        rpcUrl: 'https://bsc-dataseed1.binance.org/',
        explorer: 'https://bscscan.com',
        nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18
        }
    },
    OPBNB: {
        chainId: '0xcc',  // 204
        chainName: 'opBNB Mainnet',
        checkInAddress: '0x31C5645Ffd25f9e4Fe984C63A80C72A866f67d35',
        tokenAddress: '0xF0E019Bb23a4c314db4df42a70Af128987Fba285',
        rpcUrl: 'https://opbnb-mainnet-rpc.bnbchain.org',
        explorer: 'https://opbnbscan.com',
        nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18
        }
    },
    ETH: {
        chainId: '0x1',  // 1
        chainName: 'Ethereum Mainnet',
        checkInAddress: '0x57Bb2Ae11cbbdEFA7d7eBb522C2e19bA3f73EF79',  // 🔴 部署后填写你的 ETH 签到合约地址
        tokenAddress: '',              // 🔴 部署后填写你的 ETH 代币合约地址（可选）
        rpcUrl: 'https://cloudflare-eth.com',
        explorer: 'https://etherscan.io',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18
        }
    },
    BASE: {
        chainId: '0x2105', // 8453
        chainName: 'Base Mainnet',
        checkInAddress: '0xcB80Fb8a37711b24D10Ddf4dAeD161a9CCE17B79',   
        tokenAddress: '0xYourBaseTokenAddress',                  // 🔴 部署后填写你的 Base 代币合约地址（可选）
        rpcUrl: 'https://mainnet.base.org',
        explorer: 'https://basescan.org',
        nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18
        }
    }
};

// I3CheckInCore 合约 ABI（只包含需要的函数）
const CHECKIN_ABI = [
    "function checkIn() external payable",
    "function getUserStatus(address user) external view returns (uint256 lastDay, uint256 streak, uint256 totalCredits, uint256 availableCredits, uint256 nextReward, bool canCheckInToday)",
    "function getGlobalStats() external view returns (uint256 totalUsersCount, uint256 totalCheckInsCount, uint256 totalCreditsCount, uint256 todayUsers, uint256 todayCredits)",
    "event CheckedIn(address indexed user, uint256 indexed dayIndex, uint256 streak, uint256 credits)"
];

// Admin 邮箱白名单（替换为你的实际邮箱）
const ADMIN_EMAILS = [
    'fanfeizhiz@gmail.com',  // 替换这个
    'rerunner823@gmail.com'       // 如果有多个 admin
];

// 判断当前用户是否为 Admin
function isAdmin() {
    if (!window.currentUser || !window.currentUser.email) {
        return false;
    }
    const userEmail = window.currentUser.email.toLowerCase();
    return ADMIN_EMAILS.some(adminEmail => 
        adminEmail.toLowerCase() === userEmail
    );
}

// 根据链 ID 或名称获取配置
function getContractConfig(chainIdOrKey) {
    if (typeof chainIdOrKey === 'string' && CHECKIN_CONTRACTS[chainIdOrKey.toUpperCase()]) {
        return CHECKIN_CONTRACTS[chainIdOrKey.toUpperCase()];
    }
    for (const key in CHECKIN_CONTRACTS) {
        if (CHECKIN_CONTRACTS[key].chainId === chainIdOrKey) {
            return CHECKIN_CONTRACTS[key];
        }
    }
    return null;
}

// 导出到全局
window.CHECKIN_CONTRACTS = CHECKIN_CONTRACTS;
window.CHECKIN_ABI = CHECKIN_ABI;
window.ADMIN_EMAILS = ADMIN_EMAILS;
window.isAdmin = isAdmin;
window.getContractConfig = getContractConfig;

console.log('✅ Contract configuration loaded');
console.log('📍 BSC CheckIn:', CHECKIN_CONTRACTS.BSC.checkInAddress);
console.log('📍 opBNB CheckIn:', CHECKIN_CONTRACTS.OPBNB.checkInAddress);
console.log('📍 ETH CheckIn:', CHECKIN_CONTRACTS.ETH.checkInAddress || '(not set)');
console.log('📍 Base CheckIn:', CHECKIN_CONTRACTS.BASE.checkInAddress || '(not set)');

// === SOLANA CONFIG (append to the end of contract-config.js) ===
const SOLANA_CONFIG = {
  cluster: (window?.ENV?.SOLANA_CLUSTER) || 'devnet',
  programId: (window?.ENV?.SOLANA_PROGRAM_ID) || 'HDNJ2F8CMHksj2EzuutDZiHrduCyi4KLZGabpdCs5BfZ',
  idlPath: '/solana-idl.json'
};

// 挂到全局，便于其它脚本直接读取
window.SOLANA_CONFIG = SOLANA_CONFIG;
console.log('📍 Solana ProgramId:', SOLANA_CONFIG.programId, 'cluster =', SOLANA_CONFIG.cluster);