import { useState } from 'react';
import { Input, Button, Typography } from 'antd';
import type { MomentComment } from '@/types';
import { useUserStore } from '@/store';

interface CommentSectionProps {
  momentId: string;
  comments: MomentComment[];
  commentCount: number;
  onAddComment: (content: string, replyToId?: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function CommentSection({
  momentId,
  comments,
  commentCount,
  onAddComment,
  onDeleteComment,
}: CommentSectionProps) {
  const currentUser = useUserStore((s) => s.user);
  const [expanded, setExpanded] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [replyTarget, setReplyTarget] = useState<{ id: string; nickname: string } | null>(null);

  const shownComments = expanded ? comments : comments.slice(0, 2);
  const hiddenCount = comments.length - 2;

  const handleSubmit = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    onAddComment(trimmed, replyTarget?.id);
    setInputValue('');
    setReplyTarget(null);
    setShowInput(false);
  };

  const handleReply = (c: MomentComment) => {
    setReplyTarget({ id: c.id, nickname: c.user.nickname });
    setShowInput(true);
  };

  const handleLongPress = (commentId: string, userId: string) => {
    if (userId === currentUser?.id) {
      onDeleteComment(commentId);
    }
  };

  return (
    <div style={{ marginTop: 8 }}>
      {/* Comment list */}
      {(commentCount > 0 || comments.length > 0) && (
        <div
          style={{
            background: '#f7f7f7',
            borderRadius: 4,
            padding: '6px 10px',
            marginBottom: 4,
          }}
        >
          {shownComments.map((c) => (
            <div
              key={c.id}
              style={{ padding: '2px 0', fontSize: 13, lineHeight: '18px' }}
              onContextMenu={(e) => { e.preventDefault(); handleLongPress(c.id, c.userId); }}
            >
              <Typography.Text strong style={{ fontSize: 13, color: '#576b95' }}>
                {c.user.nickname}
              </Typography.Text>
              {c.replyTo && (
                <Typography.Text style={{ fontSize: 13, color: '#576b95' }}>
                  {' 回复 '}{c.replyTo.nickname}
                </Typography.Text>
              )}
              <Typography.Text style={{ fontSize: 13 }}>: {c.content}</Typography.Text>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 11, marginLeft: 6, cursor: 'pointer' }}
                onClick={() => handleReply(c)}
              >
                回复
              </Typography.Text>
            </div>
          ))}
          {hiddenCount > 0 && !expanded && (
            <Typography.Link
              style={{ fontSize: 12 }}
              onClick={() => setExpanded(true)}
            >
              查看全部{commentCount}条评论
            </Typography.Link>
          )}
          {expanded && hiddenCount > 0 && (
            <Typography.Link
              style={{ fontSize: 12 }}
              onClick={() => setExpanded(false)}
            >
              收起
            </Typography.Link>
          )}
        </div>
      )}

      {/* Comment input toggle */}
      {!showInput && (
        <Typography.Link
          style={{ fontSize: 13 }}
          onClick={() => { setReplyTarget(null); setShowInput(true); }}
        >
          评论
        </Typography.Link>
      )}

      {/* Comment input */}
      {showInput && (
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
          {replyTarget && (
            <Typography.Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              回复 {replyTarget.nickname}:
            </Typography.Text>
          )}
          <Input
            size="small"
            placeholder="评论..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onPressEnter={handleSubmit}
            style={{ flex: 1 }}
            autoFocus
          />
          <Button size="small" type="primary" onClick={handleSubmit}>
            发送
          </Button>
          <Button
            size="small"
            onClick={() => { setShowInput(false); setReplyTarget(null); setInputValue(''); }}
          >
            取消
          </Button>
        </div>
      )}
    </div>
  );
}
