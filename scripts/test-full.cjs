#!/usr/bin/env node
/**
 * 智学慧眼 SmartLens v5.1 - 自动化测试脚本
 * 测试环境：http://localhost:3002
 */

const http = require('http');

const BACKEND = 'http://localhost:3002';
let pass = 0;
let fail = 0;

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const NC = '\x1b[0m';

function log(text) {
    console.log(text);
}

function passTest(msg) {
    log(`${GREEN}✓ 通过${NC} - ${msg}`);
    pass++;
}

function failTest(msg) {
    log(`${RED}✗ 失败${NC} - ${msg}`);
    fail++;
}

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BACKEND);
        const options = {
            hostname: url.hostname,
            port: url.port || 3002,
            path: url.pathname + url.search,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve({ raw: data, error: 'JSON parse error' });
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function testHealth() {
    log(`${YELLOW}[1]${NC} 后端健康检查...`);
    try {
        const res = await request('GET', '/health');
        if (res.status === 'ok') {
            passTest('后端服务正常');
            return true;
        } else {
            failTest('后端服务异常');
            return false;
        }
    } catch (e) {
        failTest(`健康检查失败：${e.message}`);
        return false;
    }
}

async function testCreateSession() {
    log(`${YELLOW}[2]${NC} 创建会话测试...`);
    try {
        const res = await request('POST', '/api/session', {
            studentId: 'test_student',
            knowledgePointId: 'math_pythagorean'
        });
        if (res.sessionId) {
            passTest(`会话创建成功：${res.sessionId}`);
            return res.sessionId;
        } else {
            failTest('会话创建失败');
            return null;
        }
    } catch (e) {
        failTest(`创建会话失败：${e.message}`);
        return null;
    }
}

async function testAIResponse(sessionId) {
    log(`${YELLOW}[3]${NC} AI 响应测试...`);
    try {
        const res = await request('POST', '/api/chat', {
            sessionId: sessionId,
            message: '你好，我想学习勾股定理'
        });
        if (res.state === 'DIAGNOSING') {
            passTest('AI 响应正常 (状态：DIAGNOSING)');
            return true;
        } else {
            failTest('AI 响应状态异常');
            return false;
        }
    } catch (e) {
        failTest(`AI 响应失败：${e.message}`);
        return false;
    }
}

async function testQuestionsLoaded() {
    log(`${YELLOW}[4]${NC} 题目加载测试...`);
    try {
        // 创建新会话
        const sessionRes = await request('POST', '/api/session', {
            studentId: 'test2',
            knowledgePointId: 'math_pythagorean'
        });

        const res = await request('POST', '/api/chat', {
            sessionId: sessionRes.sessionId,
            message: '开始'
        });

        const qCount = res.questions ? res.questions.length : 0;
        if (qCount >= 1) {
            passTest(`加载诊断题：${qCount}道`);
            return true;
        } else {
            failTest('题目加载失败');
            return false;
        }
    } catch (e) {
        failTest(`题目加载失败：${e.message}`);
        return false;
    }
}

async function testAnswerValidation() {
    log(`${YELLOW}[5]${NC} 答案校验测试...`);
    try {
        const sessionRes = await request('POST', '/api/session', {
            studentId: 'test3',
            knowledgePointId: 'math_pythagorean'
        });

        // 获取题目
        await request('POST', '/api/chat', {
            sessionId: sessionRes.sessionId,
            message: '开始'
        });

        // 提交答案 (选择题)
        const answerRes = await request('POST', '/api/chat', {
            sessionId: sessionRes.sessionId,
            message: '我选择 5'
        });

        if (answerRes.message && (answerRes.message.includes('回答正确') || answerRes.message.includes('回答错误'))) {
            passTest('答案校验功能正常');
            return true;
        } else {
            failTest('答案校验失败');
            return false;
        }
    } catch (e) {
        failTest(`答案校验失败：${e.message}`);
        return false;
    }
}

async function testQuizFlow() {
    log(`${YELLOW}[6]${NC} 测验流程测试...`);
    try {
        const sessionRes = await request('POST', '/api/session', {
            studentId: 'test4',
            knowledgePointId: 'math_pythagorean'
        });

        const sessionId = sessionRes.sessionId;

        // 第一轮对话
        await request('POST', '/api/chat', {
            sessionId: sessionId,
            message: '开始学习'
        });

        // 检查状态
        const res = await request('POST', '/api/chat', {
            sessionId: sessionId,
            message: '5'
        });

        if (res.state) {
            passTest('测验流程正常');
            return true;
        } else {
            failTest('测验流程异常');
            return false;
        }
    } catch (e) {
        failTest(`测验流程失败：${e.message}`);
        return false;
    }
}

async function runTests() {
    console.log(`
${YELLOW}============================================
  智学慧眼 SmartLens v5.1 - 自动化测试
============================================${NC}

测试环境：${BACKEND}
测试时间：${new Date().toLocaleString('zh-CN')}
`);

    // 1. 健康检查
    await testHealth();

    // 2. 创建会话
    const sessionId = await testCreateSession();

    // 3. AI 响应测试
    if (sessionId) {
        await testAIResponse(sessionId);
    } else {
        failTest('无 sessionId，跳过后续测试');
    }

    // 4. 题目加载测试
    await testQuestionsLoaded();

    // 5. 答案校验测试
    await testAnswerValidation();

    // 6. 测验流程测试
    await testQuizFlow();

    // 输出结果
    console.log(`
${YELLOW}============================================
  测试结果
============================================${NC}
通过：${GREEN}${pass}${NC}  失败：${RED}${fail}${NC}
`);

    if (fail === 0) {
        console.log(`${GREEN}所有测试通过！系统运行正常。${NC}\n`);
        process.exit(0);
    } else {
        console.log(`${RED}部分测试失败，请检查系统配置。${NC}\n`);
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error('测试执行失败:', err);
    process.exit(1);
});
