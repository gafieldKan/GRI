/**
 * 智学慧眼 - AI 学情辅导系统后端服务 (重构版)
 *
 * 核心功能:
 * - 试卷拍照识别 (OCR + AI)
 * - 学情分析 (五维分析)
 * - 动态出题 (按年级/学科/教材版本)
 * - 学习计划生成 (日/周/月)
 */

import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import http from 'http';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

// Agent 导入
import { ExamScannerAgent } from './agents/ExamScannerAgent.js';
import { TutorAgent } from './agents/TutorAgent.js';
import { QuestionGeneratorAgent } from './agents/QuestionGeneratorAgent.js';
import { PlanAgent } from './agents/PlanAgent.js';

// Session 导入
import { SessionFSM } from './modules/session/SessionFSM.js';
import { AIService } from './modules/ai/AIService.js';
import { QuestionService } from './modules/question/QuestionService.js';

// JWT 强制鉴权中间件（接入 @gri/jwt-verifier，阶段 C 后端收口）
import { requireAuth } from './infra/auth/jwt-auth.js';

// 加载环境变量
dotenv.config();

const PORT = process.env.PORT || 3003;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 中间件
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));

// 全站 JWT 强制鉴权（阶段 C）：所有 /api/* 学情端点要求 Bearer RS256 JWT。
// /health、/uploads 静态、WebSocket upgrade 均位于 /api 前缀之外，不受影响。
app.use('/api', requireAuth);

// 静态文件服务（上传图片）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 文件上传中间件
const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// 数据库连接池
const dbPool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'smartlens',
  user: process.env.DB_USER || 'admin',
  password: process.env.DB_PASSWORD || 'password'
});

// 测试数据库连接
dbPool.on('connect', () => {
  console.log('[DB] 数据库连接成功');
});

dbPool.on('error', (err) => {
  console.error('[DB] 数据库连接错误:', err);
});

// Agent 实例
const examScanner = new ExamScannerAgent();
const tutorAgent = new TutorAgent(dbPool);
const questionGenerator = new QuestionGeneratorAgent(dbPool);
const planAgent = new PlanAgent(dbPool);

// 会话存储
const sessions = new Map();

// ============ 健康检查 ============
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'smart-lens-ai-backend',
    version: '2.0.0'
  });
});

// ============ 试卷识别 API ============

/**
 * 上传并识别试卷
 * POST /api/exam/upload
 * 支持两种模式:
 *   multipart: FormData(image=file, subject, gradeLevel)
 *   JSON: { imageUrl: string, subject: string, gradeLevel: string }
 */
app.post('/api/exam/upload', upload.single('image'), async (req, res) => {
  try {
    let imageUrl;
    const { subject, gradeLevel } = req.body;

    // 优先使用上传的文件
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    } else if (req.body.imageUrl) {
      // 兼容旧的 JSON 方式（URL 或 Base64）
      imageUrl = req.body.imageUrl;
    } else {
      return res.status(400).json({ error: '缺少图片（请上传文件或提供 imageUrl）' });
    }

    const result = await examScanner.scanExam({ imageUrl, subject, gradeLevel });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('[API] 试卷识别失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * 批量上传并识别试卷 (多页)
 * POST /api/exam/upload-batch
 * multipart: FormData(images=files[], subject, gradeLevel)
 */
app.post('/api/exam/upload-batch', upload.array('images', 10), async (req, res) => {
  try {
    const { subject, gradeLevel } = req.body;
    const imageUrls = req.files?.map(f => `/uploads/${f.filename}`) || [];

    if (imageUrls.length === 0) {
      return res.status(400).json({ error: '��少图片' });
    }

    const result = await examScanner.scanExamBatch({ imageUrls, subject, gradeLevel });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('[API] 批量试卷识别失败:', error);
    res.status(500).json({ error: '服务器错误' });
  }
});

/**
 * 保存试卷记录
 * POST /api/exam/save
 * Body: { studentId, subject, gradeLevel, examType, parsedQuestions }
 */
app.post('/api/exam/save', async (req, res) => {
  const client = await dbPool.connect();

  try {
    const { id, studentId, subject, gradeLevel, examType, parsedQuestions, rawImages, ocrResult } = req.body;

    const examId = id || `exam_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    const result = await client.query(
      `INSERT INTO exams (id, student_id, subject, grade_level, exam_type, raw_images, ocr_result, parsed_questions, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
       RETURNING id`,
      [examId, studentId, subject, gradeLevel, examType || 'manual', JSON.stringify(rawImages), JSON.stringify(ocrResult), JSON.stringify(parsedQuestions)]
    );

    const savedId = result.rows[0]?.id;
    res.json({ examId: savedId, status: 'saved' });
  } catch (error) {
    console.error('[API] 保存试卷失败:', error);
    res.status(500).json({ error: '保存失败' });
  } finally {
    client.release();
  }
});

// ============ 学情分析 API ============

/**
 * 分析试卷并生成学情报告
 * POST /api/analysis/analyze
 * Body: { studentId, examId, questions, studentAnswers, subject, gradeLevel }
 */
app.post('/api/analysis/analyze', async (req, res) => {
  try {
    const { studentId, examId, questions, studentAnswers, subject, gradeLevel } = req.body;

    if (!studentId || !questions) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await tutorAgent.analyzeExam({
      studentId,
      examId,
      questions: questions || [],
      studentAnswers: studentAnswers || [],
      subject: subject || 'math',
      gradeLevel: gradeLevel || '8'
    });

    if (result.success) {
      // 更新试卷状态为已分析
      if (examId) {
        await dbPool.query(
          `UPDATE exams SET status = 'analyzed', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [examId]
        ).catch(e => console.error('[API] 更新试卷状态失败:', e));
      }
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('[API] 学情分析失败:', error);
    res.status(500).json({ error: '分析失败' });
  }
});

/**
 * 获取学情报告
 * GET /api/analysis/report/:studentId
 */
app.get('/api/analysis/report/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { limit = 10 } = req.query;

    const result = await dbPool.query(
      `SELECT ar.*, e.subject, e.grade_level
       FROM analysis_reports ar
       JOIN exams e ON ar.exam_id = e.id
       WHERE ar.student_id = $1
       ORDER BY ar.created_at DESC
       LIMIT $2`,
      [studentId, parseInt(limit)]
    );

    res.json({ reports: result.rows });
  } catch (error) {
    console.error('[API] 获取报告失败:', error);
    res.status(500).json({ error: '获取报告失败' });
  }
});

