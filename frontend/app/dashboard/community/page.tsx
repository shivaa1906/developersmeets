'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { apiClient } from '@/lib/api-client';
import { Hash, Send, Shield, ThumbsUp, MessageSquare } from 'lucide-react';

interface ChannelItem {
  id: string;
  name: string;
  slug: string;
}

interface PostItem {
  id: string;
  title: string;
  content: string;
  upvotes: number;
  comments_count: number;
  created_at: string;
  author_name: string;
  author_title?: string;
}

export default function DashboardCommunityPage() {
  const { addToast } = useToast();
  const [channels, setChannels] = React.useState<ChannelItem[]>([]);
  const [activeChannelSlug, setActiveChannelSlug] = React.useState('general');
  const [posts, setPosts] = React.useState<PostItem[]>([]);
  const [inputTitle, setInputTitle] = React.useState('');
  const [inputContent, setInputContent] = React.useState('');
  const [isPosting, setIsPosting] = React.useState(false);

  const fetchChannels = React.useCallback(async () => {
    try {
      const res = await apiClient.get<{ channels: ChannelItem[] }>('/community/channels');
      if (res.channels && res.channels.length > 0) {
        setChannels(res.channels);
      }
    } catch (_err) {
      // Fallback channels
      setChannels([
        { id: '1', name: '#general', slug: 'general' },
        { id: '2', name: '#announcements', slug: 'announcements' },
        { id: '3', name: '#frontend', slug: 'frontend' },
        { id: '4', name: '#backend', slug: 'backend' },
        { id: '5', name: '#ai-ml', slug: 'ai-ml' },
      ]);
    }
  }, []);

  const fetchPosts = React.useCallback(async (slug: string) => {
    try {
      const res = await apiClient.get<{ posts: PostItem[] }>(`/community/posts?channel=${slug}`);
      setPosts(res.posts || []);
    } catch (_err) {
      setPosts([]);
    }
  }, []);

  React.useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  React.useEffect(() => {
    fetchPosts(activeChannelSlug);
  }, [activeChannelSlug, fetchPosts]);

  const activeChannel = channels.find((c) => c.slug === activeChannelSlug);

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputContent.trim() || !activeChannel) return;

    setIsPosting(true);
    try {
      await apiClient.post('/community/posts', {
        channelId: activeChannel.id,
        title: inputTitle || inputContent.slice(0, 40),
        content: inputContent,
      });

      setInputTitle('');
      setInputContent('');
      addToast('success', 'Post Published', 'Your message has been posted to the developer network.');
      await fetchPosts(activeChannelSlug);
    } catch (err: any) {
      addToast('error', 'Post Failed', err.message || 'Unable to publish post.');
    } finally {
      setIsPosting(false);
    }
  };

  const handleUpvote = async (postId: string) => {
    try {
      const res = await apiClient.post<{ upvoted: boolean }>(`/community/posts/${postId}/upvote`);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, upvotes: res.upvoted ? p.upvotes + 1 : Math.max(0, p.upvotes - 1) }
            : p
        )
      );
    } catch (err: any) {
      addToast('error', 'Upvote Failed', err.message);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-foreground">Private Developer Network</h1>
            <Badge variant="success" size="sm">
              <Shield className="h-3 w-3 mr-1 inline" />
              Verified Only
            </Badge>
          </div>
          <p className="text-xs text-muted mt-1">
            Private peer communication, technical discussions, and announcements for approved developers.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Channel Navigation */}
        <div className="md:col-span-1 space-y-1 rounded-xl border border-border bg-[#080808] p-3 h-[540px] overflow-y-auto">
          <span className="text-[10px] uppercase font-bold text-muted tracking-wider block px-2 py-1">
            Channels
          </span>
          {channels.map((ch) => (
            <button
              key={ch.id}
              onClick={() => setActiveChannelSlug(ch.slug)}
              className={`w-full flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors text-left ${
                activeChannelSlug === ch.slug
                  ? 'bg-accent/15 text-accent font-semibold'
                  : 'text-muted hover:bg-surface-elevated hover:text-foreground'
              }`}
            >
              <Hash className="h-3.5 w-3.5 shrink-0" />
              <span>{ch.name.replace('#', '')}</span>
            </button>
          ))}
        </div>

        {/* Channel Posts Feed */}
        <div className="md:col-span-3">
          <Card className="flex flex-col h-[540px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border p-4 bg-surface-elevated/40">
              <div className="flex items-center space-x-2">
                <Hash className="h-4 w-4 text-accent" />
                <h3 className="text-sm font-bold text-foreground">#{activeChannelSlug}</h3>
              </div>
              <span className="text-[11px] text-muted">Technical Discussions & Peer Knowledge</span>
            </div>

            {/* Posts Feed */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {posts.length === 0 ? (
                <div className="flex h-full items-center justify-center text-xs text-muted">
                  No discussions yet in #{activeChannelSlug}. Start a conversation below!
                </div>
              ) : (
                posts.map((p) => (
                  <div key={p.id} className="p-3 rounded-lg border border-border bg-surface space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-foreground">{p.author_name}</span>
                        {p.author_title && (
                          <span className="text-[10px] text-muted font-mono">({p.author_title})</span>
                        )}
                        <span className="text-[10px] text-muted">
                          {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <button
                        onClick={() => handleUpvote(p.id)}
                        className="inline-flex items-center space-x-1 text-xs text-muted hover:text-accent font-mono"
                      >
                        <ThumbsUp className="h-3 w-3" />
                        <span>{p.upvotes}</span>
                      </button>
                    </div>

                    <h4 className="text-sm font-bold text-foreground">{p.title}</h4>
                    <p className="text-xs text-muted leading-relaxed whitespace-pre-wrap">{p.content}</p>
                  </div>
                ))
              )}
            </div>

            {/* Post input form */}
            <form onSubmit={handleCreatePost} className="border-t border-border p-3 space-y-2 bg-surface">
              <input
                type="text"
                placeholder="Topic / Title (optional)..."
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                className="w-full bg-surface-elevated rounded px-3 py-1.5 text-xs text-foreground placeholder:text-muted border border-border/60 focus:outline-none"
              />
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder={`Post a question or code insight in #${activeChannelSlug}...`}
                  value={inputContent}
                  onChange={(e) => setInputContent(e.target.value)}
                  className="flex-1 bg-transparent px-3 py-2 text-xs text-foreground placeholder:text-muted focus:outline-none"
                  required
                />
                <Button type="submit" size="sm" isLoading={isPosting} leftIcon={<Send className="h-3.5 w-3.5" />}>
                  Publish
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
