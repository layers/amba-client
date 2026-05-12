import type {
  Conversation,
  Message,
  ConversationParticipant,
  ApiResponse,
  ApiListResponse,
} from '@layers/amba-shared';
import type { HttpClient } from './http.js';

export interface CreateConversationOptions {
  type?: 'direct' | 'group';
  name?: string;
  participant_ids: string[];
}

export interface MessageListOptions {
  limit?: number;
  offset?: number;
}

export interface SendMessageOptions {
  body: string;
  message_type?: 'text' | 'image' | 'system';
  metadata?: Record<string, unknown>;
}

export class MessagingModule {
  constructor(private readonly http: HttpClient) {}

  /** Create a conversation with one or more participants. */
  async createConversation(options: CreateConversationOptions): Promise<Conversation> {
    const { data } = await this.http.post<ApiResponse<Conversation>>(
      '/client/messaging/conversations',
      options,
    );
    return data.data;
  }

  /** List conversations the current user is part of. */
  async getConversations(options: MessageListOptions = {}): Promise<Conversation[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/messaging/conversations${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<Conversation>>(path);
    return data.data;
  }

  /** Send a message to a conversation. */
  async sendMessage(conversationId: string, options: SendMessageOptions): Promise<Message> {
    const { data } = await this.http.post<ApiResponse<Message>>(
      `/client/messaging/conversations/${conversationId}/messages`,
      options,
    );
    return data.data;
  }

  /** List messages in a conversation (newest first). */
  async getMessages(conversationId: string, options: MessageListOptions = {}): Promise<Message[]> {
    const params = new URLSearchParams();
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));

    const query = params.toString();
    const path = `/client/messaging/conversations/${conversationId}/messages${query ? `?${query}` : ''}`;

    const { data } = await this.http.get<ApiListResponse<Message>>(path);
    return data.data;
  }

  /** Mark a conversation as read up to the current time. */
  async markAsRead(conversationId: string): Promise<ConversationParticipant> {
    const { data } = await this.http.post<ApiResponse<ConversationParticipant>>(
      `/client/messaging/conversations/${conversationId}/read`,
    );
    return data.data;
  }
}