// ============ 动态出题 API ============

/**
 * 生成练习题
 * POST /api/question/generate
 * Body: { subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, count }
 */
app.post('/api/question/generate', async (req, res) => {
  try {
    const { subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, count } = req.body;

    const result = await questionGenerator.generateQuestions({
      subject: subject || 'math',
      gradeLevel: gradeLevel || 'K8',
      textbookVersion: textbookVersion || '人教版',
      knowledgePoint,
      difficulty: difficulty || 0.5,
      count: count || 1
    });

    if (result.success) {
      res.json({ questions: result.questions || [result] });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('[API] 生成题目失败:', error);
    res.status(500).json({ error: '生成失败', questions: [] });
  }
});

/**
 * 获取题库列表
 * GET /api/question/list
 */
app.get('/api/question/list', async (req, res) => {
  try {
    const { subject, knowledgePoint, limit = 20 } = req.query;

    const result = await dbPool.query(
      `SELECT * FROM questions
       WHERE ($1::text IS NULL OR knowledge_point_id = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [knowledgePoint || null, parseInt(limit)]
    );

    res.json({ questions: result.rows });
  } catch (error) {
    console.error('[API] 获取题库失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// ============ 学习计划 API ============

/**
 * 生成学习计划
 * POST /api/plan/generate
 * Body: { studentId, planType, startDate, endDate }
 */
app.post('/api/plan/generate', async (req, res) => {
  try {
    const { studentId, planType, startDate, endDate } = req.body;

    if (!studentId) {
      return res.status(400).json({ error: '缺少学生 ID' });
    }

    const result = await planAgent.generatePlan({
      studentId,
      planType: planType || 'daily',
      startDate: startDate || new Date().toISOString(),
      endDate
    });

    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('[API] 生成计划失败:', error);
    res.status(500).json({ error: '生成失败' });
  }
});

/**
 * 获取学习计划
 * GET /api/plan/list/:studentId
 */
app.get('/api/plan/list/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { planType } = req.query;

    const query = planType
      ? 'SELECT * FROM learning_plans WHERE student_id = $1 AND plan_type = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM learning_plans WHERE student_id = $1 ORDER BY created_at DESC';

    const result = await dbPool.query(query, planType ? [studentId, planType] : [studentId]);

    res.json({ plans: result.rows });
  } catch (error) {
    console.error('[API] 获取计划失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

/**
 * 更新计划进度
 * POST /api/plan/:planId/progress
 * Body: { completedTaskIds: string[] }
 */
app.post('/api/plan/:planId/progress', async (req, res) => {
  try {
    const { planId } = req.params;
    const { completedTaskIds } = req.body;

    const result = await planAgent.updateProgress(planId, completedTaskIds);
    res.json({ success: true, plan: result });
  } catch (error) {
    console.error('[API] 更新进度失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

/**
 * 获取家长端学习报告
 * GET /api/plan/parent-report/:studentId?planType=weekly
 */
app.get('/api/plan/parent-report/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { planType = 'weekly' } = req.query;

    const result = await planAgent.generateParentReport(studentId, planType);
    res.json(result);
  } catch (error) {
    console.error('[API] 获取家长报告失败:', error);
    res.status(500).json({ error: '获取家长报告失败' });
  }
});

/**
 * 获取计划日历视图数据
 * GET /api/plan/calendar/:studentId?planType=weekly&month=2026-08
 */
app.get('/api/plan/calendar/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { planType = 'weekly', month } = req.query;

    const planResult = await dbPool.query(
      `SELECT plan_type, plan_data, progress, start_date, end_date
       FROM learning_plans
       WHERE student_id = $1 AND plan_type = $2
       ORDER BY created_at DESC
       LIMIT 1`,
      [studentId, planType]
    );

    if (planResult.rows.length === 0) {
      return res.json({ events: [], progress: 0 });
    }

    const plan = planResult.rows[0];
    const events = [];

    if (planType === 'weekly' && plan.plan_data?.weeklyTasks) {
      const startDate = plan.start_date ? new Date(plan.start_date) : new Date();
      plan.plan_data.weeklyTasks.forEach((day, index) => {
        const eventDate = new Date(startDate);
        eventDate.setDate(eventDate.getDate() + index);
        day.tasks.forEach((task, taskIndex) => {
          events.push({
            id: `${plan.id}-${index}-${taskIndex}`,
            title: task.title,
            date: eventDate.toISOString().split('T')[0],
            type: task.type,
            completed: task.completed,
            estimatedTime: task.estimatedTime,
            questionCount: task.questionCount
          });
        });
      });
    } else if (planType === 'monthly' && plan.plan_data?.weeklyFocus) {
      const startDate = plan.start_date ? new Date(plan.start_date) : new Date();
      plan.plan_data.weeklyFocus.forEach((week, index) => {
        const weekStart = new Date(startDate);
        weekStart.setDate(weekStart.getDate() + index * 7);
        events.push({
          id: `${plan.id}-week-${index}`,
          title: `${week.week}: ${week.focusPoint}`,
          date: weekStart.toISOString().split('T')[0],
          type: 'milestone',
          goals: week.goals
        });
      });
    } else if (planType === 'daily' && plan.plan_data?.tasks) {
      const startDate = plan.start_date ? new Date(plan.start_date) : new Date();
      plan.plan_data.tasks.forEach(task => {
        events.push({
          id: `${plan.id}-${task.id}`,
          title: task.title,
          date: startDate.toISOString().split('T')[0],
          type: task.type,
          completed: task.completed,
          estimatedTime: task.estimatedTime
        });
      });
    }

    res.json({ events, progress: plan.progress || 0, planId: plan.id });
  } catch (error) {
    console.error('[API] 获取日历数据失败:', error);
    res.status(500).json({ error: '获取日历数据失败' });
  }
});

/**
 * 创建提醒
 * POST /api/plan/reminder
 * Body: { studentId, planId, type, time, message }
 */
app.post('/api/plan/reminder', async (req, res) => {
  try {
    const { studentId, planId, type, time, message } = req.body;

    const reminderId = `reminder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await dbPool.query(
      `INSERT INTO reminders (id, student_id, plan_id, type, time, message, sent, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, CURRENT_TIMESTAMP)`,
      [reminderId, studentId, planId, type, time, message]
    );

    res.json({ success: true, reminderId });
  } catch (error) {
    console.error('[API] 创建提醒失败:', error);
    res.status(500).json({ error: '创建提醒失败' });
  }
});

/**
 * 获取提醒列表
 * GET /api/plan/reminders/:studentId
 */
app.get('/api/plan/reminders/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const result = await dbPool.query(
      `SELECT * FROM reminders WHERE student_id = $1 ORDER BY time ASC`,
      [studentId]
    );

    res.json({ reminders: result.rows });
  } catch (error) {
    console.error('[API] 获取提醒失败:', error);
    res.status(500).json({ error: '获取提醒失败' });
  }
});

