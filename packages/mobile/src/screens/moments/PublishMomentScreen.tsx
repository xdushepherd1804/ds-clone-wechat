import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing, fonts, sizes } from '@/theme';
import { useMomentsStore } from '@/store/momentsStore';

export default function PublishMomentScreen() {
  const navigation = useNavigation();
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);
  const createMoment = useMomentsStore((s) => s.createMoment);

  const canPublish = content.trim().length > 0;

  const handlePublish = async () => {
    if (!canPublish || publishing) return;
    setPublishing(true);
    try {
      await createMoment({ content: content.trim() });
      navigation.goBack();
    } catch {
      Alert.alert('发布失败', '请稍后重试');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          placeholder="分享生活中的点滴..."
          placeholderTextColor={colors.textTertiary}
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
          autoFocus
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.imageButton]}
          activeOpacity={0.7}
        >
          <Text style={styles.imageButtonText}>📷 添加图片</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.submitContainer}>
        <TouchableOpacity
          style={[
            styles.submitButton,
            (!canPublish || publishing) && styles.submitButtonDisabled,
          ]}
          onPress={handlePublish}
          disabled={!canPublish || publishing}
          activeOpacity={0.8}
        >
          {publishing ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <Text style={styles.submitText}>发布</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inputContainer: {
    backgroundColor: colors.white,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  textInput: {
    fontSize: fonts.md,
    color: colors.text,
    minHeight: 120,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  imageButton: {
    backgroundColor: colors.white,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  imageButtonText: {
    fontSize: fonts.md,
    color: colors.text,
  },
  submitContainer: {
    paddingHorizontal: spacing.lg,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitText: {
    fontSize: fonts.lg,
    color: colors.white,
    fontWeight: '600',
  },
});
