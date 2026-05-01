import { useState, useCallback } from 'react';
import { HeartOutlined, HeartFilled } from '@ant-design/icons';

interface LikeButtonProps {
  liked: boolean;
  likeCount: number;
  onToggle: () => void;
}

const animKeyframes = `
@keyframes likePop {
  0% { transform: scale(1); }
  25% { transform: scale(1.3); }
  50% { transform: scale(0.9); }
  75% { transform: scale(1.15); }
  100% { transform: scale(1); }
}
`;

let styleInjected = false;
function injectStyle() {
  if (styleInjected) return;
  if (typeof document !== 'undefined') {
    const el = document.createElement('style');
    el.textContent = animKeyframes;
    document.head.appendChild(el);
    styleInjected = true;
  }
}
injectStyle();

export function LikeButton({ liked, likeCount, onToggle }: LikeButtonProps) {
  const [animating, setAnimating] = useState(false);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (animating) return;
      setAnimating(true);
      onToggle();
      setTimeout(() => setAnimating(false), 400);
    },
    [onToggle, animating],
  );

  return (
    <span
      onClick={handleClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        cursor: 'pointer',
        color: liked ? '#e74c3c' : '#999',
        fontSize: 15,
        userSelect: 'none',
        animation: animating ? 'likePop 0.4s ease' : undefined,
      }}
    >
      {liked ? <HeartFilled /> : <HeartOutlined />}
      {likeCount > 0 && (
        <span style={{ fontSize: 13, color: liked ? '#e74c3c' : '#999' }}>
          {likeCount}
        </span>
      )}
    </span>
  );
}
