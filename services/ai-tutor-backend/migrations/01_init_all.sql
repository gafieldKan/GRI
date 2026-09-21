-- 智学慧眼 - 数据库初始化脚本 (完整版)
-- 适用于 PostgreSQL 14+
-- 更新日期：2026-05-26

-- ============ 基础表 ============

-- 学生表
CREATE TABLE IF NOT EXISTS students (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  grade INTEGER,
  avatar_url VARCHAR(255),
  parent_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 知识点表
CREATE TABLE IF NOT EXISTS knowledge_points (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  subject VARCHAR(32) NOT NULL,
  grade_level INTEGER,
  description TEXT,
  prerequisites TEXT[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 题目表
CREATE TABLE IF NOT EXISTS questions (
  id VARCHAR(64) PRIMARY KEY,
  knowledge_point_id VARCHAR(64) REFERENCES knowledge_points(id),
  content TEXT NOT NULL,
  content_latex TEXT,
  answer TEXT NOT NULL,
  answer_latex TEXT,
  type VARCHAR(32) DEFAULT 'fill',
  difficulty INTEGER DEFAULT 1,
  options TEXT[],
  explanation TEXT,
  variant_of VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS questions_knowledge_point_idx ON questions(knowledge_point_id);

-- 学习会话表
CREATE TABLE IF NOT EXISTS learning_sessions (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id),
  knowledge_point_id VARCHAR(64) REFERENCES knowledge_points(id),
  status VARCHAR(32) DEFAULT 'active',
  start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMP,
  session_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 互动记录表
CREATE TABLE IF NOT EXISTS interaction_logs (
  id VARCHAR(64) PRIMARY KEY,
  session_id VARCHAR(64) REFERENCES learning_sessions(id),
  student_id VARCHAR(64) REFERENCES students(id),
  event_type VARCHAR(64),
  content TEXT,
  is_correct BOOLEAN,
  response_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 答题记录表
CREATE TABLE IF NOT EXISTS answer_records (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id),
  question_id VARCHAR(64) REFERENCES questions(id),
  session_id VARCHAR(64) REFERENCES learning_sessions(id),
  student_answer TEXT,
  is_correct BOOLEAN,
  time_spent_ms INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 知识点掌握度表
CREATE TABLE IF NOT EXISTS mastery_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id),
  knowledge_point_id VARCHAR(64) REFERENCES knowledge_points(id),
  mastery_score INTEGER,
  confidence_level FLOAT,
  calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============ 初始数据 - 知识点 ============
INSERT INTO knowledge_points (id, name, subject, grade_level, description) VALUES
('math_pythagorean', '勾股定理', 'math', 8, '直角三角形两直角边的平方和等于斜边的平方'),
('math_similar_triangles', '相似三角形', 'math', 9, '对应角相等，对应边成比例'),
('math_quadratic_function', '二次函数', 'math', 9, '形如 y=ax²+bx+c 的函数'),
('math_linear_equation', '一元一次方程', 'math', 7, '只含有一个未知数且次数为 1 的方程')
ON CONFLICT (id) DO NOTHING;

-- ============ 诊断题目（用于学前诊断） ============
-- 勾股定理诊断题（3 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('diag_pythag_1', 'math_pythagorean', '直角三角形的两条直角边分别是 3 和 4，斜边长是多少？', '5', 'fill', 1, NULL, '根据勾股定理：c = √(3² + 4²) = √25 = 5', 'diagnosis'),
('diag_pythag_2', 'math_pythagorean', '以下哪组数可以构成直角三角形的三边？', 'A', 'choice', 2, ARRAY['3,4,5', '2,3,4', '5,6,7', '4,5,6'], '只有 3,4,5 满足勾股定理 a²+b²=c²', 'diagnosis'),
('diag_pythag_3', 'math_pythagorean', '直角三角形斜边为 13，一条直角边为 5，另一条直角边是多少？', '12', 'fill', 2, NULL, 'x² + 5² = 13², x² = 144, x = 12', 'diagnosis')
ON CONFLICT (id) DO NOTHING;

-- 一元一次方程诊断题（2 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('diag_linear_1', 'math_linear_equation', '解方程 2x + 3 = 7', 'x=2', 'fill', 1, NULL, '2x = 4, x = 2', 'diagnosis'),
('diag_linear_2', 'math_linear_equation', '解方程 3x - 5 = 10', 'x=5', 'fill', 2, NULL, '3x = 15, x = 5', 'diagnosis')
ON CONFLICT (id) DO NOTHING;

-- 二次函数诊断题（2 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('diag_quad_1', 'math_quadratic_function', '二次函数 y = x² - 4x + 3 的顶点坐标是？', '(2,-1)', 'fill', 3, NULL, '顶点公式：x = -b/2a = 2, y = 2² - 4*2 + 3 = -1', 'diagnosis'),
('diag_quad_2', 'math_quadratic_function', '二次函数 y = (x-1)² + 2 的开口方向是？', '向上', 'fill', 1, NULL, 'a=1>0，开口向上', 'diagnosis')
ON CONFLICT (id) DO NOTHING;

-- 相似三角形诊断题（2 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('diag_similar_1', 'math_similar_triangles', '两个相似三角形的对应边之比是 2:3，则面积之比是？', '4:9', 'fill', 2, NULL, '面积比等于边长比的平方：(2/3)² = 4/9', 'diagnosis'),
('diag_similar_2', 'math_similar_triangles', '以下哪种情况两个三角形一定相似？', 'AAA', 'choice', 2, ARRAY['AAA', 'SSA', 'AAS', 'ASS'], 'AAA（三个角对应相等）可以判定相似', 'diagnosis')
ON CONFLICT (id) DO NOTHING;

-- ============ 教学讲解内容 ============
-- 勾股定理教学讲解
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, explanation, variant_of) VALUES
('teach_pythag_1', 'math_pythagorean', '【知识点讲解】
勾股定理：直角三角形两直角边的平方和等于斜边的平方。
公式：a² + b² = c²
其中 a、b 是直角边，c 是斜边。

例题：直角边为 3 和 4，求斜边。
解：c = √(3² + 4²) = √(9+16) = √25 = 5', '理解', 'text', 1, '这是勾股定理的基本应用，直接代入公式即可。', 'teaching'),
('teach_pythag_2', 'math_pythagorean', '【易错点提醒】
1. 分清直角边和斜边
2. 计算时注意开平方
3. 边长必须是正数

例题：已知斜边 13，直角边 5，求另一直角边。
解：设另一直角边为 x
x² + 5² = 13²
x² = 169 - 25 = 144
x = 12', '理解', 'text', 2, '已知斜边和一直角边，用减法求另一直角边。', 'teaching')
ON CONFLICT (id) DO NOTHING;

-- ============ 测验题目（用于课后测验） ============
-- 勾股定理测验题（5 道，从易到难）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('quiz_pythag_1', 'math_pythagorean', '直角边为 6 和 8，斜边是？', '10', 'fill', 1, NULL, '√(6² + 8²) = √100 = 10', 'quiz'),
('quiz_pythag_2', 'math_pythagorean', '以下哪组是勾股数？', 'B', 'choice', 2, ARRAY['2,3,4', '5,12,13', '4,6,8', '7,8,9'], '5²+12²=25+144=169=13²', 'quiz'),
('quiz_pythag_3', 'math_pythagorean', '斜边为 17，直角边为 8，另一直角边是？', '15', 'fill', 2, NULL, '√(17² - 8²) = √(289-64) = √225 = 15', 'quiz'),
('quiz_pythag_4', 'math_pythagorean', '等腰直角三角形的斜边是直角边的几倍？', '√2', 'fill', 3, NULL, '设直角边为 a，则斜边=√(a²+a²)=a√2', 'quiz'),
('quiz_pythag_5', 'math_pythagorean', '一个长方形的长是 8，宽是 6，对角线长是？', '10', 'fill', 2, NULL, '长方形对角线构成直角三角形，√(8²+6²)=√100=10', 'quiz')
ON CONFLICT (id) DO NOTHING;

-- 一元一次方程测验题（3 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('quiz_linear_1', 'math_linear_equation', '解方程 4x = 12', 'x=3', 'fill', 1, NULL, 'x = 12÷4 = 3', 'quiz'),
('quiz_linear_2', 'math_linear_equation', '解方程 2x - 7 = 3', 'x=5', 'fill', 2, NULL, '2x = 10, x = 5', 'quiz'),
('quiz_linear_3', 'math_linear_equation', '解方程 3(x+2) = 15', 'x=3', 'fill', 2, NULL, '3x+6=15, 3x=9, x=3', 'quiz')
ON CONFLICT (id) DO NOTHING;

-- 二次函数测验题（3 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('quiz_quad_1', 'math_quadratic_function', '二次函数 y = x² 的图像开口向哪？', '上', 'fill', 1, NULL, 'a=1>0，开口向上', 'quiz'),
('quiz_quad_2', 'math_quadratic_function', '二次函数 y = (x-2)² 的顶点是？', '(2,0)', 'fill', 2, NULL, '顶点式 y=a(x-h)²+k，顶点为 (h,k)', 'quiz'),
('quiz_quad_3', 'math_quadratic_function', '二次函数 y = -2x² + 4x + 1 的对称轴是？', 'x=1', 'fill', 3, NULL, '对称轴 x = -b/2a = -4/(2×-2) = 1', 'quiz')
ON CONFLICT (id) DO NOTHING;

-- 相似三角形测验题（3 道）
INSERT INTO questions (id, knowledge_point_id, content, answer, type, difficulty, options, explanation, variant_of) VALUES
('quiz_similar_1', 'math_similar_triangles', '两个相似三角形边长比是 1:2，面积比是？', '1:4', 'fill', 2, NULL, '面积比等于边长比的平方：(1/2)²=1/4', 'quiz'),
('quiz_similar_2', 'math_similar_triangles', '两个相似三角形面积比是 1:9，边长比是？', '1:3', 'fill', 2, NULL, '边长比等于面积比的平方根：√(1/9)=1/3', 'quiz'),
('quiz_similar_3', 'math_similar_triangles', '以下哪种方法可以判定两个三角形相似？', 'B', 'choice', 3, ARRAY['一边成比例', '两边成比例且夹角相等', '三角对应相等', '以上都可以'], '两边成比例且夹角相等是相似判定定理之一', 'quiz')
ON CONFLICT (id) DO NOTHING;
-- 智学慧眼 - 学情分析与试卷批改模块数据库迁移 (安全合并版)
-- 迁移日期：2026-07-29
-- 安全版本：使用 IF NOT EXISTS + ADD COLUMN IF NOT EXISTS 避免破坏已有数据

-- ============================================
-- 1. 学生档案扩展
-- ============================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS textbook_version VARCHAR(50);
ALTER TABLE students ADD COLUMN IF NOT EXISTS school VARCHAR(200);

-- ============================================
-- 2. 试卷表 (exams)
-- ============================================
CREATE TABLE IF NOT EXISTS exams (
  id VARCHAR(128) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id),
  subject VARCHAR(50) NOT NULL,
  grade_level VARCHAR(20),
  exam_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  exam_type VARCHAR(32) DEFAULT 'manual',
  raw_images JSONB,
  ocr_result JSONB,
  parsed_questions JSONB,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS exams_student_idx ON exams(student_id);
CREATE INDEX IF NOT EXISTS exams_subject_idx ON exams(subject);
CREATE INDEX IF NOT EXISTS exams_status_idx ON exams(status);

-- ============================================
-- 3. 学情分析报告表 (analysis_reports)
-- ============================================
CREATE TABLE IF NOT EXISTS analysis_reports (
  id VARCHAR(128) PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
  exam_id VARCHAR(128) REFERENCES exams(id),
  student_id VARCHAR(64) REFERENCES students(id),
  knowledge_points JSONB,
  ability_dims JSONB,
  error_attribution JSONB,
  peer_percentile FLOAT,
  peer_avg_score FLOAT,
  student_score FLOAT,
  ai_suggestions JSONB,
  weak_points JSONB,
  strong_points JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS analysis_reports_exam_idx ON analysis_reports(exam_id);
CREATE INDEX IF NOT EXISTS analysis_reports_student_idx ON analysis_reports(student_id);

-- ============================================
-- 4. 错题本题目表 (wrong_questions)
-- ============================================
CREATE TABLE IF NOT EXISTS wrong_questions (
  id VARCHAR(128) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id),
  exam_id VARCHAR(128) REFERENCES exams(id),
  question_text TEXT NOT NULL,
  question_type VARCHAR(32),
  subject VARCHAR(50),
  knowledge_point VARCHAR(200),
  student_answer TEXT,
  correct_answer TEXT,
  error_type VARCHAR(100),
  mastery_level VARCHAR(20),
  difficulty FLOAT DEFAULT 0.5,
  reviewed BOOLEAN DEFAULT FALSE,
  mastered BOOLEAN DEFAULT FALSE,
  review_count INTEGER DEFAULT 0,
  last_reviewed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS wrong_questions_student_idx ON wrong_questions(student_id);
CREATE INDEX IF NOT EXISTS wrong_questions_exam_idx ON wrong_questions(exam_id);
CREATE INDEX IF NOT EXISTS wrong_questions_knowledge_point_idx ON wrong_questions(knowledge_point);

-- ============================================
-- 5. 学习计划表 (learning_plans)
-- ============================================
CREATE TABLE IF NOT EXISTS learning_plans (
  id VARCHAR(128) PRIMARY KEY,
  student_id VARCHAR(64) REFERENCES students(id),
  plan_type VARCHAR(20) NOT NULL,
  plan_period VARCHAR(50),
  plan_data JSONB,
  progress FLOAT DEFAULT 0,
  total_tasks INTEGER,
  completed_tasks INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS learning_plans_student_idx ON learning_plans(student_id);
CREATE INDEX IF NOT EXISTS learning_plans_period_idx ON learning_plans(plan_period);

-- ============================================
-- 6. 学习轨迹表 (learning_trajectories)
-- ============================================
CREATE TABLE IF NOT EXISTS learning_trajectories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(64) REFERENCES students(id),
  knowledge_point_id VARCHAR(64),
  snapshot_date DATE,
  mastery_before FLOAT,
  mastery_after FLOAT,
  time_spent_minutes INTEGER,
  questions_attempted INTEGER,
  questions_correct INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS learning_trajectories_student_idx ON learning_trajectories(student_id);
CREATE INDEX IF NOT EXISTS learning_trajectories_date_idx ON learning_trajectories(snapshot_date);

-- ============================================
-- 7. 外部资源表 (external_resources)
-- ============================================
CREATE TABLE IF NOT EXISTS external_resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_point_id VARCHAR(64),
  subject VARCHAR(50),
  grade_level VARCHAR(20),
  resource_type VARCHAR(32),
  resource_url TEXT,
  resource_title VARCHAR(500),
  resource_source VARCHAR(200),
  difficulty FLOAT DEFAULT 0.5,
  duration_minutes INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS external_resources_knowledge_point_idx ON external_resources(knowledge_point_id);
CREATE INDEX IF NOT EXISTS external_resources_subject_idx ON external_resources(subject);

-- ============================================
-- 8. 学生能力画像表 (student_capability_profiles)
-- ============================================
CREATE TABLE IF NOT EXISTS student_capability_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(64) REFERENCES students(id),
  memory_score FLOAT DEFAULT 0.5,
  understanding_score FLOAT DEFAULT 0.5,
  application_score FLOAT DEFAULT 0.5,
  analysis_score FLOAT DEFAULT 0.5,
  synthesis_score FLOAT DEFAULT 0.5,
  avg_study_time_minutes INTEGER,
  preferred_subject VARCHAR(50),
  learning_style VARCHAR(50),
  profile_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS student_capability_profiles_student_idx ON student_capability_profiles(student_id);

-- ============================================
-- 9. 插入测试数据
-- ============================================
INSERT INTO students (id, name, grade, textbook_version, school) VALUES
  ('student_001', '张小明', 8, '人教版', '北京市第一中学'),
  ('student_002', '李华', 9, '北师大版', '上海市实验中学')
ON CONFLICT (id) DO NOTHING;

INSERT INTO knowledge_points (id, name, subject, grade_level, description) VALUES
  ('math_func_quad', '二次函数', 'math', 9, '形如 y=ax²+bx+c 的函数，图像为抛物线'),
  ('math_func_linear', '一次函数', 'math', 7, '形如 y=kx+b 的函数'),
  ('math_geo_triangle', '三角形性质', 'math', 7, '三角形的内角和、外角和性质'),
  ('math_stat_probability', '概率统计', 'math', 8, '事件发生的可能性分析'),
  ('phys_motion', '运动学', 'phys', 8, '物体的位置、速度、加速度分析'),
  ('chem_element', '化学元素', 'chem', 9, '元素周期表与元素性质'),
  ('eng_grammar_tense', '英语时态', 'eng', 7, '英语动词的时态变化'),
  ('chn_poetry', '古诗词鉴赏', 'chn', 8, '古代诗词的理解与赏析')
ON CONFLICT (id) DO NOTHING;