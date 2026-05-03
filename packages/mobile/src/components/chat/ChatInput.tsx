import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { colors, spacing, fonts, sizes } from '@/theme';
import { isValidMsgContent } from '@wechat-clone/shared';

interface ChatInputProps {
  onSend: (text: string) => void;
}

export default function ChatInput({ onSend }: ChatInputProps) {
  const [text, setText] = useState('');

  const handleSend = () => {
    if (!isValidMsgContent(text)) return;
    onSend(text);
    setText('');
  };

  const canSend = isValidMsgContent(text);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.container}>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="输入消息..."
            placeholderTextColor={colors.textTertiary}
            multiline
            maxLength={5000}
            textAlignVertical="center"
          />
        </View>
        <TouchableOpacity
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!canSend}
          activeOpacity={0.7}
        >
          <Text style={[styles.sendText, !canSend && styles.sendTextDisabled]}>
            发送
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  inputContainer: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    maxHeight: 100,
  },
  input: {
    fontSize: fonts.md,
    color: colors.text,
    paddingVertical: spacing.sm,
    minHeight: sizes.chatInputHeight - 16,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.lg,
    height: sizes.chatInputHeight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.borderLight,
  },
  sendText: {
    color: colors.white,
    fontSize: fonts.md,
    fontWeight: '600',
  },
  sendTextDisabled: {
    color: colors.textTertiary,
  },
});