/**
 * 标记提醒已发送
 * PUT /api/plan/reminder/:id/sent
 */
app.put('/api/plan/reminder/:id/sent', async (req, res) => {
  try {
    const { id } = req.params;
    await dbPool.query(`UPDATE reminders SET sent = true, sent_at = CURRENT_TIMESTAMP WHERE id = $1`, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('[API] 标记提醒失败:', error);
    res.status(500).json({ error: '标记提醒失败' });
  }
});

// ============ 学生管理 API ============

/**
 * 创建/更新学生档案
 * POST /api/student
 */
app.post('/api/student', async (req, res) => {
  try {
    const { id, name, grade, textbookVersion, school } = req.body;

    const studentId = id || `student_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO students (id, name, grade, textbook_version, school)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name,
         grade = EXCLUDED.grade,
         textbook_version = EXCLUDED.textbook_version,
         school = EXCLUDED.school,
         updated_at = CURRENT_TIMESTAMP`,
      [studentId, name, grade, textbookVersion, school]
    );

    res.json({ studentId, name, grade });
  } catch (error) {
    console.error('[API] 保存学生信息失败:', error);
    res.status(500).json({ error: '保存失败' });
  }
});

/**
 * 获取学生列表
 * GET /api/student/list
 */
app.get('/api/student/list', async (req, res) => {
  try {
    const result = await dbPool.query('SELECT * FROM students ORDER BY created_at DESC');
    res.json({ students: result.rows });
  } catch (error) {
    console.error('[API] 获取学生列表失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// ============ 错题本 API ============

/**
 * 添加错题
 * POST /api/wrong-question
 */
app.post('/api/wrong-question', async (req, res) => {
  try {
    const { studentId, examId, questionText, questionType, subject, knowledgePoint, studentAnswer, correctAnswer, errorType } = req.body;

    const wrongId = `wrong_${Date.now()}`;

    await dbPool.query(
      `INSERT INTO wrong_questions (id, student_id, exam_id, question_text, question_type, subject, knowledge_point, student_answer, correct_answer, error_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [wrongId, studentId, examId, questionText, questionType, subject, knowledgePoint, studentAnswer, correctAnswer, errorType]
    );

    res.json({ wrongId });
  } catch (error) {
    console.error('[API] 添加错题失败:', error);
    res.status(500).json({ error: '添加失败' });
  }
});

/**
 * 获取学生错题本
 * GET /api/wrong-question/:studentId
 */
app.get('/api/wrong-question/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { reviewed } = req.query;

    const query = reviewed
      ? 'SELECT * FROM wrong_questions WHERE student_id = $1 AND reviewed = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM wrong_questions WHERE student_id = $1 ORDER BY created_at DESC';

    const result = await dbPool.query(query, reviewed ? [studentId, reviewed === 'true'] : [studentId]);

    res.json({ wrongQuestions: result.rows });
  } catch (error) {
    console.error('[API] 获取错题失败:', error);
    res.status(500).json({ error: '获取失败' });
  }
});

// ============ 教学会话 API ============
const aiService = new AIService();
const questionService = new QuestionService(dbPool);

/**
 * 创建教学会话
 * POST /api/session
 * Body: { studentId, knowledgePointId }
 */
app.post('/api/session', async (req, res) => {
  try {
    const { studentId, knowledgePointId } = req.body;

    if (!studentId || !knowledgePointId) {
      return res.status(400).json({ error: '缺少 studentId 或 knowledgePointId' });
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const fsm = new SessionFSM(sessionId, studentId, knowledgePointId, aiService, questionService);
    sessions.set(sessionId, fsm);

    res.json({ sessionId, state: fsm.getState() });
  } catch (error) {
    console.error('[API] 创建会话失败:', error);
    res.status(500).json({ error: '创建会话失败' });
  }
});

/**
 * 获取会话状态
 * GET /api/session/:sessionId
 */
app.get('/api/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const fsm = sessions.get(sessionId);

  if (!fsm) {
    return res.status(404).json({ error: '会话不存在' });
  }

  res.json(fsm.getState());
});

/**
 * 向会话发送消息
 * POST /api/session/:sessionId/message
 * Body: { content: string }
 */
app.post('/api/session/:sessionId/message', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { content } = req.body;
    const fsm = sessions.get(sessionId);

    if (!fsm) {
      return res.status(404).json({ error: '会话不存在' });
    }

    const result = await fsm.handleUserMessage(content);
    res.json(result);
  } catch (error) {
    console.error('[API] 处理消息失败:', error);
    res.status(500).json({ error: '处理消息失败' });
  }
});

/**
 * 获取知识点列表
 * GET /api/knowledge-points
 */
app.get('/api/knowledge-points', async (req, res) => {
  try {
    const result = await dbPool.query(
      'SELECT id, name, subject, grade_level, description, formula, examples, common_mistakes, related_knowledge, mastery FROM knowledge_points ORDER BY subject, grade_level'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('[API] 获取知识点列表失败:', error);
    res.status(500).json({ error: '获取知识点列表失败' });
  }
});

// ============ 知识图谱 API ============

/**
 * 获取知识图谱
 * GET /api/knowledge-graph
 * Query: subject, gradeLevel
 */
app.get('/api/knowledge-graph', async (req, res) => {
  try {
    const { subject = 'math', gradeLevel = '8' } = req.query;

    // 从数据库获取知识点和前置依赖关系
    const pointsResult = await dbPool.query(
      `SELECT id, name, subject, grade_level, description, prerequisites
       FROM knowledge_points
       WHERE subject = $1 AND grade_level = $2
       ORDER BY id`,
      [subject, gradeLevel]
    );

    const nodes = pointsResult.rows.map(p => ({
      id: p.id,
      name: p.name,
      subject: p.subject,
      chapter: '默认章节',
      difficulty: 1,
      description: p.description,
      formula: p.formula || '',
      mastery: p.mastery || 0,
      x: Math.random() * 600 + 100,
      y: Math.random() * 400 + 100
    }));

    // 从 knowledge_points 的 prerequisites 数组构建边
    const edges = [];
    pointsResult.rows.forEach(p => {
      if (p.prerequisites && Array.isArray(p.prerequisites)) {
        p.prerequisites.forEach(preId => {
          edges.push({
            source: preId,
            target: p.id,
            type: 'prerequisite'
          });
        });
      }
    });

    res.json({ nodes, edges });
  } catch (error) {
    console.error('[API] 获取知识图谱失败:', error);
    res.status(500).json({ nodes: [], edges: [], error: '获取知识图谱失败' });
  }
});

// ============ 题库练习 API ============

/**
 * 获取题库列表 (兼容前端 /api/questions)
 * GET /api/questions
 */
app.get('/api/questions', async (req, res) => {
  try {
    const { subject, knowledgePoint, limit = 50, difficulty, type } = req.query;

    let query = `
      SELECT q.*
      FROM questions q
      LEFT JOIN knowledge_points kp ON q.knowledge_point_id = kp.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (subject) {
      params.push(subject);
      query += ` AND kp.subject = $${paramIndex++}`;
    }
    if (knowledgePoint) {
      params.push(knowledgePoint);
      query += ` AND q.knowledge_point_id = $${paramIndex++}`;
    }
    if (difficulty) {
      params.push(difficulty);
      query += ` AND q.difficulty = $${paramIndex++}`;
    }
    if (type) {
      params.push(type);
      query += ` AND q.type = $${paramIndex++}`;
    }

    query += ` ORDER BY q.created_at DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit));

    const result = await dbPool.query(query, params);
    res.json({ questions: result.rows });
  } catch (error) {
    console.error('[API] 获取题库失败:', error);
    res.status(500).json({ error: '获取题库失败', questions: [] });
  }
});

/**
 * 获取题目详情
 * GET /api/questions/:id
 */
app.get('/api/questions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbPool.query('SELECT * FROM questions WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: '题目不存在' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] 获取题目详情失败:', error);
    res.status(500).json({ error: '获取题目详情失败' });
  }
});

/**
 * 生成练习题 (兼容前端 /api/questions POST)
 * POST /api/questions
 */
app.post('/api/questions', async (req, res) => {
  try {
    const { subject, gradeLevel, textbookVersion, knowledgePoint, difficulty, count, type } = req.body;

    const result = await questionGenerator.generateQuestions({
      subject: subject || 'math',
      gradeLevel: gradeLevel || 'K8',
      textbookVersion: textbookVersion || '人教版',
      knowledgePoint,
      difficulty: difficulty || 0.5,
      count: count || 1,
      type
    });

    if (result.success) {
      res.json({ questions: result.questions || [result] });
    } else {
      res.status(500).json({ error: result.error });
    }
  } catch (error) {
    console.error('[API] 生成题目失败:', error);
    res.status(500).json({ error: '生成失败', questions: [] });
  }
});

/**
 * 提交练习答案
 * POST /api/practice/answer
 */
app.post('/api/practice/answer', async (req, res) => {
  try {
    const { sessionId, questionId, answer, isCorrect, timeSpent } = req.body;

    if (!sessionId || !questionId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 记录答题记录
    const answerId = `ans_${Date.now()}`;
    await dbPool.query(
      `INSERT INTO answer_records (id, session_id, question_id, student_answer, is_correct, time_spent_ms)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [answerId, sessionId, questionId, answer, isCorrect, timeSpent || 0]
    );

    // 更新会话进度 (可选：更新 session 表)

    res.json({ success: true, answerId });
  } catch (error) {
    console.error('[API] 提交答案失败:', error);
    res.status(500).json({ error: '提交失败' });
  }
});

/**
 * 获取间隔重复队列
 * GET /api/practice/sr-queue/:studentId
 */
app.get('/api/practice/sr-queue/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const result = await dbPool.query(
      `SELECT sq.*, q.content as question_content, q.answer as question_answer, q.type as question_type
       FROM sr_queue sq
       JOIN questions q ON sq.question_id = q.id
       WHERE sq.student_id = $1
       ORDER BY sq.next_review ASC`,
      [studentId]
    );

    // 格式化返回数据
    const queue = result.rows.map(row => ({
      questionId: row.question_id,
      question: {
        id: row.question_id,
        content: row.question_content,
        answer: row.question_answer,
        type: row.question_type
      },
      lastReviewed: row.last_reviewed,
      interval: row.interval,
      easeFactor: row.ease_factor,
      repetitions: row.repetitions,
      nextReview: row.next_review
    }));

    res.json(queue);
  } catch (error) {
    console.error('[API] 获取间隔重复队列失败:', error);
    res.status(500).json({ error: '获取复习队列失败', queue: [] });
  }
});

// ============ 练习会话历史 API ============

/**
 * 开始练习会话（记录开始）
 * POST /api/practice/session/start
 * Body: { studentId, mode, subject, topicId, questions }
 */
app.post('/api/practice/session/start', async (req, res) => {
  try {
    const { studentId, mode, subject, topicId, questions } = req.body;

    if (!studentId || !mode || !questions) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const sessionId = `prac_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    await dbPool.query(
      `INSERT INTO practice_sessions (id, student_id, mode, subject, topic_id, questions)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sessionId, studentId, mode, subject, topicId, JSON.stringify(questions)]
    );

    res.json({ sessionId });
  } catch (error) {
    console.error('[API] 创建练习会话失败:', error);
    res.status(500).json({ error: '创建会话失败' });
  }
});

