/**
 * API 测试脚本
 * 用于验证后端服务是否正常运行
 */

const API_BASE = 'http://localhost:3002';

async function testHealth() {
  console.log('\n=== 测试健康检查 ===');
  const res = await fetch(`${API_BASE}/health`);
  const data = await res.json();
  console.log('健康状态:', data);
  return data.status === 'ok';
}

async function testCreateSession() {
  console.log('\n=== 测试创建会话 ===');
  const res = await fetch(`${API_BASE}/api/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: 'student_001',
      knowledgePointId: 'math_pythagorean',
      subject: 'math'
    })
  });
  const data = await res.json();
  console.log('会话创建:', data);
  return data;
}

async function testGetSession(sessionId) {
  console.log('\n=== 测试获取会话状态 ===');
  const res = await fetch(`${API_BASE}/api/session/${sessionId}`);
  const data = await res.json();
  console.log('会话状态:', data);
  return data;
}

async function runTests() {
  console.log('开始 API 测试...');

  try {
    // 1. 健康检查
    const healthOk = await testHealth();
    if (!healthOk) {
      console.error('健康检查失败');
      return;
    }

    // 2. 创建会话
    const session = await testCreateSession();
    if (session.sessionId) {
      // 3. 获取会话状态
      await testGetSession(session.sessionId);
    }

    console.log('\n=== 所有测试通过 ===\n');
  } catch (error) {
    console.error('测试失败:', error);
  }
}

runTests();
