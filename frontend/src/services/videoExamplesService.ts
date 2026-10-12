import { authenticatedRequest } from './authService';

export type VideoExample = {
  id: string;
  text: string;
  search_text: string;
  start_seconds: number;
  end_seconds: number;
  video: { youtube_id: string; title: string; channel: string };
  watch_url: string;
};
export type VideoExamplesResult = {
  query: string;
  items: VideoExample[];
  next_cursor: string | null;
  has_more: boolean;
};

export const videoExamplesService = {
  search: (query: string, after?: string) =>
    authenticatedRequest<VideoExamplesResult>(
      `/vocabulary/video-examples?q=${encodeURIComponent(query)}&page_size=20${
        after ? `&after=${encodeURIComponent(after)}` : ''
      }`,
    ),
};
