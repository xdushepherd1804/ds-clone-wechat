import { useState } from 'react';

interface StickerMessageProps {
  url: string;
  alt?: string;
  size?: number;
}

export function StickerMessage({ url, alt = '贴图', size = 120 }: StickerMessageProps) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5f5',
          borderRadius: 8,
          color: '#999',
          fontSize: 12,
        }}
      >
        [贴图]
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {!loaded && (
        <div
          style={{
            width: size,
            height: size,
            background: '#f5f5f5',
            borderRadius: 8,
            position: 'absolute',
            top: 0,
            left: 0,
          }}
        />
      )}
      <img
        src={url}
        alt={alt}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        style={{
          width: size,
          height: size,
          objectFit: 'contain',
          borderRadius: 8,
          display: loaded ? 'block' : 'none',
        }}
      />
    </div>
  );
}
