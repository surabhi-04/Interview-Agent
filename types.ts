export enum InterviewType {
  SOFTWARE_ENGINEER = 'Software Engineer',
  DATA_ANALYST = 'Data Analyst',
  PRODUCT_MANAGER = 'Product Manager',
  HR_BEHAVIORAL = 'HR / Behavioral',
}

export enum Difficulty {
  EASY = 'Easy',
  MEDIUM = 'Medium',
  HARD = 'Hard',
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}

// Audio Utils Types
export interface AudioBlob {
  data: string; // Base64
  mimeType: string;
}
