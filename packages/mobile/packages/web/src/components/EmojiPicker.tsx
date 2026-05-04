import { useState, useEffect, useCallback, useRef } from 'react';
import { EMOJI_CATEGORIES, searchEmojis } from '@wechat-clone/shared';
import { useRecentEmojis } from '@/hooks/useRecentEmojis';
import { getStickers, getFavoriteStickers } from '@/api/sticker';
import type { Sticker } from '@wechat-clone/shared';

type BottomTab = 'recent' | 'favorites' | 'custom' | null;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  visible: boolean;
  onClose: () => void;
}

export default function EmojiPicker({ onSelect, visible, onClose }: EmojiPickerProps) {
  const [activeEmojiTab, setActiveEmojiTab] = useState(0);
  const [bottomTab, setBottomTab] = useState<BottomTab>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const { recentEmojis, addRecentEmoji } = useRecentEmojis();
  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [favorites, setFavorites] = useState<Sticker[]>([]);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible && bottomTab === 'custom') {
      getStickers().then((res) => setStickers(res.stickers)).catch(() => {});
    }
  }, [visible, bottomTab]);

  useEffect(() => {
    if (visible && bottomTab === 'favorites') {
      getFavoriteStickers().then((res) => setFavorites(res.stickers)).catch(() => {});
    }
  }, [visible, bottomTab]);

  const handleEmojiClick = useCallback(
    (emoji: string) => {
      onSelect(emoji);
      addRecentEmoji(emoji);
      onClose();
    },
    [onSelect, addRecentEmoji, onClose],
  );

  const handleStickerClick = useCallback(
    (sticker: Sticker) => {
      onSelect(sticker.url);
      onClose();
    },
    [onSelect, onClose],
  );

  if (!visible) return null;

  const searchResults = searchQuery.trim() ? searchEmojis(searchQuery.trim()) : null;

  const bottomTabs: { key: BottomTab; label: string }[] = [
    { key: 'recent', label: '最近' },
    { key: 'favorites', label: '收藏' },
    { key: 'custom', label: '自定义' },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        marginBottom: 8,
        background: '#fff',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
        width: 380,
        zIndex: 1000,
        overflow: 'hidden',
      }}
    >
      {/* Search bar */}
      <div style={{ padding: '6px 8px', borderBottom: '1px solid #f0f0f0' }}>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="搜索表情..."
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setBottomTab(null);
          }}
          style={{
            width: '100%',
            border: '1px solid #e8e8e8',
            borderRadius: 6,
            padding: '4px 10px',
            fontSize: 13,
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={() => setBottomTab(null)}
        />
      </div>

      {/* Category tabs */}
      {!searchResults && !bottomTab && (
        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
          {EMOJI_CATEGORIES.map((cat, idx) => (
            <button
              key={cat.name}
              onClick={() => { setActiveEmojiTab(idx); setSearchQuery(''); }}
              title={cat.name}
              style={{
                flex: 1,
                padding: '6px 0',
                border: 'none',
                background: activeEmojiTab === idx ? '#e6f7ff' : 'transparent',
                fontSize: 18,
                cursor: 'pointer',
                borderBottom: activeEmojiTab === idx ? '2px solid #1890ff' : '2px solid transparent',
                lineHeight: 1,
              }}
            >
              {cat.icon}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(9, 1fr)',
          gap: 2,
          padding: 6,
          maxHeight: 260,
          overflowY: 'auto',
        }}
      >
        {searchResults
          ? searchResults.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiClick(emoji)}
                style={emojiBtnStyle}
                onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0f0f0'; }}
                onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
              >
                {emoji}
              </button>
            ))
          : bottomTab === 'recent'
            ? recentEmojis.length > 0
              ? recentEmojis.map((emoji) => (
                  <button
                    key={emoji}
                    onClick={() => handleEmojiClick(emoji)}
                    style={emojiBtnStyle}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0f0f0'; }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                  >
                    {emoji}
                  </button>
                ))
              : <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#999', fontSize: 13 }}>暂无最近使用的表情</div>
            : bottomTab === 'favorites'
              ? favorites.length > 0
                ? favorites.map((sticker) => (
                    <button
                      key={sticker.id}
                      onClick={() => handleStickerClick(sticker)}
                      style={{ ...emojiBtnStyle, padding: 2 }}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0f0f0'; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                    >
                      <img
                        src={sticker.url}
                        alt={sticker.name}
                        style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }}
                      />
                    </button>
                  ))
                : <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#999', fontSize: 13 }}>暂无收藏贴图</div>
              : bottomTab === 'custom'
                ? stickers.length > 0
                  ? stickers.map((sticker) => (
                      <button
                        key={sticker.id}
                        onClick={() => handleStickerClick(sticker)}
                        style={{ ...emojiBtnStyle, padding: 2 }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0f0f0'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                      >
                        <img
                          src={sticker.url}
                          alt={sticker.name}
                          style={{ width: 36, height: 36, objectFit: 'contain', borderRadius: 4 }}
                        />
                      </button>
                    ))
                  : <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#999', fontSize: 13 }}>暂无自定义贴图，请上传</div>
                : (EMOJI_CATEGORIES[activeEmojiTab]?.emojis || []).map((emoji) => (
                    <button
                      key={emoji}
                      onClick={() => handleEmojiClick(emoji)}
                      style={emojiBtnStyle}
                      onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0f0f0'; }}
                      onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                    >
                      {emoji}
                    </button>
                  ))}
      </div>

      {/* Bottom tabs: 最近 / 收藏 / 自定义 */}
      <div style={{ display: 'flex', borderTop: '1px solid #f0f0f0' }}>
        {bottomTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => {
              setBottomTab(bottomTab === tab.key ? null : tab.key);
              setSearchQuery('');
            }}
            style={{
              flex: 1,
              padding: '8px 0',
              border: 'none',
              background: bottomTab === tab.key ? '#e6f7ff' : 'transparent',
              color: bottomTab === tab.key ? '#1890ff' : '#666',
              fontSize: 12,
              cursor: 'pointer',
              borderTop: bottomTab === tab.key ? '2px solid #1890ff' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const emojiBtnStyle: React.CSSProperties = {
  fontSize: 22,
  padding: 2,
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  borderRadius: 4,
  lineHeight: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: 36,
};
