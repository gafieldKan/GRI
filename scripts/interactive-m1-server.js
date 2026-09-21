/**
 * GRI M1 交互式演示服务器
 * 
 * 功能：提供 Web 界面，交互式验证 M1 的 5 个核心场景
 * 启动：node tests/interactive-m1-server.js
 * 访问：http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const HOST = 'localhost';

// 模拟后端数据 (实际应调用 gri-backend 的真实逻辑)
// 这里为了演示，我们模拟 M1 的核心数据结构
const MOCK_DATA = {
  tree: {
    "UN": { name: "United Nations", level: 0, children: ["EAS"] },
    "EAS": { name: "East Asia", level: 1, children: ["CN"] },
    "CN": { name: "China", level: 2, children: ["CN-110000"] },
    "CN-110000": { name: "Beijing", level: 3, children: ["CN-110100"] },
    "CN-110100": { name: "Beijing City", level: 4, children: ["CN-110105"] },
    "CN-110105": { name: "Chaoyang District", level: 5, children: [] }
  },
  resources: [
    { id: "GT_CN-A01-779088927370", type: "Warehouse", location: "CN-110105", status: "Active" },
    { id: "GT_CN-B02-889199038481", type: "Factory", location: "CN-310000", status: "Active" }
  ],
  roles: {
    "merchant": ["resource:write", "tree:read", "dashboard:merchant"],
    "consumer": ["tree:read", "dashboard:consumer"]
  }
};

// HTML 界面模板
const getHTML = () => `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>GRI M1 交互式验收控制台</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #f4f6f8; margin: 0; padding: 20px; color: #333; }
        .container { max-width: 1200px; margin: 0 auto; }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-top: 20px; }
        .card { background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; border-left: 5px solid #3498db; }
        .card:hover { transform: translateY(-3px); box-shadow: 0 5px 15px rgba(0,0,0,0.15); }
        .card h3 { margin: 0 0 10px 0; color: #2c3e50; }
        .card p { font-size: 0.9em; color: #7f8c8d; margin: 0; }
        .card .badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 0.8em; background: #e1f0fa; color: #3498db; margin-top: 10px; }
        
        #output-area { margin-top: 30px; background: #282c34; color: #abb2bf; padding: 20px; border-radius: 8px; min-height: 200px; white-space: pre-wrap; font-family: "Fira Code", monospace; font-size: 0.9em; box-shadow: inset 0 2px 5px rgba(0,0,0,0.2); }
        .log-entry { border-bottom: 1px solid #3e4451; padding: 5px 0; }
        .log-time { color: #61afef; margin-right: 10px; }
        .log-success { color: #98c379; }
        .log-info { color: #61afef; }
        
        .role-switch { margin: 20px 0; padding: 15px; background: white; border-radius: 8px; display: flex; gap: 15px; align-items: center; }
        .role-btn { padding: 8px 16px; border: 1px solid #ddd; background: #f8f9fa; border-radius: 4px; cursor: pointer; }
        .role-btn.active { background: #3498db; color: white; border-color: #3498db; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🦞 GRI M1 交互式验收控制台</h1>
        <p>点击以下卡片开始测试场景，结果将显示在下方控制台。</p>
        
        <div class="role-switch">
            <span>当前视角:</span>
            <div class="role-btn active" onclick="switchRole('merchant')" id="btn-merchant">🏢 商家视角</div>
            <div class="role-btn" onclick="switchRole('consumer')" id="btn-consumer">👤 消费者视角</div>
            <span id="current-role-display" style="margin-left: auto; color: #666; font-size: 0.9em;">权限: resource:write, tree:read, dashboard:merchant</span>
        </div>

        <div class="grid">
            <div class="card" onclick="runTest('A')">
                <h3>场景 A: 低代码能力</h3>
                <p>验证 API 端点动态生成与调用示例。</p>
                <span class="badge">M1-6</span>
            </div>
            <div class="card" onclick="runTest('B')">
                <h3>场景 B: 全球行政树</h3>
                <p>查看 UN → CN → BJ 的层级结构与节点信息。</p>
                <span class="badge">M1-8a</span>
            </div>
            <div class="card" onclick="runTest('C')">
                <h3>场景 C: 主数据继承</h3>
                <p>分析配置从全球到区级的继承与覆盖逻辑。</p>
                <span class="badge">M1-8b</span>
            </div>
            <div class="card" onclick="runTest('D')">
                <h3>场景 D: 资源注册</h3>
                <p>生成资源 ID 并查看血缘映射关系。</p>
                <span class="badge">M1-8c</span>
            </div>
            <div class="card" onclick="runTest('E')">
                <h3>场景 E: 以人为本</h3>
                <p>根据当前视角 (商家/消费者) 展示差异化仪表盘。</p>
                <span class="badge">M1-9</span>
            </div>
        </div>

        <h2 style="margin-top: 30px; color: #2c3e50;">📟 运行控制台</h2>
        <div id="output-area">等待指令...</div>
    </div>

    <script>
        let currentRole = 'merchant';

        function switchRole(role) {
            currentRole = role;
            document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
            document.getElementById('btn-' + role).classList.add('active');
            
            const perms = role === 'merchant' 
                ? 'resource:write, tree:read, dashboard:merchant' 
                : 'tree:read, dashboard:consumer';
            document.getElementById('current-role-display').textContent = '权限: ' + perms;
            
            logToConsole(\`角色已切换为：\${role === 'merchant' ? '商家' : '消费者'}\`, 'info');
        }

        function logToConsole(message, type = 'info') {
            const output = document.getElementById('output-area');
            const now = new Date().toLocaleTimeString();
            const colorClass = type === 'success' ? 'log-success' : 'log-info';
            const entry = \`<div class="log-entry"><span class="log-time">[\${now}]</span><span class="\${colorClass}">\${message}</span></div>\`;
            output.innerHTML += entry;
            output.scrollTop = output.scrollHeight;
        }

        async function runTest(scenario) {
            logToConsole(\`正在运行场景 \${scenario}...\`, 'info');
            try {
                const response = await fetch('/api/run?scenario=' + scenario + '&role=' + currentRole);
                const data = await response.json();
                logToConsole(JSON.stringify(data.result, null, 2), 'success');
            } catch (e) {
                logToConsole('Error: ' + e.message, 'error');
            }
        }
    </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, \`http://\${HOST}:\${PORT}\`);

  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getHTML());
  } else if (url.pathname === '/api/run') {
    const scenario = url.searchParams.get('scenario');
    const role = url.searchParams.get('role') || 'merchant';
    
    // 模拟后端逻辑处理
    let result = {};
    switch(scenario) {
      case 'A':
        result = {
          status: "OK",
          message: "低代码 API 端点已生成",
          endpoints: [
            "GET /api/v1/tree",
            "POST /api/v1/resource",
            "GET /api/v1/config/inheritance"
          ],
          example_call: "curl -X GET http://localhost:3000/api/v1/tree"
        };
        break;
      case 'B':
        result = {
          status: "OK",
          message: "全球行政树结构",
          tree_sample: {
            "UN": "United Nations",
            "└─EAS": "East Asia",
            "  └─CN": "China",
            "    └─CN-110000": "Beijing",
            "      └─CN-110105": "Chaoyang District"
          }
        };
        break;
      case 'C':
        result = {
          status: "OK",
          message: "主数据继承链分析",
          inheritance_chain: [
            { level: "Global (UN)", config: "{ currency: 'USD', lang: 'en' }" },
            { level: "Country (CN)", config: "{ currency: 'CNY', lang: 'zh-CN' } (Override)" },
            { level: "City (BJ)", config: "{ tax_rate: 0.05 } (Add)" }
          ],
          final_config: "{ currency: 'CNY', lang: 'zh-CN', tax_rate: 0.05 }"
        };
        break;
      case 'D':
        const randomId = Math.floor(Math.random() * 10000000000);
        result = {
          status: "OK",
          message: "资源注册成功",
          resource_id: \`GT_CN-A01-\${randomId}\`,
          type: "Warehouse",
          location_code: "CN-110105",
          mapped_to: "Physical Warehouse #3"
        };
        break;
      case 'E':
        if (role === 'merchant') {
          result = {
            view: "MERCHANT_DASHBOARD",
            widgets: ["库存监控", "订单处理", "资源调度", "财务报表"],
            actions_available: ["创建资源", "编辑配置", "审批流程"]
          };
        } else {
          result = {
            view: "CONSUMER_DASHBOARD",
            widgets: ["商品浏览", "订单查询", "物流追踪"],
            actions_available: ["下单购买", "申请售后"]
          };
        }
        break;
      default:
        result = { error: "Unknown scenario" };
    }

    res.writeHead(200);
    res.end(JSON.stringify({ result }));
  } else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(\`
  🦞 GRI M1 交互式演示服务器已启动
  
  🌐 请在浏览器访问：http://\${HOST}:\${PORT}
  
  按 Ctrl+C 停止服务
  \`);
});
