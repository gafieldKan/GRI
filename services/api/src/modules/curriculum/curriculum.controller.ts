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
