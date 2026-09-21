export interface KnowledgePoint {
  id: string;
  name: string;
  description?: string;
  level?: string;
  parent_id?: string;
}

export interface Question {
  id: string;
  content: string;
  options?: string[];
  answer: string;
  analysis?: string;
  knowledge_point_id?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
  type?: 'multiple-choice' | 'short-answer' | 'essay';
}

export interface PracticeSession {
  id: string;
  user_id: string;
  start_time?: Date;
  end_time?: Date;
  score?: number;
  status: 'in_progress' | 'completed';
}

export interface WrongQuestion {
  id: string;
  user_id: string;
  question_id: string;
  wrong_count: number;
  last_attempt_at?: Date;
  is_resolved: boolean;
}

export interface LearningPlan {
  id: string;
  user_id: string;
  title: string;
  start_date?: Date;
  end_date?: Date;
  progress?: number;
  status: 'active' | 'completed' | 'archived';
}