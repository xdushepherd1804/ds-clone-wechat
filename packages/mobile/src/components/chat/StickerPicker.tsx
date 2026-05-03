import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Modal,
} from 'react-native';
import { EMOJI_CATEGORIES, ALL_EMOJIS } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const EMOJI_SIZE = (SCREEN_WIDTH - spacing.lg * 2) / 8;

interface StickerPickerProps {
  visible: boolean;
  onClose: () => void;
  onSelectSticker: (sticker: string) => void;
}

export default function StickerPicker({
  visible,
  onClose,
  onSelectSticker,
}: StickerPickerProps) {
  const [activeCategory, setActiveCategory] = useState(0);

  const categories = useMemo(() => EMOJI_CATEGORIES, []);
  const currentEmojis = useMemo(() => {
    return categories[activeCategory]?.emojis || [];
  }, [activeCategory, categories]);

  const handleEmojiPress = (emoji: string) => {
    onSelectSticker(emoji);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.dismissArea}
          onPress={onClose}
          activeOpacity={1}
        />
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>表情</Text>
            <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Category tabs */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.categoryBar}
            contentContainerStyle={styles.categoryContent}
          >
            {categories.map((cat, index) => (
              <TouchableOpacity
                key={cat.name}
                style={[
                  styles.categoryTab,
                  activeCategory === index && styles.categoryTabActive,
                ]}
                onPress={() => setActiveCategory(index)}
                activeOpacity={0.7}
              >
                <Text style={styles.categoryIcon}>{cat.icon}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Emoji grid */}
          <ScrollView
            style={styles.emojiGrid}
            contentContainerStyle={styles.emojiGridContent}
            showsVerticalScrollIndicator={false}
          >
            {currentEmojis.length > 0 ? (
              <View style={styles.emojiRow}>
                {currentEmojis.map((emoji, index) => (
                  <TouchableOpacity
                    key={`${emoji}-${index}`}
                    style={styles.emojiItem}
                    onPress={() => handleEmojiPress(emoji)}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>没有找到匹配的表情</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dismissArea: {
    flex: 1,
  },
  container: {
    height: 350,
    backgroundColor: colors.white,
    borderTopLeftRadius: sizes.borderRadiusLg,
    borderTopRightRadius: sizes.borderRadiusLg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: fonts.lg,
    fontWeight: '600',
    color: colors.text,
  },
  closeIcon: {
    fontSize: fonts.lg,
    color: colors.textSecondary,
    paddingHorizontal: spacing.sm,
  },
  categoryBar: {
    maxHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  categoryContent: {
    paddingHorizontal: spacing.sm,
  },
  categoryTab: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: spacing.xs,
    borderRadius: sizes.borderRadius,
  },
  categoryTabActive: {
    backgroundColor: colors.inputBg,
  },
  categoryIcon: {
    fontSize: fonts.xl,
  },
  emojiGrid: {
    flex: 1,
  },
  emojiGridContent: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  emojiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  emojiItem: {
    width: EMOJI_SIZE,
    height: EMOJI_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emojiText: {
    fontSize: fonts.xl + 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  emptyText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
});
