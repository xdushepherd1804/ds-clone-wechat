import { useState } from 'react';
import { useChatStore } from '@/store';
import { CloseOutlined, ZoomInOutlined, ZoomOutOutlined, RotateRightOutlined } from '@ant-design/icons';

export default function ImageViewer() {
  const { visible, images, current } = useChatStore((s) => s.imageViewer);
  const { closeImageViewer, setImageViewerIndex } = useChatStore.getState();
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  if (!visible || images.length === 0) return null;

  const handlePrev = () => {
    setScale(1);
    setRotation(0);
    setImageViewerIndex(current > 0 ? current - 1 : images.length - 1);
  };

  const handleNext = () => {
    setScale(1);
    setRotation(0);
    setImageViewerIndex(current < images.length - 1 ? current + 1 : 0);
  };

  const handleClose = () => {
    setScale(1);
    setRotation(0);
    closeImageViewer();
  };

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 5));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 0.5));
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.9)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          display: 'flex',
          gap: 12,
          zIndex: 1,
        }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
          style={toolbarBtnStyle}
          title="放大"
        >
          <ZoomInOutlined style={{ color: '#fff', fontSize: 20 }} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
          style={toolbarBtnStyle}
          title="缩小"
        >
          <ZoomOutOutlined style={{ color: '#fff', fontSize: 20 }} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleRotate(); }}
          style={toolbarBtnStyle}
          title="旋转"
        >
          <RotateRightOutlined style={{ color: '#fff', fontSize: 20 }} />
        </button>
        <button onClick={handleClose} style={toolbarBtnStyle} title="关闭">
          <CloseOutlined style={{ color: '#fff', fontSize: 20 }} />
        </button>
      </div>

      {images.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); handlePrev(); }}
            style={{ ...navBtnStyle, left: 16 }}
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleNext(); }}
            style={{ ...navBtnStyle, right: 16 }}
          >
            ›
          </button>
        </>
      )}

      <img
        src={images[current]}
        alt="preview"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '90%',
          maxHeight: '90%',
          objectFit: 'contain',
          transform: `scale(${scale}) rotate(${rotation}deg)`,
          transition: 'transform 0.2s',
          cursor: 'pointer',
        }}
      />

      {images.length > 1 && (
        <div style={{ color: '#fff', marginTop: 16, fontSize: 13, opacity: 0.7 }}>
          {current + 1} / {images.length}
        </div>
      )}
    </div>
  );
}

const toolbarBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  borderRadius: 6,
  width: 40,
  height: 40,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
};

const navBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-50%)',
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  borderRadius: '50%',
  width: 48,
  height: 48,
  color: '#fff',
  fontSize: 30,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
