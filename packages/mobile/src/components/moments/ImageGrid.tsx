import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, spacing, fonts } from '@/theme';

interface ImageGridProps {
  images: string[];
  onPressImage?: (index: number) => void;
}

export default function ImageGrid({ images, onPressImage }: ImageGridProps) {
  if (!images || images.length === 0) return null;

  if (images.length === 1) {
    return (
      <TouchableOpacity
        style={styles.singleContainer}
        onPress={() => onPressImage?.(0)}
        activeOpacity={0.8}
      >
        <View style={styles.singleImage}>
          <Text style={styles.imagePlaceholder}>📷</Text>
        </View>
      </TouchableOpacity>
    );
  }

  if (images.length === 2) {
    return (
      <View style={styles.row}>
        {images.map((url, index) => (
          <TouchableOpacity
            key={index}
            style={styles.twoImage}
            onPress={() => onPressImage?.(index)}
            activeOpacity={0.8}
          >
            <View style={styles.imageBox}>
              <Text style={styles.imagePlaceholder}>📷</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // 3+ images: 3-column grid
  return (
    <View style={styles.gridContainer}>
      {images.map((url, index) => (
        <TouchableOpacity
          key={index}
          style={styles.gridItem}
          onPress={() => onPressImage?.(index)}
          activeOpacity={0.8}
        >
          <View style={styles.imageBox}>
            <Text style={styles.imagePlaceholder}>📷</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const IMAGE_SIZE = 80;
const GRID_SPACING = 4;

const styles = StyleSheet.create({
  singleContainer: {
    marginTop: spacing.sm,
  },
  singleImage: {
    width: 150,
    height: 150,
    borderRadius: 4,
    backgroundColor: colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: {
    flexDirection: 'row',
    marginTop: spacing.sm,
    gap: GRID_SPACING,
  },
  twoImage: {
    flex: 1,
    maxWidth: '48%',
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.sm,
    gap: GRID_SPACING,
  },
  gridItem: {
    width: IMAGE_SIZE,
    height: IMAGE_SIZE,
  },
  imageBox: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.borderLight,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholder: {
    fontSize: 24,
  },
});
