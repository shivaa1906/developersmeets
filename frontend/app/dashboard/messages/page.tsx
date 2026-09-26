'use client';

import * as React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { useRealtime } from '@/hooks/use-realtime';
import { realtimeClient } from '@/lib/realtime-client';
import { apiClient } from '@/lib/api-client';
import { Send, Shield, Lock, MessageSquare, Radio } from 'lucide-react';

interface ConversationItem {
  id: string;
  type: string;
  project_title?: string;
  project_number?: string;
  my_role: string;
}

interface MessageItem {
  id: string;
  senderDisplayName: string;
  message: string;
  createdAt: string;
  isMe: boolean;
}

export default function DashboardMessagesPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const { subscribe, sendTyping, isConnected } = useRealtime();
  const [conversations, setConversations] = React.useState<ConversationItem[]>([]);
  const [activeConversationId, setActiveConversationId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<MessageItem[]>([]);
  const [inputMessage, setInputMessage] = React.useState('');
  const [typingStatus, setTypingStatus] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSending, setIsSending] = React.useState(false);

  const fetchConversations = React.useCallback(async () => {
    try {
      const res = await apiClient.get<{ conversations: ConversationItem[] }>('/chat/conversations');
      setConversations(res.conversations || []);
      if (res.conversations && res.conversations.length > 0 && !activeConversationId) {
        setActiveConversationId(res.conversations[0].id);
      }
    } catch (_err) {
      // Fallback
    } finally {
      setIsLoading(false);
    }
  }, [activeConversationId]);

  React.useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const fetchMessages = React.useCallback(async (convId: string) => {
    try {
      const res = await apiClient.get<{ messages: MessageItem[] }>(`/chat/${convId}/messages`);
      setMessages(res.messages || []);
    } catch (_err) {
      // Fallback
    }
  }, []);

  // Real-time WebSocket connection to active conversation room
  React.useEffect(() => {
    if (!activeConversationId) return;

    fetchMessages(activeConversationId);

    const channel = `chat:${activeConversationId}`;
    const unsubscribe = subscribe(channel, (event: any) => {
      if (event.event === 'chat:message') {
        const newMsg = event.data;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [
            ...prev,
            {
              id: newMsg.id,
              senderDisplayName: newMsg.senderDisplayName || 'Participant',
              message: newMsg.message,
              createdAt: newMsg.createdAt,
              isMe: newMsg.senderId === user?.id,
            },
          ];
        });
      }
    });

    const unsubTyping = realtimeClient.on(`typing:${channel}`, (payload: any) => {
      if (payload.isTyping) {
        setTypingStatus(`${payload.displayName || 'Participant'} is typing...`);
      } else {
        setTypingStatus(null);
      }
    });

    // Fallback polling only when WS is disconnected
    let pollInterval: any = null;
    if (!isConnected) {
      pollInterval = setInterval(() => fetchMessages(activeConversationId), 15000);
    }

    return () => {
      unsubscribe();
      unsubTyping();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [activeConversationId, fetchMessages, subscribe, isConnected, user?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() || !activeConversationId) return;

    const textToSend = inputMessage;
    setInputMessage('');
    setIsSending(true);

    try {
      const res = await apiClient.post<{ message: any; redacted: boolean; violations: string[] }>(
        `/chat/${activeConversationId}/messages`,
        { message: textToSend }
      );

      if (res.redacted) {
        addToast(
          'info',
          'Privacy Shield Active',
          `Direct contact information (${res.violations.join(', ')}) was redacted to protect selection anonymity.`
        );
      }

      await fetchMessages(activeConversationId);
    } catch (err: any) {
      addToast('error', 'Message Failed', err.message || 'Unable to send message.');
    } finally {
      setIsSending(false);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-foreground">Project Conversations</h1>
            <Badge variant="default" size="sm">
              <Shield className="h-3 w-3 mr-1 inline" />
              100% Anonymous Bridge
            </Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            End-to-end anonymized selection conversations. Personal details remain protected by platform protocol.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="p-12 text-center text-sm text-muted">Loading conversations...</div>
      ) : conversations.length === 0 ? (
        <Card className="p-12 text-center text-muted space-y-3">
          <MessageSquare className="h-10 w-10 mx-auto text-muted/50" />
          <h3 className="text-base font-bold text-foreground">No Active Conversations</h3>
          <p className="text-xs max-w-md mx-auto">
            Conversations are created automatically when you claim a project or when a developer claims your submitted project.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {/* Active Conversation Selector */}
          <div className="md:col-span-1 space-y-2">
            <span className="text-[10px] uppercase font-bold text-muted tracking-wider block px-1">
              Active Chats ({conversations.length})
            </span>
            <div className="space-y-2">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setActiveConversationId(c.id)}
                  className={`rounded-xl border p-3 cursor-pointer transition-all ${
                    c.id === activeConversationId
                      ? 'border-accent bg-surface-elevated shadow-accent-glow'
                      : 'border-border bg-surface hover:border-accent/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-accent">
                      {c.project_number || 'Project Chat'}
                    </span>
                    <span className="h-2 w-2 rounded-full bg-status-success" />
                  </div>
                  <p className="text-xs font-semibold text-foreground mt-1 truncate">
                    {c.project_title || 'Private Conversation'}
                  </p>
                  <p className="text-[10px] text-muted truncate mt-0.5">Role: {c.my_role}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Chat Window */}
          <div className="md:col-span-3">
            <Card className="flex flex-col h-[540px]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border p-4 bg-surface-elevated/50">
                <div className="flex items-center space-x-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/10 border border-accent/30 text-accent font-mono text-xs font-bold">
                    ANON
                  </div>
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="text-sm font-bold text-foreground">
                        {activeConv?.project_title || 'Anonymous Channel'}
                      </h3>
                      {isConnected && (
                        <span className="flex items-center space-x-1 rounded-full bg-status-success/10 border border-status-success/30 px-2 py-0.5 text-[9px] font-semibold text-status-success">
                          <span className="h-1.5 w-1.5 rounded-full bg-status-success animate-pulse" />
                          <span>REALTIME</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted">
                      Project: {activeConv?.project_number || 'Confidential'} • Shielded Channel
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-1.5 text-xs text-status-success font-mono bg-status-success/10 px-2 py-0.5 rounded border border-status-success/20">
                  <Lock className="h-3 w-3" />
                  <span>Privacy Shield Active</span>
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-xs text-muted">
                    No messages yet in this channel. Send the first message below.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${m.isMe ? 'items-end' : 'items-start'}`}
                    >
                      <div className="flex items-center space-x-1.5 text-[10px] text-muted mb-1 px-1">
                        <span className="font-semibold">{m.senderDisplayName}</span>
                        <span>•</span>
                        <span>{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div
                        className={`max-w-md rounded-xl p-3 text-xs leading-relaxed ${
                          m.isMe
                            ? 'bg-accent/15 border border-accent/30 text-foreground'
                            : 'bg-surface-elevated border border-border text-foreground'
                        }`}
                      >
                        {m.message}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Realtime Typing Indicator */}
              {typingStatus && (
                <div className="px-4 py-1.5 bg-surface-elevated/40 border-t border-border flex items-center space-x-2 text-[10px] text-accent font-medium animate-pulse">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <span>{typingStatus}</span>
                </div>
              )}

              {/* Input Bar */}
              <form
                onSubmit={handleSendMessage}
                className="border-t border-border p-3 bg-surface flex items-center space-x-2"
              >
                <input
                  type="text"
                  placeholder="Type an anonymous message (contact details will be automatically redacted)..."
                  value={inputMessage}
                  onChange={(e) => {
                    setInputMessage(e.target.value);
                    if (activeConversationId) {
                      sendTyping(`chat:${activeConversationId}`, e.target.value.length > 0);
                    }
                  }}
                  className="flex-1 bg-transparent px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none"
                />
                <Button
                  type="submit"
                  size="sm"
                  isLoading={isSending}
                  leftIcon={<Send className="h-3.5 w-3.5" />}
                >
                  Send
                </Button>
              </form>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