/**
 * 完成练习会话（保存结果）
 * POST /api/practice/session/complete
 * Body: { sessionId, studentId, answers, stats, duration }
 */
app.post('/api/practice/session/complete', async (req, res) => {
  try {
    const { sessionId, studentId, answers, stats, duration } = req.body;

    if (!sessionId || !studentId) {
      return res.status(400).json({ error: '缺少 sessionId 或 studentId' });
    }

    await dbPool.query(
      `UPDATE practice_sessions
       SET answers = $1, stats = $2, duration = $3, completed_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND student_id = $5`,
      [JSON.stringify(answers || []), JSON.stringify(stats || {}), duration || 0, sessionId, studentId]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[API] 完成练习会话失败:', error);
    res.status(500).json({ error: '保存会话失败' });
  }
});

/**
 * 获取练习历史
 * GET /api/practice/history/:studentId
 * Query: mode, subject, limit, offset
 */
app.get('/api/practice/history/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { mode, subject, limit = 50, offset = 0 } = req.query;

    let query = `
      SELECT id, mode, subject, topic_id, questions, answers, stats, duration, completed_at
      FROM practice_sessions
      WHERE student_id = $1 AND completed_at IS NOT NULL
    `;
    const params = [studentId];
    let paramIndex = 2;

    if (mode) {
      params.push(mode);
      query += ` AND mode = $${paramIndex++}`;
    }
    if (subject) {
      params.push(subject);
      query += ` AND subject = $${paramIndex++}`;
    }

    query += ` ORDER BY completed_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await dbPool.query(query, params);

    // 格式化返回数据
    const sessions = result.rows.map(row => ({
      id: row.id,
      mode: row.mode,
      subject: row.subject,
      topicId: row.topic_id,
      questions: row.questions || [],
      answers: row.answers || [],
      stats: row.stats || { correct: 0, total: 0, accuracy: 0 },
      duration: row.duration,
      completedAt: row.completed_at
    }));

    res.json({ sessions });
  } catch (error) {
    console.error('[API] 获取练习历史失败:', error);
    res.status(500).json({ error: '获取历史失败', sessions: [] });
  }
});

/**
 * 获取练习统计概览
 * GET /api/practice/stats/:studentId
 */
app.get('/api/practice/stats/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const result = await dbPool.query(
      `SELECT
         COUNT(*) as total_sessions,
         SUM(CASE WHEN completed_at IS NOT NULL THEN 1 ELSE 0 END) as completed_sessions,
         SUM(COALESCE((stats->>'total')::int, 0)) as total_questions,
         SUM(COALESCE((stats->>'correct')::int, 0)) as total_correct,
         SUM(COALESCE(duration, 0)) as total_time
       FROM practice_sessions
       WHERE student_id = $1`,
      [studentId]
    );

    const row = result.rows[0];
    const totalCorrect = parseInt(row.total_correct) || 0;
    const totalQuestions = parseInt(row.total_questions) || 0;
    const avgAccuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

    res.json({
      totalSessions: parseInt(row.total_sessions) || 0,
      completedSessions: parseInt(row.completed_sessions) || 0,
      totalQuestions,
      totalCorrect,
      avgAccuracy,
      totalTime: parseInt(row.total_time) || 0
    });
  } catch (error) {
    console.error('[API] 获取练习统计失败:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

// ============ 用户档案与成就 API ============

/**
 * 获取用户档案
 * GET /api/user/:id/profile
 */
app.get('/api/user/:id/profile', async (req, res) => {
  try {
    const { id } = req.params;

    const studentResult = await dbPool.query('SELECT * FROM students WHERE id = $1', [req.params.id]);
    if (studentResult.rows.length === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const statsResult = await dbPool.query(
      `SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_questions,
        AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) * 100 as correct_rate,
        SUM(time_spent_ms) as total_time
       FROM answer_records
       WHERE student_id = $1`,
      [req.params.id]
    );

    const achievementsResult = await dbPool.query(
      `SELECT * FROM achievements WHERE student_id = $1 ORDER BY unlocked_at DESC`,
      [req.params.id]
    );

    res.json({
      profile: studentResult.rows[0],
      stats: statsResult.rows[0] || { total_sessions: 0, total_questions: 0, correct_rate: 0, total_time: 0 },
      achievements: achievementsResult.rows
    });
  } catch (error) {
    console.error('[API] 获取用户档案失败:', error);
    res.status(500).json({ error: '获取用户档案失败' });
  }
});

/**
 * 更新用户档案
 * PUT /api/user/profile
 */
app.put('/api/user/profile', async (req, res) => {
  try {
    const { id, name, grade, textbookVersion, avatar } = req.body;

    await dbPool.query(
      `UPDATE students SET name = $1, grade = $2, textbook_version = $3, avatar_url = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5`,
      [name, grade, textbookVersion, avatar, req.body.id]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[API] 更新档案失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

/**
 * 获取用户成就
 * GET /api/user/:id/achievements
 */
app.get('/api/user/:id/achievements', async (req, res) => {
  try {
    const result = await dbPool.query(
      'SELECT * FROM achievements WHERE student_id = $1 ORDER BY unlocked_at DESC',
      [req.params.id]
    );
    res.json({ achievements: result.rows });
  } catch (error) {
    console.error('[API] 获取成就失败:', error);
    res.status(500).json({ error: '获取成就失败', achievements: [] });
  }
});

/**
 * 获取用户统计
 * GET /api/user/:id/stats
 */
app.get('/api/user/:id/stats', async (req, res) => {
  try {
    const result = await dbPool.query(
      `SELECT
        COUNT(DISTINCT session_id) as total_sessions,
        COUNT(*) as total_questions,
        ROUND(AVG(CASE WHEN is_correct THEN 1 ELSE 0 END) * 100) as correct_rate,
        SUM(time_spent_ms) as total_time
       FROM answer_records
       WHERE student_id = $1`,
      [req.params.id]
    );
    res.json(result.rows[0] || { total_sessions: 0, total_questions: 0, correct_rate: 0, total_time: 0 });
  } catch (error) {
    console.error('[API] 获取统计失败:', error);
    res.status(500).json({ error: '获取统计失败' });
  }
});

/**
 * 更新用户偏好
 * PUT /api/user/preferences
 */
app.put('/api/user/preferences', async (req, res) => {
  try {
    const { studentId, dailyGoal, reminderTime, preferredSubjects, preferredDifficulty, autoPlayAudio, showHints, showExplanations, pushEnabled, emailEnabled, streakReminder, weeklyReport, achievementAlerts, quietHoursStart, quietHoursEnd, soundEnabled, soundVolume, hapticEnabled, analyticsEnabled, crashReporting, personalizedAds, dataSync, autoLogin, biometricAuth, sessionTimeout } = req.body;

    await dbPool.query(
      `INSERT INTO user_preferences (student_id, daily_goal, reminder_time, preferred_subjects, preferred_difficulty, auto_play_audio, show_hints, show_explanations, push_enabled, email_enabled, streak_reminder, weekly_report, achievement_alerts, quiet_hours_start, quiet_hours_end, sound_enabled, sound_volume, haptic_enabled, analytics_enabled, crash_reporting, personalized_ads, data_sync, auto_login, biometric_auth, session_timeout)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
       ON CONFLICT (student_id) DO UPDATE SET
         daily_goal = EXCLUDED.daily_goal,
         reminder_time = EXCLUDED.reminder_time,
         preferred_subjects = EXCLUDED.preferred_subjects,
         preferred_difficulty = EXCLUDED.preferred_difficulty,
         auto_play_audio = EXCLUDED.auto_play_audio,
         show_hints = EXCLUDED.show_hints,
         show_explanations = EXCLUDED.show_explanations,
         push_enabled = EXCLUDED.push_enabled,
         email_enabled = EXCLUDED.email_enabled,
         streak_reminder = EXCLUDED.streak_reminder,
         weekly_report = EXCLUDED.weekly_report,
         achievement_alerts = EXCLUDED.achievement_alerts,
         quiet_hours_start = EXCLUDED.quiet_hours_start,
         quiet_hours_end = EXCLUDED.quiet_hours_end,
         sound_enabled = EXCLUDED.sound_enabled,
         sound_volume = EXCLUDED.sound_volume,
         haptic_enabled = EXCLUDED.haptic_enabled,
         analytics_enabled = EXCLUDED.analytics_enabled,
         crash_reporting = EXCLUDED.crash_reporting,
         personalized_ads = EXCLUDED.personalized_ads,
         data_sync = EXCLUDED.data_sync,
         auto_login = EXCLUDED.auto_login,
         biometric_auth = EXCLUDED.biometric_auth,
         session_timeout = EXCLUDED.session_timeout,
         updated_at = CURRENT_TIMESTAMP`,
      [studentId, dailyGoal, reminderTime, preferredSubjects, preferredDifficulty, autoPlayAudio, showHints, showExplanations, pushEnabled, emailEnabled, streakReminder, weeklyReport, achievementAlerts, quietHoursStart, quietHoursEnd, soundEnabled, soundVolume, hapticEnabled, analyticsEnabled, crashReporting, personalizedAds, dataSync, autoLogin, biometricAuth, sessionTimeout]
    );

    res.json({ success: true });
  } catch (error) {
    console.error('[API] 更新偏好失败:', error);
    res.status(500).json({ error: '更新失败' });
  }
});

/**
 * 获取用户偏好
 * GET /api/user/preferences/:studentId
 */
app.get('/api/user/preferences/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    const result = await dbPool.query(
      `SELECT * FROM user_preferences WHERE student_id = $1`,
      [studentId]
    );

    if (result.rows.length === 0) {
      // 返回默认值
      return res.json({
        studentId,
        dailyGoal: 15,
        reminderTime: '20:00',
        preferredSubjects: ['math'],
        preferredDifficulty: 'adaptive',
        autoPlayAudio: false,
        showHints: true,
        showExplanations: true,
        pushEnabled: true,
        emailEnabled: false,
        streakReminder: true,
        weeklyReport: true,
        achievementAlerts: true,
        quietHoursStart: '22:00',
        quietHoursEnd: '07:00',
        soundEnabled: true,
        soundVolume: 0.5,
        hapticEnabled: true,
        analyticsEnabled: true,
        crashReporting: true,
        personalizedAds: false,
        dataSync: true,
        autoLogin: true,
        biometricAuth: false,
        sessionTimeout: 30
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('[API] 获取用户偏好失败:', error);
    res.status(500).json({ error: '获取偏好失败' });
  }
});

/**
 * 导出 PDF 学情报告
 * GET /api/report/:studentId/pdf
 */
app.get('/api/report/:studentId/pdf', async (req, res) => {
  try {
    const { studentId } = req.params;

    // 调用 ReportService 生成 PDF（传入 dbPool 以读取真实学情数据）
    const { ReportService } = await import('./modules/report/ReportService.js');
    const reportService = new ReportService(dbPool);
    const stream = await reportService.generatePDFReport(studentId);

    // 设置响应头
    const filename = `学情报告_${studentId}_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    // 将流管道传输到响应
    stream.pipe(res);
  } catch (error) {
    console.error('[API] 导出 PDF 报告失败:', error);
    res.status(500).json({ error: '导出 PDF 失败' });
  }
});

