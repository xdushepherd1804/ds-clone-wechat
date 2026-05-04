import React, { useRef } from 'react';
import {
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import { colors, spacing, fonts } from '@/theme';

interface LikeButtonProps {
  liked: boolean;
  count: number;
  onPress: () => void;
}

export default function LikeButton({ liked, count, onPress }: LikeButtonProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 1.3,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
    onPress();
  };

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <Animated.Text
        style={[
          styles.icon,
          liked && styles.iconLiked,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        {liked ? '❤️' : '🤍'}
      </Animated.Text>
      {count > 0 ? (
        <Text style={[styles.count, liked && styles.countLiked]}>
          {count}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  icon: {
    fontSize: 18,
  },
  iconLiked: {
    // heart stays red via emoji
  },
  count: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  countLiked: {
    color: colors.danger,
  },
});
