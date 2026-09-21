/**
 * 核心链路测试脚本
 * 测试流程：拍照 (Mock) → 识别 → 分析 → 生成报告 → 生成学习计划
 */

const API_BASE = 'http://localhost:3003';

// 测试配置
const TEST_CONFIG = {
  studentId: 'student_test_001',
  studentName: '张小明',
  grade: 8,
  subject: 'math',
  gradeLevel: 'K8',
  textbookVersion: '人教版',
  imageUrl: '/uploads/test_exam_001.jpg'
};

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function success(message) {
  log(`✓ ${message}`, 'green');
}

function error(message) {
  log(`✗ ${message}`, 'red');
}

function info(message) {
  log(`→ ${message}`, 'blue');
}

/**
 * 测试 1: 创建学生档案
 */
async function testCreateStudent() {
  info('测试 1: 创建学生档案');

  try {
    const response = await fetch(`${API_BASE}/api/student`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: TEST_CONFIG.studentId,
        name: TEST_CONFIG.studentName,
        grade: TEST_CONFIG.grade,
        textbookVersion: TEST_CONFIG.textbookVersion,
        school: '测试中学'
      })
    });

    const result = await response.json();

    if (response.ok) {
      success(`学生档案创建成功：${result.studentId}`);
      return true;
    } else {
      error(`创建失败：${result.error}`);
      return false;
    }
  } catch (err) {
    error(`异常：${err.message}`);
    return false;
  }
}

/**
 * 测试 2: 试卷识别 (Mock 模式)
 */
async function testExamUpload() {
  info('测试 2: 试卷识别 (Mock 模式)');

  try {
    const response = await fetch(`${API_BASE}/api/exam/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl: TEST_CONFIG.imageUrl,
        subject: TEST_CONFIG.subject,
        gradeLevel: TEST_CONFIG.gradeLevel
      })
    });

    const result = await response.json();

    if (result.success) {
      success(`试卷识别成功，识别到 ${result.parsedQuestions?.length || 0} 道题目`);
      return result;
    } else {
      error(`识别失败：${result.error}`);
      return null;
    }
  } catch (err) {
    error(`异常：${err.message}`);
    return null;
  }
}

/**
 * 测试 3: 保存试卷记录
 */
async function testExamSave(scanResult) {
  info('测试 3: 保存试卷记录');

  try {
    const response = await fetch(`${API_BASE}/api/exam/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: TEST_CONFIG.studentId,
        subject: TEST_CONFIG.subject,
        gradeLevel: TEST_CONFIG.gradeLevel,
        examType: 'manual',
        rawImages: [{ url: TEST_CONFIG.imageUrl, page: 1 }],
        ocrResult: scanResult?.ocr || {},
        parsedQuestions: scanResult?.parsedQuestions || []
      })
    });

    const result = await response.json();

    if (response.ok) {
      success(`试卷保存成功：${result.examId}`);
      return result.examId;
    } else {
      error(`保存失败：${result.error}`);
      return null;
    }
  } catch (err) {
    error(`异常：${err.message}`);
    return null;
  }
}

/**
 * 测试 4: 学情分析
 */
async function testAnalysis(examId) {
  info('测试 4: 学情分析');

  // Mock 题目和学生答案
  const questions = [
    {
      id: 'q1',
      type: 'choice',
      content: '已知直角三角形两直角边为 3 和 4，斜边是？A.5 B.6 C.7 D.8',
      answer: 'A',
      knowledgePoint: '勾股定理'
    },
    {
      id: 'q2',
      type: 'fill',
      content: '解方程 2x+3=7，x=?',
      answer: '2',
      knowledgePoint: '一元一次方程'
    }
  ];

  const studentAnswers = ['A', '3']; // 第 2 题答错

  try {
    const response = await fetch(`${API_BASE}/api/analysis/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: TEST_CONFIG.studentId,
        examId,
        questions,
        studentAnswers,
        subject: TEST_CONFIG.subject,
        gradeLevel: TEST_CONFIG.gradeLevel
      })
    });

    const result = await response.json();

    if (result.success) {
      success(`学情分析完成，报告 ID: ${result.reportId}`);

      const report = result.report;
      console.log(`
  ┌─────────────────────────────────────┐
  │  学情分析报告                        │
  ├─────────────────────────────────────┤
  │  知识点掌握：${report.knowledgePoints?.map(k => `${k.name}:${k.level}`).join(', ') || '无'}  │
  │  能力维度：记忆${report.abilityDims?.memory || 0}/理解${report.abilityDims?.understanding || 0}  │
  │  薄弱点：${report.weakPoints?.join(', ') || '无'}  │
  │  建议：${report.aiSuggestions?.[0]?.substring(0, 20) || '无'}...  │
  └─────────────────────────────────────┘
      `);

      return result;
    } else {
      error(`分析失败：${result.error}`);
      return null;
    }
  } catch (err) {
    error(`异常：${err.message}`);
    return null;
  }
}

/**
 * 测试 5: 生成学习计划
 */
async function testPlanGeneration() {
  info('测试 5: 生成学习计划');

  try {
    const response = await fetch(`${API_BASE}/api/plan/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: TEST_CONFIG.studentId,
        planType: 'daily',
        startDate: new Date().toISOString()
      })
    });

    const result = await response.json();

    if (result.success) {
      success(`学习计划生成成功，计划 ID: ${result.planId}`);
      return result;
    } else {
      error(`生成失败：${result.error}`);
      return null;
    }
  } catch (err) {
    error(`异常：${err.message}`);
    return null;
  }
}