/**
 * SM-2 算法：计算下次复习间隔和 ease factor
 * @param {number} quality - 质量评分 0-5 (5=完全正确, 0=完全错误)
 * @param {number} easeFactor - 当前 ease factor (默认 2.5)
 * @param {number} repetitions - 当前重复次数
 * @param {number} interval - 当前间隔天数
 * @returns {Object} { interval, easeFactor, repetitions }
 */
function calculateSM2(quality, easeFactor = 2.5, repetitions = 0, interval = 0) {
  let newEaseFactor = easeFactor
  let newRepetitions = repetitions
  let newInterval = interval

  // 根据质量调整 ease factor (SM-2 公式)
  newEaseFactor = newEaseFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  newEaseFactor = Math.max(1.3, newEaseFactor) // 最小 1.3

  if (quality >= 3) {
    // 正确回答
    if (newRepetitions === 0) {
      newInterval = 1
    } else if (newRepetitions === 1) {
      newInterval = 6
    } else {
      newInterval = Math.round(newInterval * newEaseFactor)
    }
    newRepetitions += 1
  } else {
    // 错误回答：重置
    newRepetitions = 0
    newInterval = 0 // 当天重新复习
  }

  // 最大间隔限制为 365 天
  newInterval = Math.min(newInterval, 365)

  return {
    interval: newInterval,
    easeFactor: Number(newEaseFactor.toFixed(2)),
    repetitions: newRepetitions
  }
}

