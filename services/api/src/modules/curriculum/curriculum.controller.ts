import { Controller, Get, Post, Param, Query, Body, Req, ParseUUIDPipe } from '@nestjs/common';
import { Request } from 'express';
import { CurriculumService } from './curriculum.service';

/** req.auth 载荷的精简断言（与 @gri/jwt-verifier VerifierAuth 对齐） */
interface ReqAuth {
  sub: string;
  externalId: string | null;
  roles: string[];
}

/**
 * curriculum 门面（K12 课程体系，本体驱动）。
 * 鉴权由全局 AuthRouterMiddleware + 白名单（public-routes.ts）决定：
 *   - 目录端点（subjects/grades/textbooks/chapters/knowledge-points）游客可见（公开读）
 *   - knowledge-graph 带个人掌握度（OptionalAuth：无 token 出结构、有 token 叠加 mastery）
 *   - review 审核动作强制鉴权（未入白名单 → 401；管理员校验在 service 内）
 * 注意：'knowledge-points' 字面路径须放 ':id' 之前。
 */
@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly curriculumService: CurriculumService) {}

  private auth(req: Request): ReqAuth | undefined {
    return (req as any).auth as ReqAuth | undefined;
  }

  @Get('subjects')
  listSubjects() {
    return this.curriculumService.listSubjects();
  }

  @Get('grades')
  listGrades(@Query('stage') stage?: string) {
    return this.curriculumService.listGrades(stage);
  }

  @Get('textbooks')
  listTextbooks(@Query('subject') subject?: string, @Query('grade') grade?: string) {
    return this.curriculumService.listTextbooks(subject, grade);
  }

  @Get('chapters')
  listChapters(@Query('textbookId') textbookId?: string, @Query('textbook') textbook?: string) {
    return this.curriculumService.listChapters(textbookId, textbook);
  }

  @Get('knowledge-points')
  listKnowledgePoints(
    @Query('subject') subject?: string,
    @Query('gradeLevel') gradeLevel?: string,
    @Query('chapterId') chapterId?: string,
  ) {
    return this.curriculumService.listKnowledgePoints(
      subject,
      gradeLevel ? parseInt(gradeLevel, 10) : undefined,
      chapterId,
    );
  }

  @Get('knowledge-graph')
  knowledgeGraph(
    @Query('subject') subject?: string,
    @Query('gradeLevel') gradeLevel?: string,
    @Req() req?: Request,
  ) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.knowledgeGraph(
      subject,
      gradeLevel ? parseInt(gradeLevel, 10) : undefined,
      externalId,
    );
  }

  /**
   * 学科知识版图（登峰视图数据源）：领域→知识域两级树 + 前置 DAG + 覆盖比重。
   * OptionalAuth：匿名出结构、登录叠加各知识域掌握度均值。subject 必填（math/chn/eng/phys/chem/bio）。
   */
  @Get('knowledge-map')
  knowledgeMap(@Query('subject') subject: string, @Req() req?: Request) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.knowledgeMap(subject, externalId);
  }

  /**
   * 维度 A：学科知识体系分支树。匿名出结构，登录叠加分支子树掌握度。
   */
  @Get('summit-branches')
  summitBranches(@Query('subject') subject: string, @Req() req?: Request) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.summitBranches(subject, externalId);
  }

  /**
   * 维度 B：K12 学段→年级→人教版册/章。匿名出结构，登录叠加掌握度。
   */
  @Get('summit-grades')
  summitGrades(@Query('subject') subject: string, @Req() req?: Request) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.summitGrades(subject, externalId);
  }

  /**
   * 学习路径（目标驱动）：goalId 的全先修闭包，拓扑序去重（先修在前）。
   * OptionalAuth：匿名出结构、登录叠加各步骤掌握度。goalId 非法 → 400。
   */
  @Get('learning-path')
  learningPath(@Query('goalId', new ParseUUIDPipe()) goalId: string, @Req() req?: Request) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.learningPath(goalId, externalId);
  }

  /**
   * W5-a 学习链：subject 必填，branch 或 grade 至少一个作规模限定。
   * OptionalAuth：匿名只出结构与 edge kind，登录叠加 mastery；anonymous 不含 mastery 字段。
   */
  @Get('learning-chain')
  learningChain(
    @Query('subject') subject?: string,
    @Query('branch') branch?: string,
    @Query('grade') grade?: string,
    @Req() req?: Request,
  ) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.learningChain(subject, branch, grade, externalId);
  }

  /** W5-a 洞窟聚合：公开题入口/前置/下一节，登录叠加掌握度、错题、到期复习与成就。 */
  @Get('kp-cave')
  kpCave(@Query('kpId') kpId?: string, @Req() req?: Request) {
    const externalId = req ? this.auth(req)?.externalId ?? undefined : undefined;
    return this.curriculumService.kpCave(kpId, externalId);
  }

  /** 知识点随堂练习（选择题含答案/解析，公开读）。须置于 knowledge-points/:id 之前。 */
  @Get('knowledge-points/:id/questions')
  knowledgePointQuestions(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('limit') limit?: string,
  ) {
    return this.curriculumService.knowledgePointQuestions(id, limit ? parseInt(limit, 10) : 5);
  }

  @Get('knowledge-points/:id')
  async getKnowledgePoint(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.curriculumService.getKnowledgePoint(id);
  }

  @Post('knowledge-points/:id/review')
  reviewKnowledgePoint(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() body: { action?: 'approve' | 'reject' | 'publish' | 'archive' },
  ) {
    return this.curriculumService.reviewKnowledgePoint(id, body?.action ?? 'approve');
  }
}
