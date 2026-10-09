import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Req,
  Param,
  UploadedFile,
  UseInterceptors,
  ParseUUIDPipe,
  ForbiddenException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TuitionService } from './tuition.service';
import { Request } from 'express';

/**
 * 学情统一门面（M5 AI 垂直：web-ai-tutor + mini-program-ai-tutor 收敛到 /api）。
 *
 * 鉴权：全局 AuthRouterMiddleware 白名单见 src/auth/public-routes.ts ——
 *   仅题目库公开读；其余一律强制鉴权，身份=req.auth.externalId。
 * 知识点/图谱端点已退役：K12 全学科由 /api/curriculum/*（本体驱动门面）承接。
 * 所有权：个人 handler 以 externalId 为真源；:studentId/:examId/:sessionId/:planId
 *   参数仅作越权校验（不一致 → 403），彻底消除遗留「鉴权只看 gate 不看归属」的 IDOR。
 *
 * 命名空间统一 /api/tuition/*（全局前缀 api）。签字：State=phase 兼容双前端聊天。
 */
@Controller('tuition')
export class TuitionController {
  constructor(private readonly tuitionService: TuitionService) {}

  private userId(req: Request): string {
    return (req as any).auth.externalId as string;
  }

  /** 越权校验：参数里的 :studentId 若存在且不等于请求者 externalId → 403。 */
  private assertOwner(req: Request, studentId?: string): string {
    const uid = this.userId(req);
    if (studentId && studentId !== uid) throw new ForbiddenException('无权访问他人数据');
    return uid;
  }

  // ===================== 题目 =====================

  @Get('questions')
  getQuestionBank(@Req() req: Request, @Body() _?: unknown) {
    const query = (req as any).query || {};
    return this.tuitionService.getQuestionBank({
      subject: query.subject,
      knowledgePoint: query.knowledgePoint ?? query.knowledge_point,
      chapterId: query.chapterId ?? query.chapter_id,
      limit: query.limit ? Number(query.limit) : 20,
    });
  }

  @Get('questions/:id')
  getQuestionDetail(@Param('id') id: string) {
    return this.tuitionService.getQuestionDetail(id);
  }

  @Post('questions/generate')
  generateQuestions(@Req() req: Request, @Body() body: any) {
    return this.tuitionService.generateQuestions(this.userId(req), body);
  }

  // ===================== 教学会话（持久化 FSM） =====================

  @Post('sessions')
  createSession(@Req() req: Request, @Body() body: { knowledgePointId?: string; studentId?: string }) {
    const uid = this.userId(req);
    return this.tuitionService.createSession(uid, body.knowledgePointId || 'math_pythagorean');
  }

  @Get('sessions/:sessionId')
  getSessionState(@Req() req: Request, @Param('sessionId') sessionId: string) {
    return this.tuitionService.getSessionState(this.userId(req), sessionId);
  }

  @Post('sessions/:sessionId/message')
  sendMessage(@Req() req: Request, @Param('sessionId') sessionId: string, @Body() body: { content?: string }) {
    return this.tuitionService.sendSessionMessage(this.userId(req), sessionId, body.content ?? '');
  }

  @Post('sessions/start')
  startSession(@Req() req: Request) {
    return this.tuitionService.startSession(this.userId(req));
  }

  // ===================== 错题本（个人私有） =====================

  @Get('wrong-questions')
  async getWrongQuestions(@Req() req: Request) {
    const rows = await this.tuitionService.getWrongQuestions(this.userId(req));
    return { wrongQuestions: rows };
  }

  @Put('wrong-questions/:id/resolve')
  async resolveQuestion(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    await this.tuitionService.markQuestionResolved(this.userId(req), id);
    return { success: true };
  }

  @Post('wrong-questions/:id/review')
  reviewQuestion(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string, @Body() body: { mastery?: number; reviewStatus?: string }) {
    return this.tuitionService.reviewWrongQuestion(this.userId(req), id, Number(body.mastery ?? 0.8), body.reviewStatus || 'mastered');
  }

  @Post('wrong-questions/:id/retry')
  async retryQuestion(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    const uid = this.userId(req);
    const rows = await this.tuitionService.getWrongQuestions(uid);
    const q = rows.find((r: any) => r.id === id);
    if (!q) throw new ForbiddenException('错题不存在或无权访问');
    return { success: true, question: q };
  }

  // ===================== 学习计划（个人私有） =====================

  @Get('plans')
  getPlans(@Req() req: Request) {
    return this.tuitionService.getLearningPlans(this.userId(req));
  }

  @Post('plans')
  createPlan(@Req() req: Request, @Body() body: { title: string; start_date?: string; end_date?: string }) {
    return this.tuitionService.createLearningPlan(this.userId(req), body);
  }

  @Post('plans/generate')
  generatePlan(@Req() req: Request, @Body() body: { planType?: string; startDate?: string; endDate?: string; subjects?: string[] }) {
    return this.tuitionService.generatePlan(this.userId(req), body);
  }

  @Post('plans/:planId/progress')
  updatePlanProgress(@Req() req: Request, @Param('planId', new ParseUUIDPipe()) planId: string, @Body() body: { completedTaskIds?: string[] }) {
    return this.tuitionService.updatePlanProgress(this.userId(req), planId, body.completedTaskIds || []);
  }

  @Get('plans/parent-report/:studentId')
  getParentReport(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.getParentReport(uid);
  }

