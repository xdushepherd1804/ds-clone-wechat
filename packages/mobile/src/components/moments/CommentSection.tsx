import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
} from 'react-native';
import type { MomentComment } from '@wechat-clone/shared';
import { formatRelativeTime } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';
import { useUserStore } from '@/store/userStore';
import { useMomentsStore } from '@/store/momentsStore';

interface CommentSectionProps {
  momentId: string;
  comments: MomentComment[];
}

export default function CommentSection({
  momentId,
  comments,
}: CommentSectionProps) {
  const [text, setText] = useState('');
  const currentUser = useUserStore((s) => s.user);
  const addCommentAction = useMomentsStore((s) => s.addComment);
  const deleteCommentAction = useMomentsStore((s) => s.deleteComment);

  const handleAddComment = () => {
    if (!text.trim() || !currentUser) return;
    const tempId = `comment-${Date.now()}`;
    const comment = {
      id: tempId,
      momentId,
      userId: currentUser.id,
      content: text.trim(),
      replyToId: null,
      user: {
        id: currentUser.id,
        nickname: currentUser.nickname,
        avatar: currentUser.avatar,
      },
      createdAt: new Date().toISOString(),
    };
    addCommentAction(momentId, tempId, comment);
    setText('');
  };

  const handleDeleteComment = (commentId: string, userId: string) => {
    if (userId !== currentUser?.id) return;
    Alert.alert('删除评论', '确定要删除这条评论吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: () => deleteCommentAction(momentId, commentId),
      },
    ]);
  };

  const renderItem = ({ item }: { item: MomentComment }) => {
    const isOwn = item.userId === currentUser?.id;
    const time = formatRelativeTime(new Date(item.createdAt));

    return (
      <TouchableOpacity
        style={styles.commentItem}
        onLongPress={() => handleDeleteComment(item.id, item.userId)}
        activeOpacity={isOwn ? 0.7 : 1}
      >
        <Text style={styles.commentUser}>{item.user.nickname}: </Text>
        <Text style={styles.commentContent}>{item.content}</Text>
        <Text style={styles.commentTime}>{time}</Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {comments.length > 0 && (
        <FlatList
          data={comments}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          scrollEnabled={false}
        />
      )}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="写评论..."
          placeholderTextColor={colors.textTertiary}
          value={text}
          onChangeText={setText}
          multiline={false}
        />
        <TouchableOpacity
          style={[styles.sendButton, !text.trim() && styles.sendButtonDisabled]}
          onPress={handleAddComment}
          disabled={!text.trim()}
          activeOpacity={0.7}
        >
          <Text style={styles.sendText}>发送</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
  },
  commentItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingVertical: 3,
  },
  commentUser: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.link,
  },
  commentContent: {
    fontSize: fonts.sm,
    color: colors.text,
    flexShrink: 1,
  },
  commentTime: {
    fontSize: fonts.xs,
    color: colors.textTertiary,
    marginLeft: spacing.sm,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.inputBg,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    fontSize: fonts.sm,
    color: colors.text,
    height: 32,
  },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendText: {
    fontSize: fonts.sm,
    color: colors.white,
    fontWeight: '600',
  },
});
