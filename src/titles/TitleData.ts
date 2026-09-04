// Title system data structures and interfaces

export interface QuizQuestion {
  id: string;
  category: string;
  pool: 'claim' | 'duel';
  question: string;
  answers: string[];
  correctAnswer: number; // 0-indexed
}

export interface TitleCategory {
  id: string;
  name: string;
  roleId: string;
  claimQuestions: string[]; // question IDs
  duelQuestions: string[]; // question IDs
}

export interface TitleOwnership {
  categoryId: string;
  holderId: string | null;
  holderName: string | null;
  acquiredAt: Date | null;
}

// JJK Title Category
export const JJK_CATEGORY: TitleCategory = {
  id: 'jjk',
  name: 'Lord of the Heian Era',
  roleId: '1545473512171376720',
  claimQuestions: [
    'jjk_claim_001',
    'jjk_claim_002',
    'jjk_claim_003',
    'jjk_claim_004',
    'jjk_claim_005',
    'jjk_claim_006',
    'jjk_claim_007',
    'jjk_claim_008',
    'jjk_claim_009',
    'jjk_claim_010',
  ],
  duelQuestions: [
    'jjk_duel_001',
    'jjk_duel_002',
    'jjk_duel_003',
    'jjk_duel_004',
    'jjk_duel_005',
    'jjk_duel_006',
    'jjk_duel_007',
    'jjk_duel_008',
    'jjk_duel_009',
    'jjk_duel_010',
  ],
};

// All title categories (extensible)
export const TITLE_CATEGORIES: Record<string, TitleCategory> = {
  jjk: JJK_CATEGORY,
};
