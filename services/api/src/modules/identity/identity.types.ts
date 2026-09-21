export interface User {
  id: string;
  username: string;
  email?: string;
  phone?: string;
  name?: string;
  avatar_url?: string;
  role: 'consumer' | 'student' | 'merchant' | 'operator';
  status?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface Student {
  user_id: string;
  name?: string;
  grade?: number;
  parent_id?: string;
  avatar_url?: string;
  textbook_version?: string;
  school?: string;
  created_at?: Date;
  updated_at?: Date;
}

export interface UserProfile {
  user: User;
  student?: Student;
}