/**
 * 将 mastery (0-1) 映射为 SM-2 quality (0-5)
 */
function masteryToQuality(mastery) {
  if (mastery >= 0.9) return 5
  if (mastery >= 0.8) return 5
  if (mastery >= 0.7) return 4
  if (mastery >= 0.6) return 4
  if (mastery >= 0.5) return 3
  if (mastery >= 0.4) return 3
  if (mastery >= 0.3) return 2
  if (mastery >= 0.2) return 2
  if (mastery >= 0.1) return 1
  return 0
}

/**
 * 更新间隔重复队列
 */
async function updateSRQueue(studentId, questionId, mastery) {
  const quality = masteryToQuality(mastery)
  const client = await dbPool.connect()

  try {
    await client.query('BEGIN')

    // 获取当前 sr_queue 记录
    const result = await client.query(
      `SELECT * FROM sr_queue WHERE student_id = $1 AND question_id = $2`,
      [studentId, questionId]
    )

    let easeFactor = 2.5
    let repetitions = 0
    let interval = 0

    if (result.rows.length > 0) {
      const row = result.rows[0]
      easeFactor = row.ease_factor || 2.5
      repetitions = row.repetitions || 0
      interval = row.interval || 0
    }

    // 计算 SM-2
    const sm2 = calculateSM2(quality, easeFactor, repetitions, interval)
    const nextReview = new Date(Date.now() + sm2.interval * 86400000)

    // Upsert 到 sr_queue
    await client.query(
      `INSERT INTO sr_queue (student_id, question_id, last_reviewed, interval, ease_factor, repetitions, next_review)
       VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4, $5, $6)
       ON CONFLICT (student_id, question_id) DO UPDATE SET
         last_reviewed = EXCLUDED.last_reviewed,
         interval = EXCLUDED.interval,
         ease_factor = EXCLUDED.ease_factor,
         repetitions = EXCLUDED.repetitions,
         next_review = EXCLUDED.next_review`,
      [studentId, questionId, sm2.interval, sm2.easeFactor, sm2.repetitions, nextReview]
    )

    await client.query('COMMIT')
    return { success: true, ...sm2, nextReview }
  } catch (error) {
    await client.query('ROLLBACK')
    console.error('[SM2] 更新间隔重复队列失败:', error)
    return { success: false, error: error.message }
  } finally {
    client.release()
  }
}

