import { authenticatedRequest } from './authService';
import type { LearningLevel } from './learningService';

export interface ScenarioCategory {
  id: string;
  name: string;
  description: string | null;
}

export interface SpeakingScenario {
  id: string;
  title: string;
  description: string;
  language_code: string;
  difficulty_level: LearningLevel;
  estimated_duration_minutes: number;
  category: ScenarioCategory;
}

export interface ScenarioRole {
  id: string;
  name: string;
  description: string;
  opening_message: string | null;
}

export interface ScenarioDetail extends SpeakingScenario {
  context: string;
  learning_objectives: string;
  roles: ScenarioRole[];
}

export interface ScenarioFilters {
  category_id?: string;
  level?: LearningLevel;
  language_code?: string;
  q?: string;
}

export interface ScenarioList {
  items: SpeakingScenario[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_pages: number;
  };
}

export interface StartSessionInput {
  role_id: string;
  input_mode: 'text' | 'voice';
  audio_storage_enabled: boolean;
}

export interface StartedSession {
  session: {
    id: string;
    scenario_id: string;
    scenario_role_id: string;
    status: 'active' | 'paused' | 'completed' | 'abandoned';
    current_input_mode: 'text' | 'voice';
    audio_storage_enabled: boolean;
    started_at: string;
    accumulated_active_ms: number;
  };
  scenario: SpeakingScenario & {
    context: string;
    learning_objectives: string;
    role: ScenarioRole;
  };
  opening_message: {
    id: string;
    sequence_number: number;
    speaker: 'assistant';
    input_mode: 'generated';
    content: string;
    status: 'completed';
    occurred_at: string;
  } | null;
}

export interface ConversationMessage {
  id: string;
  sequence_number: number;
  speaker: 'user' | 'assistant';
  input_mode: 'text' | 'voice' | 'generated';
  content: string;
  status: 'pending' | 'completed' | 'failed';
  occurred_at: string;
}

export interface TurnInput {
  request_id: string;
  content: string;
  input_mode: 'text' | 'voice';
}

export interface Transcript {
  items: ConversationMessage[];
  session: { id: string; status: string; current_input_mode: 'text' | 'voice' };
  has_more: boolean;
  next_sequence: number;
}

export interface TurnReply {
  user_message: ConversationMessage;
  assistant_message: ConversationMessage;
}

export interface ConversationSummary {
  id: string;
  title: string;
  role_name: string;
  status: StartedSession['session']['status'];
  last_activity_at: string;
  last_message: string | null;
}

export interface ConversationHistory {
  items: ConversationSummary[];
  pagination: ScenarioList['pagination'];
}

export interface LiveCredentials {
  token: string;
  model: string;
  lease: string;
  last_sequence: number;
  history: { role: 'user' | 'model'; parts: { text: string }[] }[];
}
export interface LiveTurnInput {
  lease: string;
  request_id: string;
  after_sequence: number;
  input_mode: 'text' | 'voice';
  user_text: string;
  assistant_text: string;
}

export const speakingService = {
  liveToken(id: string): Promise<LiveCredentials> {
    return authenticatedRequest<LiveCredentials>(
      `/speaking/sessions/${encodeURIComponent(id)}/live-token`,
      {},
      'POST',
    );
  },
  saveLiveTurn(id: string, input: LiveTurnInput): Promise<TurnReply> {
    return authenticatedRequest<TurnReply>(
      `/speaking/sessions/${encodeURIComponent(id)}/live-turns`,
      input,
      'POST',
    );
  },
  history(page = 1): Promise<ConversationHistory> {
    return authenticatedRequest<ConversationHistory>(
      `/speaking/sessions?page=${page}&page_size=20`,
    );
  },
  session(id: string): Promise<StartedSession> {
    return authenticatedRequest<StartedSession>(
      `/speaking/sessions/${encodeURIComponent(id)}`,
    );
  },
  messages(id: string, afterSequence = 0): Promise<Transcript> {
    return authenticatedRequest<Transcript>(
      `/speaking/sessions/${encodeURIComponent(
        id,
      )}/messages?after_sequence=${afterSequence}&limit=100`,
    );
  },
  send(id: string, input: TurnInput): Promise<TurnReply> {
    return authenticatedRequest<TurnReply>(
      `/speaking/sessions/${encodeURIComponent(id)}/messages`,
      input,
      'POST',
      { timeoutMs: 60000 },
    );
  },
  async categories(): Promise<ScenarioCategory[]> {
    const response = await authenticatedRequest<{ items: ScenarioCategory[] }>(
      '/speaking/scenario-categories',
    );
    return response.items;
  },
  list(filters: ScenarioFilters, page = 1): Promise<ScenarioList> {
    const query = Object.entries({ ...filters, page, page_size: 20 })
      .filter(([, value]) => value !== undefined && value !== '')
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join('&');
    return authenticatedRequest<ScenarioList>(`/speaking/scenarios?${query}`);
  },
  async detail(id: string): Promise<ScenarioDetail> {
    const response = await authenticatedRequest<{ scenario: ScenarioDetail }>(
      `/speaking/scenarios/${encodeURIComponent(id)}`,
    );
    return response.scenario;
  },
  start(id: string, values: StartSessionInput): Promise<StartedSession> {
    return authenticatedRequest<StartedSession>(
      `/speaking/scenarios/${encodeURIComponent(id)}/sessions`,
      values,
      'POST',
    );
  },
};
