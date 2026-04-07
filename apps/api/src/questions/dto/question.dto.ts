export class CreateQuestionDto {
  content!: string;
  options!: string[];
  correctAnswer!: string;
  difficulty!: 'EASY' | 'MEDIUM' | 'HARD';
}

export class UpdateQuestionDto {
  content?: string;
  options?: string[];
  correctAnswer?: string;
  difficulty?: 'EASY' | 'MEDIUM' | 'HARD';
}
