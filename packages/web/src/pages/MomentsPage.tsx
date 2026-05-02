import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Typography, Spin, Empty, Button } from 'antd';
import { PlusOutlined, CameraOutlined, ReloadOutlined } from '@ant-design/icons';
import { useMomentsStore, useUserStore } from '@/store';
import { MomentCard } from '@/components/MomentCard';

export function MomentsPage() {
  const navigate = useNavigate();
  const currentUser = useUserStore((s) => s.user);
  const {
    moments,
    loading,
    loadingMore,
    hasMore,
    error,
    fetchTimeline,
    fetchMore,
    refresh,
    toggleLike,
    addComment,
    deleteComment,
    deleteMoment,
  } = useMomentsStore();

  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      fetchTimeline();
    }
  }, [fetchTimeline]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    if (scrollHeight - scrollTop - clientHeight < 200 && hasMore && !loadingMore) {
      fetchMore();
    }
  }, [hasMore, loadingMore, fetchMore]);

  const handleToggleLike = useCallback(
    (momentId: string) => {
      toggleLike(momentId);
    },
    [toggleLike],
  );

  const handleComment = useCallback(
    (momentId: string, content: string, replyToId?: string) => {
      addComment(momentId, content, replyToId);
    },
    [addComment],
  );

  const handleDeleteComment = useCallback(
    (momentId: string, commentId: string) => {
      deleteComment(momentId, commentId);
    },
    [deleteComment],
  );

  return (
    <div
      ref={scrollRef}
      onScroll={handleScroll}
      style={{
        height: 'calc(100vh - 64px)',
        overflowY: 'auto',
        background: '#f5f5f5',
      }}
    >
      {/* Cover */}
      <div
        style={{
          height: 200,
          background: 'linear-gradient(180deg, #2c3e50 0%, #34495e 50%, #3d566e 100%)',
          position: 'relative',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '0 20px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 6,
              background: '#07c160',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '3px solid #fff',
              overflow: 'hidden',
            }}
          >
            {currentUser?.avatar ? (
              <img src={currentUser.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span style={{ fontSize: 28, color: '#fff', fontWeight: 600 }}>
                {currentUser?.nickname?.[0] || '我'}
              </span>
            )}
          </div>
          <div style={{ color: '#fff' }}>
            <div style={{ fontSize: 18, fontWeight: 600 }}>
              {currentUser?.nickname || '朋友圈'}
            </div>
          </div>
        </div>

        {/* Publish button */}
        <Button
          type="primary"
          icon={<CameraOutlined />}
          onClick={() => navigate('/moments/new')}
          style={{
            position: 'absolute',
            right: 20,
            bottom: 24,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.2)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff',
            backdropFilter: 'blur(8px)',
          }}
        >
          发布
        </Button>
      </div>

      {/* Timeline */}
      {loading && moments.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <Spin size="large" />
        </div>
      ) : error && moments.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Typography.Text type="secondary">{error}</Typography.Text>
          <br />
          <Button
            icon={<ReloadOutlined />}
            onClick={fetchTimeline}
            style={{ marginTop: 12 }}
          >
            重试
          </Button>
        </div>
      ) : moments.length === 0 ? (
        <div style={{ padding: 60 }}>
          <Empty description="暂时没有动态">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => navigate('/moments/new')}
            >
              发布第一条动态
            </Button>
          </Empty>
        </div>
      ) : (
        <>
          {/* Pull-to-refresh indicator */}
          {refreshing && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Spin size="small" />
            </div>
          )}
          <div
            style={{
              textAlign: 'center',
              padding: '8px 0',
              cursor: 'pointer',
              background: '#fff',
              borderBottom: '1px solid #f0f0f0',
            }}
            onClick={handleRefresh}
          >
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              <ReloadOutlined spin={refreshing} style={{ marginRight: 4 }} />
              刷新
            </Typography.Text>
          </div>
          {moments.filter(Boolean).map((moment) => (
            <MomentCard
              key={moment.id}
              moment={moment}
              onLike={handleToggleLike}
              onComment={handleComment}
              onDeleteComment={handleDeleteComment}
              onDelete={deleteMoment}
            />
          ))}
          {loadingMore && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Spin size="small" />
            </div>
          )}
          {!hasMore && moments.length > 0 && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                没有更多了
              </Typography.Text>
            </div>
          )}
        </>
      )}
    </div>
  );
}
