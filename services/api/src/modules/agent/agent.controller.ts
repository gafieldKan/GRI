import { Controller, Get, Post, Body, Req, Param, Query, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { AgentService } from './agent.service';

/**
 * 个人 AI 教师门面 —— /api/agent/*。
 *
 * 所有权铁律：一律以 req.auth.externalId 为真源（=用户自建 agent 实体）。
 *   :studentId 参数仅作越权校验：若存在且 ≠ externalId → 404，杜绝跨学生访问独立 agent。
 * 全局鉴权默认强制（public-routes 不放 agent 写面）。
 */
@Controller('agent')
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  private externalId(req: Request): string {
    return (req as any).auth.externalId as string;
  }

  private owner(req: Request, studentId?: string): string {
    const uid = this.externalId(req);
    this.agentService.assertSelf(studentId ?? '', uid);
    return uid;
  }

  /** 打开我的独立 AI 教师（建实体 + 返回工具/技能/记忆）。GET /api/agent/me */
  @Get('me')
  me(@Req() req: Request) {
    return this.agentService.openSession(this.externalId(req));
  }

  /** 发消息给我的 AI 教师。POST /api/agent/me/message   或  /api/agent/message */
  @Post('me/message')
  messageMe(@Req() req: Request, @Body() body: { content?: string; routeKey?: string }) {
    return this.agentService.sendMessage(this.externalId(req), body.content ?? '', { routeKey: body.routeKey });
  }

  /** 把个性化学习计划的一条任务标记为完成(复用 plan.complete 工具逻辑,不绕 LLM)。POST /api/agent/me/plans/:planId/complete */
  @Post('me/plans/:planId/complete')
  completePlanTask(@Req() req: Request, @Param('planId') planId: string, @Body() body: { taskIndex?: number; correct?: boolean }) {
    return this.agentService.completePlanTask(this.externalId(req), planId, Number(body.taskIndex), body.correct ?? true);
  }

  /** 只读学情总览(复用 diagnosis.state)。GET /api/agent/me/diagnosis */
  @Get('me/diagnosis')
  meDiagnosis(@Req() req: Request) {
    return this.agentService.diagnosisOverview(this.externalId(req));
  }

  /** 掌握度趋势（按天累计作答,判断进步/退步）。GET /api/agent/me/mastery-trend */
  @Get('me/mastery-trend')
  meMasteryTrend(@Req() req: Request) {
    return this.agentService.masteryTrend(this.externalId(req));
  }

  /** 只读错题本(复用 wrong.list,不泄正确答案)。GET /api/agent/me/wrong-questions?limit=10 */
  @Get('me/wrong-questions')
  meWrongQuestions(@Req() req: Request, @Query('limit') limit?: string) {
    return this.agentService.wrongBook(this.externalId(req), Number(limit) || 10);
  }

  /** 只读复习序列预览(复用 review.sequence)。GET /api/agent/me/review-sequence?size=5 */
  @Get('me/review-sequence')
  meReviewSequence(@Req() req: Request, @Query('size') size?: string) {
    return this.agentService.reviewPreview(this.externalId(req), Number(size) || 5);
  }

  /** 按知识点抽题(专项练习,仅题面不含答案)。GET /api/agent/me/kp-questions?kpId=<uuid>&size=N */
  @Get('me/kp-questions')
  meKpQuestions(@Req() req: Request, @Query('kpId') kpId?: string, @Query('size') size?: string) {
    return this.agentService.kpQuestions(this.externalId(req), kpId ?? '', Number(size) || 5);
  }

  /** 授课状态机(lesson.current,不绕 LLM,状态存该生记忆续课)。GET /api/agent/me/lesson?kpId=<uuid>&stage=teach */
  @Get('me/lesson')
  meLesson(@Req() req: Request, @Query('kpId') kpId?: string, @Query('stage') stage?: string) {
    return this.agentService.lessonProgress(this.externalId(req), kpId ?? '', stage);
  }

  /** 提交授课抢时段作答(lesson.submit,判题落库+回授掌握度+状态机推进)。POST /api/agent/me/lesson/submit */
  @Post('me/lesson/submit')
  meLessonSubmit(@Req() req: Request, @Body() body: { kpId?: string; questionId?: string; answer?: string }) {
    return this.agentService.lessonSubmit(this.externalId(req), body.kpId ?? '', body.questionId ?? '', body.answer ?? '');
  }

  /** 面板作答判读(复用 answer.grade,答对可消错题)。POST /api/agent/me/grade */
  @Post('me/grade')
  meGrade(@Req() req: Request, @Body() body: { questionId?: string; answer?: string; resolveOnCorrect?: boolean; timeSpentMs?: number }) {
    return this.agentService.gradeAnswer(this.externalId(req), body.questionId ?? '', body.answer ?? '', body.resolveOnCorrect ?? true, body.timeSpentMs);
  }

  @Post('message')
  message(@Req() req: Request, @Body() body: { content?: string; routeKey?: string; studentId?: string }) {
    const uid = this.owner(req, body.studentId);
    return this.agentService.sendMessage(uid, body.content ?? '', { routeKey: body.routeKey });
  }

  /** 读我的长期记忆（个人私有）。GET /api/agent/memory/:studentId 或 /api/agent/memory */
  @Get('memory/:studentId')
  memoryFor(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.owner(req, studentId);
    return this.agentService.listMemory(uid);
  }

  @Get('memory')
  memory(@Req() req: Request) {
    return this.agentService.listMemory(this.externalId(req));
  }

  /** 忘掉一条长期记忆（面板显式管理，复用 memory.forget 工具逻辑,不经 LLM）。POST /api/agent/me/memory/forget */
  @Post('me/memory/forget')
  meMemoryForget(@Req() req: Request, @Body() body: { key?: string }) {
    return this.agentService.forgetMemory(this.externalId(req), body.key ?? '');
  }

  /** 我是本人时打开自己的 agent；他人才 404。GET /api/agent/:studentId */
  @Get(':studentId')
  forceOwner(@Req() req: Request, @Param('studentId') studentId: string) {
    const uid = this.owner(req, studentId);
    return this.agentService.openSession(uid);
  }
}