/**
 * 测试 6: 动态出题
 */
async function testQuestionGeneration() {
  info('测试 6: 动态出题');

  try {
    const response = await fetch(`${API_BASE}/api/question/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: TEST_CONFIG.subject,
        gradeLevel: TEST_CONFIG.gradeLevel,
        textbookVersion: TEST_CONFIG.textbookVersion,
        knowledgePoint: '勾股定理',
        difficulty: 0.5,
        count: 2
      })
    });

    const result = await response.json();

    if (result.success) {
      success(`出题成功，共 ${result.questions?.length || 0} 道题目`);
      result.questions?.forEach((q, i) => {
        console.log(`    题目${i + 1}: ${q.content?.substring(0, 30)}...`);
      });
      return result;
    } else {
      error(`出题失败：${result.error}`);
      return null;
    }
  } catch (err) {
    error(`异常：${err.message}`);
    return null;
  }
}

/**
 * 测试健康检查
 */
async function testHealth() {
  info('测试 0: 健康检查');

  try {
    const response = await fetch(`${API_BASE}/health`);
    const result = await response.json();

    if (result.status === 'ok') {
      success(`服务正常：${result.service} (${result.version})`);
      return true;
    } else {
      error('服务异常');
      return false;
    }
  } catch (err) {
    error(`无法连接服务器：${err.message}`);
    return false;
  }
}

/**
 * 主测试流程
 */
async function runTests() {
  console.log(`
╔════════════════════════════════════════════════════╗
║     智学慧眼 - 核心链路测试                         ║
║     拍照 → 识别 → 分析 → 报告 → 计划                ║
╚════════════════════════════════════════════════════╝
  `);

  const results = {
    total: 0,
    passed: 0,
    failed: 0
  };

  // 测试 0: 健康检查
  results.total++;
  if (await testHealth()) {
    results.passed++;
  } else {
    results.failed++;
    log('\n⚠  服务未启动，请先启动服务器：npm start', 'yellow');
    return;
  }

  // 测试 1: 创建学生
  results.total++;
  if (await testCreateStudent()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // 测试 2: 试卷识别
  results.total++;
  const scanResult = await testExamUpload();
  if (scanResult) {
    results.passed++;
  } else {
    results.failed++;
  }

  // 测试 3: 保存试卷
  if (scanResult) {
    results.total++;
    const examId = await testExamSave(scanResult);
    if (examId) {
      results.passed++;

      // 测试 4: 学情分析
      results.total++;
      const analysisResult = await testAnalysis(examId);
      if (analysisResult) {
        results.passed++;
      } else {
        results.failed++;
      }
    } else {
      results.failed++;
    }
  }

  // 测试 5: 学习计划
  results.total++;
  if (await testPlanGeneration()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // 测试 6: 动态出题
  results.total++;
  if (await testQuestionGeneration()) {
    results.passed++;
  } else {
    results.failed++;
  }

  // 汇总结果
  console.log(`
╔════════════════════════════════════════════════════╗
║  测试结果汇总                                        ║
╠────────────────────────────────────────────────────┤
║  总计：${results.total} 项                            ║
║  通过：${results.passed} 项                            ║
║  失败：${results.failed} 项                            ║
╚════════════════════════════════════════════════════╝
  `);

  if (results.failed === 0) {
    log('🎉 所有测试通过!', 'green');
  } else {
    log('⚠  部分测试失败，请检查日志', 'yellow');
  }
}

// 运行测试
runTests().catch(console.error);