/**
 * 标记错题已复习
 * POST /api/wrong-question/:id/review
 */
app.post('/api/wrong-question/:id/review', async (req, res) => {
  try {
    const { id } = req.params;
    const { mastery, reviewStatus, studentId } = req.body;

    await dbPool.query(
      `UPDATE wrong_questions SET reviewed = true, mastery = $1, review_status = $2, last_reviewed = CURRENT_TIMESTAMP WHERE id = $3`,
      [mastery || 0.8, reviewStatus || 'mastered', req.params.id]
    );

    // 同时更新间隔重复队列 (SM-2)
    if (studentId) {
      await updateSRQueue(studentId, id, mastery || 0.8)
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[API] 标记复习失败:', error);
    res.status(500).json({ error: '标记失败' });
  }
});

/**
 * 重试错题
 * POST /api/wrong-question/:id/retry
 */
app.post('/api/wrong-question/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;

    // 获取错题详情并创建练习会话
    const result = await dbPool.query('SELECT * FROM wrong_questions WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '错题不存在' });
    }

    const wrongQuestion = result.rows[0];

    // 创建练习会话
    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    // 这里可以集成 SessionFSM

    res.json({
      sessionId,
      question: {
        id: wrongQuestion.id,
        content: wrongQuestion.question_text,
        answer: wrongQuestion.correct_answer,
        type: wrongQuestion.question_type,
        knowledgePoint: wrongQuestion.knowledge_point
      }
    });
  } catch (error) {
    console.error('[API] 重试错题失败:', error);
    res.status(500).json({ error: '重试失败' });
  }
});

