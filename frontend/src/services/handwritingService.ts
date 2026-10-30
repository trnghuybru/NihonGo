import { authenticatedRequest } from './authService';
export type HandwritingPrediction = { character: string; score: number };
export type HandwritingResult = {
  predictions: HandwritingPrediction[];
  elapsed_ms: number;
};
export const handwritingService = {
  recognize: (image: string) =>
    authenticatedRequest<HandwritingResult>(
      '/kanji/recognize',
      { image },
      'POST',
      { timeoutMs: 30000 },
    ),
};
