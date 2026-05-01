import { useState, useCallback } from 'react';
import { Avatar, Typography, Dropdown, MenuProps } from 'antd';
import { DeleteOutlined, EnvironmentOutlined } from '@ant-design/icons';
import type { MomentItem } from '@/types';
import { useUserStore } from '@/store';
import { ImageGrid } from './ImageGrid';
import { LikeButton } from './LikeButton';
import { CommentSection } from './CommentSection';
import { ImagePreview } from './ImagePreview';

interface MomentCardProps {
  moment: MomentItem;
  onLike: (momentId: string) => void;
  onComment: (momentId: string, content: string, replyToId?: string) => void;
  onDeleteComment: (momentId: string, commentId: string) => void;
  onDelete?: (momentId: string) => void;
}

function formatTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 172800) return '昨天';
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export function MomentCard({
  moment,
  onLike,
  onComment,
  onDeleteComment,
  onDelete,
}: MomentCardProps) {
  const currentUser = useUserStore((s) => s.user);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [contentExpanded, setContentExpanded] = useState(false);
  const [lastTapTime, setLastTapTime] = useState(0);

  const isLiked = moment.likes?.some((l) => l.userId === currentUser?.id) ?? false;
  const isOwner = moment.userId === currentUser?.id;
  const hasLongContent = (moment.content?.length ?? 0) > 120;

  const handlePreview = useCallback((images: string[], index: number) => {
    setPreviewIndex(index);
    setPreviewVisible(true);
  }, []);

  const handleLike = useCallback(() => {
    onLike(moment.id);
  }, [moment.id, onLike]);

  const handleComment = useCallback(
    (content: string, replyToId?: string) => {
      onComment(moment.id, content, replyToId);
    },
    [moment.id, onComment],
  );

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      onDeleteComment(moment.id, commentId);
    },
    [moment.id, onDeleteComment],
  );

  const handleCardTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTapTime < 300) {
      handleLike();
    }
    setLastTapTime(now);
  }, [lastTapTime, handleLike]);

  const deleteMenuItems: MenuProps['items'] = [
    {
      key: 'delete',
      label: '删除',
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onDelete?.(moment.id),
    },
  ];

  const contentStyle: React.CSSProperties = {
    fontSize: 15,
    lineHeight: '22px',
    whiteSpace: contentExpanded ? 'normal' : undefined,
    overflow: contentExpanded ? 'visible' : 'hidden',
    display: contentExpanded ? 'block' : '-webkit-box',
    WebkitLineClamp: contentExpanded ? undefined : 6,
    WebkitBoxOrient: contentExpanded ? undefined : 'vertical',
    cursor: hasLongContent ? 'pointer' : undefined,
  };

  return (
    <>
      <div
        style={{
          background: '#fff',
          padding: '16px 16px 12px',
          borderBottom: '1px solid #f0f0f0',
        }}
        onClick={handleCardTap}
      >
        {/* Header: avatar + name */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <Avatar
            src={moment.user.avatar}
            size={42}
            style={{ flexShrink: 0, background: '#07c160' }}
          >
            {moment.user.nickname?.[0]}
          </Avatar>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography.Text strong style={{ fontSize: 15, color: '#576b95' }}>
                {moment.user.nickname}
              </Typography.Text>
              {isOwner && (
                <Dropdown menu={{ items: deleteMenuItems }} trigger={['click']}>
                  <DeleteOutlined
                    style={{ fontSize: 14, color: '#999', cursor: 'pointer' }}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Dropdown>
              )}
            </div>

            {/* Content */}
            {moment.content && (
              <div style={{ marginTop: 6 }}>
                <Typography.Paragraph
                  style={contentStyle}
                  onClick={
                    hasLongContent && !contentExpanded
                      ? (e) => { e.stopPropagation(); setContentExpanded(true); }
                      : undefined
                  }
                >
                  {moment.content}
                </Typography.Paragraph>
                {hasLongContent && !contentExpanded && (
                  <Typography.Link
                    style={{ fontSize: 13 }}
                    onClick={(e) => { e.stopPropagation(); setContentExpanded(true); }}
                  >
                    全文
                  </Typography.Link>
                )}
              </div>
            )}

            {/* Images */}
            <ImageGrid images={moment.images} onPreview={handlePreview} />

            {/* Location + Time */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {moment.location && (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    <EnvironmentOutlined style={{ marginRight: 2 }} />
                    {moment.location}
                  </Typography.Text>
                )}
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {formatTime(moment.createdAt)}
                </Typography.Text>
              </div>
            </div>

            {/* Action bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                marginTop: 8,
                paddingTop: 8,
                borderTop: '1px solid #f5f5f5',
              }}
            >
              <LikeButton liked={isLiked} likeCount={moment.likeCount} onToggle={handleLike} />
            </div>

            {/* Likes preview */}
            {moment.likes && moment.likes.length > 0 && (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <HeartIcon />
                <Typography.Text style={{ fontSize: 12, color: '#576b95' }}>
                  {moment.likes.slice(0, 10).map((l) => l.user.nickname).join(', ')}
                  {moment.likeCount > 10 ? ` 等${moment.likeCount}人` : ''}
                </Typography.Text>
              </div>
            )}

            {/* Comments */}
            <CommentSection
              momentId={moment.id}
              comments={moment.comments}
              commentCount={moment.commentCount}
              onAddComment={handleComment}
              onDeleteComment={handleDeleteComment}
            />
          </div>
        </div>
      </div>

      <ImagePreview
        images={moment.images}
        current={previewIndex}
        visible={previewVisible}
        onClose={() => setPreviewVisible(false)}
      />
    </>
  );
}

function HeartIcon() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: 14,
        height: 14,
        background: '#e74c3c',
        borderRadius: '50% 50% 0 0',
        position: 'relative',
        transform: 'rotate(-45deg)',
        marginRight: 4,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: '30%',
          left: 0,
          width: 14,
          height: 14,
          background: '#e74c3c',
          borderRadius: '50%',
          transform: 'rotate(90deg)',
        }}
      />
    </span>
  );
}
