// mobile-test-guide.js - 移动设备测试指南
// 运行此脚本以获取在手机上测试应用所需的信息

const os = require('os');
const { execSync } = require('child_process');

console.log('\n📱 ============================================');
console.log('   移动设备测试指南');
console.log('   ============================================\n');

// 获取本地 IP 地址
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // 跳过内部（即127.0.0.1）和非IPv4地址
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          name: name,
          address: iface.address
        });
      }
    }
  }

  return addresses;
}

const localIPs = getLocalIP();
// 优先显示 WiFi/Ethernet，排除 VPN (如 NordLynx, TAP, etc.)
const wifiIPs = localIPs.filter(ip => 
  !['nordlynx', 'tap', 'tun', 'vpn'].some(vpn => ip.name.toLowerCase().includes(vpn))
);
const displayIPs = wifiIPs.length > 0 ? wifiIPs : localIPs;
const PORT = process.env.PORT || 3001;

console.log('📍 步骤 1: 确保服务器正在运行');
console.log('   运行命令: npm start 或 node serve.js\n');

console.log('📍 步骤 2: 获取你的电脑 IP 地址');
if (displayIPs.length > 0) {
  console.log('   找到以下网络接口:\n');
  displayIPs.forEach((ip, index) => {
    const isWiFi = /wifi|ethernet|lan|wireless/i.test(ip.name);
    const marker = isWiFi ? '📶 (推荐)' : '';
    console.log(`   ${index + 1}. ${ip.name}: ${ip.address} ${marker}`);
  });
  if (localIPs.length > displayIPs.length) {
    console.log(`\n   (已隐藏 ${localIPs.length - displayIPs.length} 个 VPN/虚拟接口)`);
  }
  const primaryIP = displayIPs[0].address;
  console.log(`\n   ✅ 推荐使用: ${primaryIP}\n`);
} else {
  console.log('   ⚠️  无法自动检测 IP 地址，请手动查找:');
  console.log('   - Windows: ipconfig (查找 IPv4 地址)');
  console.log('   - Mac/Linux: ifconfig 或 ip addr\n');
}

console.log('📍 步骤 3: 确保手机和电脑在同一 WiFi 网络\n');

console.log('📍 步骤 4: 在手机浏览器中访问');
if (displayIPs.length > 0) {
  const primaryIP = displayIPs[0].address;
  console.log(`   🌐 主页: http://${primaryIP}:${PORT}`);
  console.log(`   📊 Benchmark: http://${primaryIP}:${PORT}/benchmark.html`);
  console.log(`   🎨 Modelverse: http://${primaryIP}:${PORT}/modelverse.html`);
  console.log(`   💼 My Assets: http://${primaryIP}:${PORT}/myassets.html`);
  console.log(`   🛒 My Cart: http://${primaryIP}:${PORT}/mycart.html`);
  console.log(`   🔄 Workflow: http://${primaryIP}:${PORT}/workflow.html`);
} else {
  console.log(`   🌐 将 YOUR_IP 替换为你的 IP 地址:`);
  console.log(`   http://YOUR_IP:${PORT}`);
}

console.log('\n📍 步骤 5: 防火墙设置');
console.log('   如果无法访问，可能需要允许防火墙规则:');
console.log('   - Windows: 允许 Node.js 通过防火墙');
console.log('   - Mac: 系统偏好设置 > 安全性与隐私 > 防火墙\n');

console.log('📍 步骤 6: 测试钱包连接');
console.log('   在手机上测试时:');
console.log('   1. MetaMask: 确保手机安装了 MetaMask App');
console.log('   2. WalletConnect: 可以使用二维码连接');
console.log('   3. Coinbase Wallet: 需要安装 Coinbase Wallet App');
console.log('   4. Phantom: Solana 钱包（需要安装 Phantom App）\n');

console.log('💡 提示:');
console.log('   - 如果连接失败，检查电脑防火墙设置');
console.log('   - 确保手机和电脑在同一局域网');
console.log('   - 某些公司/学校网络可能阻止设备间通信');
console.log('   - 可以尝试关闭电脑的防火墙进行测试\n');

console.log('============================================\n');

// 如果有 vite，也显示 vite 的访问方式
if (process.argv.includes('--vite')) {
  console.log('📦 使用 Vite 开发服务器:');
  console.log('   运行: npm run dev');
  console.log('   默认端口: 5173');
  if (displayIPs.length > 0) {
    console.log(`   访问: http://${displayIPs[0].address}:5173\n`);
  }
}

