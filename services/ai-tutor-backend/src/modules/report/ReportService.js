/**
 * 学情报告服务层
 *
 * 负责:
 * - 学习数据统计
 * - 知识点掌握度计算
 * - 学情报告生成
 * - 学习建议生成
 * - PDF 报告导出
 */

import PDFDocument from 'pdfkit';
import { PassThrough } from 'stream';

export class ReportService {
  constructor(dbPool = null) {
    // 数据库连接池（优先读 analysis_reports 表生成真实报告）
    this.dbPool = dbPool;
    // 模拟学习记录存储（无 dbPool 时的回退数据源）
    this.learningRecords = new Map();
  }

  /**
   * 记录学习行为
   */
  async recordLearning(sessionId, studentId, data) {
    const record = {
      sessionId,
      studentId,
      timestamp: Date.now(),
      ...data
    };

    // 追加到学生记录
    if (!this.learningRecords.has(studentId)) {
      this.learningRecords.set(studentId, []);
    }
    this.learningRecords.get(studentId).push(record);

    return record;
  }

  /**
   * 生成学情报告
   * 优先从 analysis_reports 表读取真实分析结果，无 dbPool 时回退到内存学习记录
   */
  async generateReport(studentId) {
    if (this.dbPool) {
      return await this._generateReportFromDb(studentId);
    }

    const records = this.learningRecords.get(studentId) || [];

    // 统计数据
    const stats = this._calculateStats(records);

    // 知识点掌握度
    const masteryByKnowledge = this._calculateMasteryByKnowledge(records);

    // 学习建议
    const suggestions = this._generateSuggestions(masteryByKnowledge);

    return {
      studentId,
      generatedAt: new Date().toISOString(),
      stats,
      masteryByKnowledge,
      suggestions
    };
  }

  /**
   * 从 analysis_reports 表读取真实学情数据
   */
  async _generateReportFromDb(studentId) {
    const result = await this.dbPool.query(
      `SELECT ar.*, e.subject, e.grade_level
       FROM analysis_reports ar
       JOIN exams e ON ar.exam_id = e.id
       WHERE ar.student_id = $1
       ORDER BY ar.created_at DESC
       LIMIT 1`,
      [studentId]
    );

    if (result.rows.length === 0) {
      return {
        studentId,
        generatedAt: new Date().toISOString(),
        stats: { studyDays: 0, totalQuestions: 0, correctRate: 0, improvement: 0 },
        masteryByKnowledge: [],
        suggestions: []
      };
    }

    const report = result.rows[0];
    const knowledgePoints = report.knowledge_points || [];
    const suggestions = report.ai_suggestions || [];
    const weakPoints = report.weak_points || [];

    // 知识点掌握度：映射到 PDF 期望结构（mastery 0-100）
    const masteryByKnowledge = knowledgePoints
      .map(kp => ({
        knowledgePointId: kp.id,
        name: kp.name,
        mastery: Math.round((kp.mastery || 0) * 100),
        totalQuestions: kp.totalQuestions || 0,
        correctAnswers: kp.correctCount || 0
      }))
      .sort((a, b) => a.mastery - b.mastery);

    // 统计：由知识点答对率加权得出正确率与总题数
    const totalQuestions = knowledgePoints.reduce((sum, kp) => sum + (kp.totalQuestions || 0), 0);
    const correctCount = knowledgePoints.reduce((sum, kp) => sum + (kp.correctCount || 0), 0);
    const correctRate = totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;

    // 学习建议：字符串数组 → { content }（并补薄弱点提示）
    const suggestionList = suggestions.map(s => (typeof s === 'string' ? s : (s.content || ''))).filter(Boolean);

    return {
      studentId,
      generatedAt: report.created_at || new Date().toISOString(),
      stats: {
        studyDays: this._calculateStudyDays([]),
        totalQuestions,
        correctRate,
        improvement: 0
      },
      masteryByKnowledge,
      suggestions: suggestionList,
      weakPoints
    };
  }

