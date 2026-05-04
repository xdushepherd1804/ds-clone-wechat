import { useState, useCallback } from 'react';

const STORAGE_KEY = 'recent_emojis';
const MAX_RECENT = 30;

function loadRecentEmojis(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return parsed.slice(0, MAX_RECENT);
    }
  } catch {
    // corrupted data, reset
  }
  return [];
}

function saveRecentEmojis(emojis: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emojis));
  } catch {
    // storage full or unavailable
  }
}

export function useRecentEmojis() {
  const [recentEmojis, setRecentEmojis] = useState<string[]>(loadRecentEmojis);

  const addRecentEmoji = useCallback((emoji: string) => {
    setRecentEmojis((prev) => {
      const filtered = prev.filter((e) => e !== emoji);
      const updated = [emoji, ...filtered].slice(0, MAX_RECENT);
      saveRecentEmojis(updated);
      return updated;
    });
  }, []);

  const clearRecentEmojis = useCallback(() => {
    setRecentEmojis([]);
    saveRecentEmojis([]);
  }, []);

  return { recentEmojis, addRecentEmoji, clearRecentEmojis };
}