/**
 * SM-2 间隔重复更新
 * POST /api/wrong-question/:id/sm2
 * Body: { studentId, mastery }
 */
app.post('/api/wrong-question/:id/sm2', async (req, res) => {
  try {
    const { id } = req.params;
    const { studentId, mastery } = req.body;

    if (!studentId || mastery === undefined) {
      return res.status(400).json({ error: '缺少 studentId 或 mastery' });
    }

    const result = await updateSRQueue(studentId, id, mastery)
    if (result.success) {
      res.json({ success: true, ...result })
    } else {
      res.status(500).json({ error: result.error })
    }
  } catch (error) {
    console.error('[API] SM-2 更新失败:', error);
    res.status(500).json({ error: 'SM-2 更新失败' });
  }
});

// ============ WebSocket 服务 ============
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('[WS] 新连接');

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      const { sessionId, action, payload } = data;

      console.log(`[WS] 收到消息：${action}`, payload);

      // Route through SessionFSM if session exists
      const fsm = sessions.get(sessionId);
      if (fsm) {
        const content = payload?.content || '';
        const result = await fsm.handleUserMessage(content);
        ws.send(JSON.stringify({
          type: 'response',
          sessionId,
          state: fsm.phase,
          ...result
        }));
        return;
      }

      // Fallback ack if no session
      ws.send(JSON.stringify({
        type: 'ack',
        sessionId,
        action
      }));
    } catch (error) {
      console.error('[WS] 消息处理失败:', error);
      ws.send(JSON.stringify({ error: '处理失败' }));
    }
  });

  ws.on('close', () => {
    console.log('[WS] 连接关闭');
  });
});

// ============ 启动服务 ============
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════╗
║   智学慧眼 - AI 学情辅导系统后端服务 (重构版)       ║
║                                                    ║
║   服务已启动                                       ║
║                                                    ║
║   HTTP:     http://localhost:${PORT}                ║
║   WebSocket: ws://localhost:${PORT}/ws             ║
║                                                    ║
║   健康检查：GET /health                            ║
║   试卷上传：POST /api/exam/upload                  ║
║   学情分析：POST /api/analysis/analyze             ║
║   出题接口：POST /api/question/generate            ║
║   学习计划：POST /api/plan/generate                ║
╚════════════════════════════════════════════════════╝
  `);
});

export default app;