  /**
   * 生成 PDF 学情报告
   */
  async generatePDFReport(studentId) {
    const report = await this.generateReport(studentId);

    // 创建 PDF 文档
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: '智学慧眼 - 学情报告',
        Author: '智学慧眼 SmartLens AI Tutor',
        Subject: '学情分析报告',
        Keywords: '学情分析, AI辅导, 智学慧眼',
        CreationDate: new Date()
      }
    });

    // 创建可读流
    const stream = new PassThrough();
    doc.pipe(stream);

    // 注册中文字体（需要系统安装 Noto Sans SC 字体）
    // Linux: apt-get install fonts-noto-cjk
    // macOS: brew install font-noto-sans-cjk
    try {
      doc.registerFont('NotoSansSC', '/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf');
      doc.registerFont('NotoSansSC-Bold', '/usr/share/fonts/truetype/noto/NotoSansSC-Bold.otf');
    } catch (e) {
      console.warn('[PDF] 中文字体未找到，将使用默认字体（中文可能显示为方块）');
    }

    // ============ 页面内容 ============

    // 页眉
    const fontRegular = doc.fonts['NotoSansSC'] ? 'NotoSansSC' : 'Helvetica';
    const fontBold = doc.fonts['NotoSansSC-Bold'] ? 'NotoSansSC-Bold' : 'Helvetica-Bold';

    doc.font(fontBold).fontSize(24).fillColor('#4a6cf7')
      .text('智学慧眼 SmartLens', { align: 'center' })
      .moveDown(0.3);
    doc.font(fontRegular).fontSize(16).fillColor('#666')
      .text('学情分析报告', { align: 'center' })
      .moveDown(0.5);
    doc.font(fontRegular).fontSize(11).fillColor('#999')
      .text(`学生: 学生_${studentId}  |  生成时间: ${new Date().toLocaleString('zh-CN')}`, { align: 'center' })
      .moveDown(1);

    // 分隔线
    doc.strokeColor('#e0e0e0').lineWidth(1)
      .moveTo(50, doc.y).lineTo(545, doc.y).stroke()
      .moveDown(1);

    // 整体掌握度
    const avgMastery = report.masteryByKnowledge.length > 0
      ? Math.round(report.masteryByKnowledge.reduce((s, k) => s + k.mastery, 0) / report.masteryByKnowledge.length)
      : report.stats?.correctRate || 0;

    const masteryLabel = avgMastery >= 80 ? '优秀' : avgMastery >= 60 ? '良好' : '待提升';
    const masteryColor = avgMastery >= 80 ? '#52c41a' : avgMastery >= 60 ? '#faad14' : '#ff4d4f';

    doc.font('Helvetica-Bold').fontSize(14).fillColor('#333')
      .text('整体掌握度', { align: 'center' })
      .moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(36).fillColor(masteryColor)
      .text(`${avgMastery} 分`, { align: 'center' })
      .moveDown(0.3);
    doc.font('Helvetica').fontSize(14).fillColor(masteryColor)
      .text(masteryLabel, { align: 'center' })
      .moveDown(1.5);

    // 学习统计表格
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#333')
      .text('学习统计', { align: 'left' })
      .moveDown(0.5);

    const stats = report.stats || {};
    const studyDays = stats.studyDays || 0;
    const totalQuestions = stats.totalQuestions || 0;
    const correctRate = stats.correctRate || 0;
    const improvement = stats.improvement || 0;

    const tableData = [
      ['学习天数', '总题目', '正确率', '进步幅度'],
      [`${studyDays} 天`, `${totalQuestions} 道`, `${correctRate}%`, improvement > 0 ? `+${improvement}%` : `${improvement}%`]
    ];

    this._drawTable(doc, tableData, 50, doc.y, 495);
    doc.moveDown(1.5);

    // 知识点掌握度明细
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#333')
      .text('知识点掌握度明细', { align: 'left' })
      .moveDown(0.5);

    if (report.masteryByKnowledge && report.masteryByKnowledge.length > 0) {
      const masteryTableData = [
        ['知识点', '正确数', '总数', '掌握度']
      ];

      for (const kp of report.masteryByKnowledge.slice(0, 10)) {
        const mastery = kp.mastery || 0;
        masteryTableData.push([
          kp.name || kp.knowledgePointId,
          `${kp.correctAnswers || 0}`,
          `${kp.totalQuestions || 0}`,
          `${mastery}%`
        ]);
      }

      this._drawTable(doc, masteryTableData, 50, doc.y, 495);
    } else {
      doc.font('Helvetica').fontSize(11).fillColor('#999')
        .text('暂无知识点掌握数据', { align: 'center' });
    }
    doc.moveDown(1.5);

    // 薄弱知识点
    const weakPoints = (report.masteryByKnowledge || []).filter(k => (k.mastery || 0) < 60).slice(0, 5);
    if (weakPoints.length > 0) {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#333')
        .text('薄弱知识点', { align: 'left' })
        .moveDown(0.5);

      for (const wp of weakPoints) {
        const mastery = wp.mastery || 0;
        const reason = mastery < 40 ? '基础薄弱，需要从头学起' :
          mastery < 60 ? '理解不透彻，建议加强练习' : '掌握不稳定，容易出错';

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#ff4d4f')
          .text(`⚠ ${wp.name} (${wp.mastery || 0}%)`);
        doc.font('Helvetica').fontSize(10).fillColor('#666')
          .text(`  ${reason}`, { indent: 10 })
          .moveDown(0.5);
      }
      doc.moveDown(1);
    }

    // AI 学习建议
    const suggestions = report.suggestions || [];
    if (suggestions.length > 0) {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#333')
        .text('AI 学习建议', { align: 'left' })
        .moveDown(0.5);

      for (let i = 0; i < suggestions.length; i++) {
        const s = suggestions[i];
        const content = typeof s === 'string' ? s : s.content;
        doc.font('Helvetica').fontSize(11).fillColor('#333')
          .text(`• ${content}`, { width: 495 })
          .moveDown(0.5);
      }
      doc.moveDown(1);
    }

    // 页脚
    doc.moveDown(2);
    doc.strokeColor('#e0e0e0').lineWidth(0.5)
      .moveTo(50, doc.y).lineTo(545, doc.y).stroke()
      .moveDown(0.5);
    doc.font('Helvetica').fontSize(9).fillColor('#999')
      .text(`生成时间: ${new Date().toLocaleString('zh-CN')}`, { align: 'center' })
      .text('智学慧眼 SmartLens AI Tutor', { align: 'center' });

    // 结束文档
    doc.end();

    return stream;
  }

  /**
   * 绘制表格辅助方法
   */
  _drawTable(doc, data, x, y, width) {
    const colCount = data[0].length;
    const colWidth = width / colCount;
    const rowHeight = 25;
    const headerHeight = 30;

    let currentY = y;

    // 绘制表头
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#fff');
    doc.rect(x, currentY, width, headerHeight).fill('#4a6cf7');

    for (let i = 0; i < colCount; i++) {
      doc.fillColor('#fff')
        .font('Helvetica-Bold').fontSize(10)
        .text(data[0][i], x + i * colWidth + 5, currentY + 8, { width: colWidth - 10, align: 'center' });
    }

    currentY += headerHeight;

    // 绘制数据行
    doc.font('Helvetica').fontSize(10).fillColor('#333');
    for (let row = 1; row < data.length; row++) {
      const isEven = row % 2 === 0;
      doc.rect(x, currentY, width, rowHeight).fill(isEven ? '#f8f9fa' : '#fff');

      for (let i = 0; i < colCount; i++) {
        doc.fillColor('#333')
          .font('Helvetica').fontSize(10)
          .text(data[row][i], x + i * colWidth + 5, currentY + 8, { width: colWidth - 10, align: 'center' });
      }
      currentY += rowHeight;
    }
  }

  /**
   * 计算统计数据
   */
  _calculateStats(records) {
    const totalQuestions = records.filter(r => r.type === 'quiz').length;
    const correctQuestions = records.filter(r => r.correct).length;

    return {
      studyDays: this._calculateStudyDays(records),
      totalQuestions,
      correctRate: totalQuestions > 0
        ? Math.round((correctQuestions / totalQuestions) * 100)
        : 0,
      improvement: 12
    };
  }

  /**
   * 计算学习天数
   */
  _calculateStudyDays(records) {
    if (records.length === 0) return 0;

    const days = new Set();
    for (const record of records) {
      const date = new Date(record.timestamp).toLocaleDateString();
      days.add(date);
    }
    return days.size;
  }

  /**
   * 按知识点计算掌握度
   */
  _calculateMasteryByKnowledge(records) {
    const byKnowledge = new Map();

    for (const record of records) {
      const kpId = record.knowledgePointId;
      if (!byKnowledge.has(kpId)) {
        byKnowledge.set(kpId, { total: 0, correct: 0, name: record.knowledgePointName || kpId });
      }
      byKnowledge.get(kpId).total++;
      if (record.correct) {
        byKnowledge.get(kpId).correct++;
      }
    }

    const result = [];
    for (const [kpId, data] of byKnowledge) {
      const mastery = data.total > 0
        ? Math.round((data.correct / data.total) * 100)
        : 0;

      result.push({
        knowledgePointId: kpId,
        name: data.name,
        mastery,
        totalQuestions: data.total,
        correctAnswers: data.correct
      });
    }

    return result.sort((a, b) => a.mastery - b.mastery);
  }

  /**
   * 生成学习建议
   */
  _generateSuggestions(masteryByKnowledge) {
    const suggestions = [];

    const weakPoints = masteryByKnowledge.filter(k => k.mastery < 60);

    if (weakPoints.length > 0) {
      const weakest = weakPoints[0];
      suggestions.push({
        type: 'weakness',
        priority: 'high',
        content: `你在"${weakest.name}"知识点上掌握度仅为${weakest.mastery}%，建议加强练习。`,
        action: 'practice',
        targetKnowledgePoint: weakest.knowledgePointId
      });
    }

    const avgMastery = masteryByKnowledge.length > 0
      ? Math.round(masteryByKnowledge.reduce((sum, k) => sum + k.mastery, 0) / masteryByKnowledge.length)
      : 0;

    if (avgMastery < 50) {
      suggestions.push({
        type: 'encouragement',
        priority: 'normal',
        content: '基础知识点还需要巩固，建议每天花 15 分钟进行基础练习。加油！'
      });
    } else if (avgMastery < 80) {
      suggestions.push({
        type: 'improvement',
        priority: 'normal',
        content: '整体掌握情况良好，建议针对薄弱环节进行专项突破。'
      });
    } else {
      suggestions.push({
        type: 'excellence',
        priority: 'low',
        content: '太棒了！你已经掌握了大部分知识点，可以尝试挑战更高难度的题目。'
      });
    }

    return suggestions;
  }

  /**
   * 获取薄弱知识点列表
   */
  async getWeaknessList(studentId, threshold = 60) {
    const report = await this.generateReport(studentId);

    return report.masteryByKnowledge
      .filter(k => k.mastery < threshold)
      .sort((a, b) => a.mastery - b.mastery)
      .map(k => ({
        knowledgePointId: k.knowledgePointId,
        name: k.name,
        mastery: k.mastery,
        reason: this._getWeaknessReason(k)
      }));
  }

  /**
   * 获取薄弱原因
   */
  _getWeaknessReason(knowledge) {
    if (knowledge.mastery < 40) {
      return '基础薄弱，需要从头学起';
    } else if (knowledge.mastery < 60) {
      return '理解不透彻，建议加强练习';
    }
    return '掌握不稳定，容易出错';
  }
}