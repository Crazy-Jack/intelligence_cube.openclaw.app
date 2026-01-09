// chains.js — 统一管理 EVM & Solana 的"当前链"与元数据

export const EVM_CHAINS = [
  { key: 'bsc',   type: 'evm', chainIdHex: '0x38',   displayName: 'BNB Chain' },
  { key: 'opbnb', type: 'evm', chainIdHex: '0xcc',   displayName: 'opBNB' },
  { key: 'eth',   type: 'evm', chainIdHex: '0x1',    displayName: 'Ethereum' },
  { key: 'base',  type: 'evm', chainIdHex: '0x2105', displayName: 'Base' },
];

function normalizeSolanaCluster(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (!v) return 'devnet';
  if (v === 'mainnet-beta' || v === 'mainnet' || v === 'mainnetbeta') return 'mainnet';
  if (v === 'testnet') return 'testnet';
  return 'devnet';
}

const SOLANA_PROGRAM_ID_BY_CLUSTER = {
  mainnet: 'YourSolanaMainnetProgramId',  // 🔴 部署后填写你的 Solana Mainnet Program ID
  devnet:  'HDNJ2F8CMHksj2EzuutDZiHrduCyi4KLZGabpdCs5BfZ',  // 你现有的 devnet Program ID
  testnet: undefined,  // 如果有 testnet 部署可以填写
};

const DEFAULT_SOLANA_PROGRAM_ID =
  (window?.ENV?.SOLANA_PROGRAM_ID) || 'HDNJ2F8CMHksj2EzuutDZiHrduCyi4KLZGabpdCs5BfZ';

const _solCluster = normalizeSolanaCluster(localStorage.getItem('solanaCluster') || (window?.ENV?.SOLANA_CLUSTER) || 'devnet');
const _solProgramId = SOLANA_PROGRAM_ID_BY_CLUSTER[_solCluster] || DEFAULT_SOLANA_PROGRAM_ID;

export const SOLANA = {
  key: 'solana',
  type: 'solana',
  cluster: _solCluster,
  endpointByCluster: {
    mainnet: 'https://api.mainnet-beta.solana.com',
    devnet:  'https://api.devnet.solana.com',
    testnet: 'https://api.testnet.solana.com',
  },
  programId: _solProgramId,
  idlPath: '/solana-idl.json',
  explorerByCluster: {
    mainnet: 'https://explorer.solana.com',
    devnet:  'https://explorer.solana.com?cluster=devnet',
    testnet: 'https://explorer.solana.com?cluster=testnet',
  }
};

// 初始化当前链：优先读本地存储键
const DEFAULT_CHAIN_KEY = localStorage.getItem('currentChainKey') || 'bsc';
export let CurrentChain = (DEFAULT_CHAIN_KEY === 'solana')
  ? SOLANA
  : (EVM_CHAINS.find(c => c.key === DEFAULT_CHAIN_KEY) || EVM_CHAINS[0]);

export function setCurrentChain(key) {
  if (key === 'solana') CurrentChain = SOLANA;
  else CurrentChain = EVM_CHAINS.find(c => c.key === key) || EVM_CHAINS[0];
  localStorage.setItem('currentChainKey', key);
  window.dispatchEvent(new CustomEvent('chainChanged', { detail: { key } }));
}

export function isSolanaSelected() {
  return CurrentChain?.type === 'solana';
}

export function solanaEndpoint() {
  return SOLANA.endpointByCluster[SOLANA.cluster] || SOLANA.endpointByCluster.devnet;
}

export function solanaExplorerTx(sig) {
  const base = SOLANA.explorerByCluster[SOLANA.cluster] || SOLANA.explorerByCluster.devnet;
  return `${base}/tx/${sig}`;
}

export function setSolanaCluster(clusterRaw) {
  const c = normalizeSolanaCluster(clusterRaw);
  SOLANA.cluster = c;
  localStorage.setItem('solanaCluster', c);
  // 同步 programId（允许你为 mainnet/devnet 配不同 programId）
  const pid = SOLANA_PROGRAM_ID_BY_CLUSTER[c] || (window?.ENV?.SOLANA_PROGRAM_ID) || SOLANA.programId;
  SOLANA.programId = pid;
  window.dispatchEvent(new CustomEvent('solanaClusterChanged', { detail: { cluster: c } }));
}

// 让非模块脚本也能用
window.setCurrentChain  = setCurrentChain;
window.isSolanaSelected = isSolanaSelected;
window.setSolanaCluster = setSolanaCluster;