  @Get('plans/calendar/:studentId')
  async getPlanCalendar(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    const plans = await this.tuitionService.getLearningPlans(uid);
    const events = plans.map((p: any) => ({ date: p.start_date, planId: p.id, title: p.title, progress: p.progress, completed: Number(p.progress || 0) >= 100 }));
    return { events, progress: plans.length ? Math.round(plans.reduce((s: number, p: any) => s + (Number(p.progress) || 0), 0) / plans.length) : 0 };
  }

  // ===================== 练习会话（个人私有） =====================

  @Post('practice/session/start')
  startPractice(@Req() req: Request, @Body() body: { mode?: string; subject?: string; topicId?: string; questions?: unknown[] }) {
    return this.tuitionService.startPracticeSession(this.userId(req), body || {});
  }

  @Post('practice/session/complete')
  completePractice(@Req() req: Request, @Body() body: { sessionId?: string; answers?: unknown[]; stats?: unknown; duration?: number; score?: number }) {
    if (!body.sessionId) throw new ForbiddenException('缺少练习会话 ID');
    return this.tuitionService.completePracticeSession(this.userId(req), body.sessionId, body);
  }

  @Get('practice/history/:studentId')
  async getPracticeHistory(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return { sessions: await this.tuitionService.getPracticeHistory(uid) };
  }

  @Get('practice/stats/:studentId')
  getPracticeStats(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.computeStats(uid);
  }

  @Get('practice/sr-queue/:studentId')
  getSrQueue(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.getSpacedRepetitionQueue(uid);
  }

  @Get('practice/weakness/:studentId')
  async getWeakness(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    const limit = (req as any).query?.limit ? Number((req as any).query.limit) : 15;
    return { questions: await this.tuitionService.getWeaknessQuestions(uid, limit) };
  }

  @Post('practice/answer')
  submitAnswer(@Req() req: Request, @Body() body: { questionId: string; answer: string; sessionId?: string; timeSpentMs?: number; isCorrect?: boolean; studentId?: string }) {
    this.assertOwner(req, body.studentId);
    return this.tuitionService.submitPracticeAnswer(this.userId(req), body);
  }

  // ===================== 试卷识别与学情分析（个人私有） =====================

  @Post('exam/upload')
  @UseInterceptors(FileInterceptor('image'))
  async uploadExam(@Req() req: Request, @UploadedFile() file: Express.Multer.File, @Body() form: any) {
    const uid = this.userId(req);
    if (!file?.buffer) return { success: false, error: '未收到图片' };
    const dataUrl = `data:${file.mimetype || 'image/jpeg'};base64,${file.buffer.toString('base64')}`;
    const result = await this.tuitionService.analyzeExam(uid, { imageDataUrl: dataUrl, subject: form.subject || 'math', gradeLevel: form.gradeLevel || '8' });
    return result;
  }

  @Post('exam/save')
  saveExam(@Req() req: Request, @Body() body: any) {
    return this.tuitionService.saveExam(this.userId(req), body);
  }

  @Post('exam/analyze')
  analyzeExam(@Req() req: Request, @Body() body: { text?: string; subject?: string; gradeLevel?: string; answers?: string[]; meta?: any }) {
    return this.tuitionService.analyzeExam(this.userId(req), { text: body.text ?? '', subject: body.subject, gradeLevel: body.gradeLevel, answers: body.answers, meta: body.meta });
  }

  @Post('analysis/analyze')
  analysisAnalyze(@Req() req: Request, @Body() body: { text?: string; subject?: string; gradeLevel?: string; answers?: string[]; meta?: any; imageDataUrl?: string }) {
    return this.tuitionService.analyzeExam(this.userId(req), { text: body.text ?? '', imageDataUrl: body.imageDataUrl, subject: body.subject, gradeLevel: body.gradeLevel, answers: body.answers, meta: body.meta });
  }

  @Get('analysis/report/:examId')
  getAnalysisReport(@Req() req: Request, @Param('examId', new ParseUUIDPipe()) examId: string) {
    return this.tuitionService.getAnalysisReport(this.userId(req), examId);
  }

  @Get('analysis/report/latest/:studentId')
  getLatestReport(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.getLatestReport(uid);
  }

  // ===================== 用户画像（个人私有） =====================

  @Get('user/profile')
  getUserProfile(@Req() req: Request) {
    return this.tuitionService.getUserProfile(this.userId(req));
  }

  @Post('user/profile')
  updateProfile(@Req() req: Request, @Body() body: any) {
    return this.tuitionService.updateUserProfile(this.userId(req), body);
  }

  @Get('user/preferences/:studentId')
  getUserPreferences(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.getUserPreferences(uid);
  }

  @Get('user/preferences')
  getUserPreferencesSelf(@Req() req: Request) {
    return this.tuitionService.getUserPreferences(this.userId(req));
  }

  @Post('user/preferences')
  updatePreferences(@Req() req: Request, @Body() body: any) {
    return this.tuitionService.updateUserPreferences(this.userId(req), body);
  }

  @Get('user/:studentId/achievements')
  getAchievements(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.getAchievements(uid);
  }

  @Get('user/:studentId/stats')
  getUserStats(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.assertOwner(req, studentId);
    return this.tuitionService.computeStats(uid);
  }

  // ===================== 学习提醒（个人私有） =====================

  @Get('reminders')
  getReminders(@Req() req: Request) {
    return this.tuitionService.getReminders(this.userId(req));
  }

  @Post('reminders')
  createReminder(@Req() req: Request, @Body() body: { type?: string; time?: string; message?: string }) {
    return this.tuitionService.createReminder(this.userId(req), body);
  }

  @Put('reminders/:id/sent')
  markReminderSent(@Req() req: Request, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.tuitionService.markReminderSent(this.userId(req), id);
  }
}