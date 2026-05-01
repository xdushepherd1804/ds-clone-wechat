import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Radio, Typography, Space, message } from 'antd';
import {
  ArrowLeftOutlined,
  PictureOutlined,
  EnvironmentOutlined,
  DeleteOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import { useMomentsStore } from '@/store';
import type { MomentVisibility } from '@/types';
import { CONFIG } from '@wechat-clone/shared';

const { TextArea } = Input;

export function MomentPublishPage() {
  const navigate = useNavigate();
  const { createMoment } = useMomentsStore();

  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [location, setLocation] = useState('');
  const [visibility, setVisibility] = useState<MomentVisibility>('public');
  const [publishing, setPublishing] = useState(false);
  const [showLocation, setShowLocation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = CONFIG.MOMENT.MAX_IMAGES - images.length;
    const toAdd = Array.from(files).slice(0, remaining);

    toAdd.forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages((prev) => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });

    if (files.length > remaining) {
      message.warning(`最多只能上传${CONFIG.MOMENT.MAX_IMAGES}张图片`);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handlePublish = async () => {
    if (!content.trim() && images.length === 0) {
      message.warning('请输入内容或选择图片');
      return;
    }

    if (content.length > CONFIG.MOMENT.MAX_CONTENT_LENGTH) {
      message.warning(`内容不能超过${CONFIG.MOMENT.MAX_CONTENT_LENGTH}字`);
      return;
    }

    setPublishing(true);
    try {
      await createMoment({
        content: content.trim() || undefined,
        images: images.length > 0 ? images : undefined,
        location: location.trim() || undefined,
        visibility,
      });
      message.success('发布成功');
      navigate('/moments', { replace: true });
    } catch {
      message.error('发布失败，请重试');
    } finally {
      setPublishing(false);
    }
  };

  const cols = images.length <= 1 ? 1 : images.length === 2 ? 2 : 3;

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: '#fff' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate(-1)}
        >
          返回
        </Button>
        <Typography.Text strong style={{ fontSize: 17 }}>
          发表动态
        </Typography.Text>
        <Button
          type="primary"
          onClick={handlePublish}
          loading={publishing}
          style={{ borderRadius: 6 }}
        >
          发布
        </Button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <TextArea
          rows={5}
          placeholder="这一刻的想法..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={CONFIG.MOMENT.MAX_CONTENT_LENGTH}
          showCount
          variant="borderless"
          style={{ resize: 'none', fontSize: 16 }}
        />

        {/* Image grid */}
        {images.length > 0 && (
          <div
            style={{
              marginTop: 12,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 6,
              maxWidth: cols === 1 ? 200 : cols === 2 ? 280 : 380,
            }}
          >
            {images.map((url, i) => (
              <div key={i} style={{ position: 'relative', aspectRatio: '1' }}>
                <img
                  src={url}
                  alt={`preview ${i + 1}`}
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    borderRadius: 4,
                  }}
                />
                <DeleteOutlined
                  onClick={() => handleRemoveImage(i)}
                  style={{
                    position: 'absolute',
                    top: -6,
                    right: -6,
                    background: 'rgba(0,0,0,0.5)',
                    color: '#fff',
                    borderRadius: '50%',
                    padding: 3,
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                />
              </div>
            ))}
            {images.length < CONFIG.MOMENT.MAX_IMAGES && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  aspectRatio: '1',
                  border: '1px dashed #d9d9d9',
                  borderRadius: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  color: '#999',
                }}
              >
                <PlusOutlined style={{ fontSize: 24 }} />
              </div>
            )}
          </div>
        )}

        {/* Add image button (when no images yet) */}
        {images.length === 0 && (
          <div style={{ marginTop: 16 }}>
            <Button
              icon={<PictureOutlined />}
              onClick={() => fileInputRef.current?.click()}
              type="text"
              style={{ color: '#576b95' }}
            >
              添加图片
            </Button>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              最多{CONFIG.MOMENT.MAX_IMAGES}张
            </Typography.Text>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Footer options */}
      <div
        style={{
          padding: '12px 16px',
          borderTop: '1px solid #f0f0f0',
          background: '#fff',
        }}
      >
        {/* Location */}
        <div style={{ marginBottom: 12 }}>
          {!showLocation ? (
            <Button
              type="text"
              icon={<EnvironmentOutlined />}
              onClick={() => setShowLocation(true)}
              style={{ color: '#576b95' }}
            >
              所在位置
            </Button>
          ) : (
            <Space>
              <Input
                size="small"
                placeholder="输入位置"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                style={{ width: 200 }}
              />
              <Button
                size="small"
                onClick={() => { setShowLocation(false); setLocation(''); }}
              >
                取消
              </Button>
            </Space>
          )}
        </div>

        {/* Visibility */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            谁可以看：
          </Typography.Text>
          <Radio.Group
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            size="small"
          >
            <Radio.Button value="public">公开</Radio.Button>
            <Radio.Button value="friends">好友可见</Radio.Button>
            <Radio.Button value="private">私密</Radio.Button>
          </Radio.Group>
        </div>
      </div>
    </div>
  );
}
