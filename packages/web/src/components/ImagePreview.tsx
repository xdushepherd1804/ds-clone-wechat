import { useState, useCallback, useEffect } from 'react';
import { LeftOutlined, RightOutlined, CloseOutlined } from '@ant-design/icons';
import { Spin } from 'antd';

interface ImagePreviewProps {
  images: string[];
  current: number;
  visible: boolean;
  onClose: () => void;
  onChange?: (index: number) => void;
}

export function ImagePreview({
  images,
  current: initialIndex,
  visible,
  onClose,
  onChange,
}: ImagePreviewProps) {
  const [index, setIndex] = useState(initialIndex);
  const [loading, setLoading] = useState(true);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => {
    setIndex(initialIndex);
    setLoading(true);
  }, [visible, initialIndex]);

  useEffect(() => {
    onChange?.(index);
  }, [index, onChange]);

  const goNext = useCallback(() => {
    if (index < images.length - 1) {
      setIndex(index + 1);
      setLoading(true);
    }
  }, [index, images.length]);

  const goPrev = useCallback(() => {
    if (index > 0) {
      setIndex(index - 1);
      setLoading(true);
    }
  }, [index]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    },
    [onClose, goPrev, goNext],
  );

  useEffect(() => {
    if (visible) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
      };
    }
  }, [visible, handleKeyDown]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = e.changedTouches[0].clientX - touchStart;
    if (diff > 60) goPrev();
    else if (diff < -60) goNext();
    setTouchStart(null);
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.95)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Close button */}
      <CloseOutlined
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          fontSize: 24,
          color: '#fff',
          cursor: 'pointer',
          zIndex: 1,
        }}
      />

      {/* Prev button */}
      {index > 0 && (
        <LeftOutlined
          onClick={goPrev}
          style={{
            position: 'absolute',
            left: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 32,
            color: '#fff',
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      )}

      {/* Image */}
      <div
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {loading && (
          <Spin size="large" style={{ position: 'absolute' }} />
        )}
        <img
          src={images[index]}
          alt={`preview ${index + 1}`}
          draggable={false}
          onLoad={() => setLoading(false)}
          style={{
            maxWidth: '90vw',
            maxHeight: '90vh',
            objectFit: 'contain',
            display: loading ? 'none' : 'block',
          }}
        />
      </div>

      {/* Next button */}
      {index < images.length - 1 && (
        <RightOutlined
          onClick={goNext}
          style={{
            position: 'absolute',
            right: 20,
            top: '50%',
            transform: 'translateY(-50%)',
            fontSize: 32,
            color: '#fff',
            cursor: 'pointer',
            zIndex: 1,
          }}
        />
      )}

      {/* Counter */}
      <div
        style={{
          position: 'absolute',
          bottom: 30,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#fff',
          fontSize: 14,
        }}
      >
        {index + 1} / {images.length}
      </div>
    </div>
  );
}
