import { useState } from 'react';
import { Image } from 'antd';

interface ImageGridProps {
  images: string[];
  onPreview?: (images: string[], index: number) => void;
}

export function ImageGrid({ images, onPreview }: ImageGridProps) {
  if (!images || images.length === 0) return null;

  const count = images.length;
  const cols = count === 1 ? 1 : count === 2 ? 2 : 3;
  const gap = 4;

  const handleClick = (index: number) => {
    if (onPreview) {
      onPreview(images, index);
    }
  };

  if (count === 1) {
    return (
      <div
        style={{
          marginTop: 8,
          borderRadius: 4,
          overflow: 'hidden',
          cursor: 'pointer',
          maxWidth: 240,
        }}
        onClick={() => handleClick(0)}
      >
        <Image
          src={images[0]}
          alt="moment image"
          preview={false}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: 300,
            objectFit: 'cover',
            display: 'block',
          }}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 8,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap,
        maxWidth: cols === 2 ? 320 : 420,
      }}
    >
      {images.map((url, i) => (
        <div
          key={i}
          style={{
            aspectRatio: '1',
            overflow: 'hidden',
            borderRadius: 2,
            cursor: 'pointer',
            background: '#f5f5f5',
          }}
          onClick={() => handleClick(i)}
        >
          <Image
            src={url}
            alt={`moment image ${i + 1}`}
            preview={false}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        </div>
      ))}
    </div>
  );
}
