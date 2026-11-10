import type { AgentChatResponse } from '@/types';
import { api } from './api';
import { isDemoMode } from './config';
import { demoChat } from './demo/workflow';

export const agentService = {
  chat(message: string): Promise<AgentChatResponse> {
    return isDemoMode ? demoChat(message) : api.post<AgentChatResponse>('/agent/chat', { message });
  },
};
