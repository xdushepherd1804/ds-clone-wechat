import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  StyleSheet,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { ContactItem } from '@wechat-clone/shared';
import { colors, spacing, fonts, sizes } from '@/theme';
import { useContactStore } from '@/store/contactStore';
import { deleteContact, blockContact, unblockContact, updateRemark } from '@/api/contact';
import type { ContactsStackParamList } from '@/navigation/types';

type ContactDetailRoute = RouteProp<ContactsStackParamList, 'ContactDetail'>;

export default function ContactDetailScreen() {
  const route = useRoute<ContactDetailRoute>();
  const navigation = useNavigation();
  const { contactId } = route.params;

  const contacts = useContactStore((s) => s.contacts);
  const removeContact = useContactStore((s) => s.removeContact);
  const updateContactInStore = useContactStore((s) => s.updateContact);

  const contact = contacts.find((c) => c.contactId === contactId || c.id === contactId);

  const [isEditingRemark, setIsEditingRemark] = useState(false);
  const [remarkText, setRemarkText] = useState(contact?.remark || '');

  useEffect(() => {
    if (contact?.remark) setRemarkText(contact.remark);
  }, [contact?.remark]);

  if (!contact) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>联系人不存在</Text>
        </View>
      </View>
    );
  }

  const displayName = contact.remark || contact.contact.nickname;
  const isBlocked = contact.status === 'blocked';

  const handleDelete = () => {
    Alert.alert('删除联系人', `确定要删除 ${displayName} 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteContact(contact.contactId);
            removeContact(contact.contactId);
            navigation.goBack();
          } catch {
            Alert.alert('错误', '删除失败');
          }
        },
      },
    ]);
  };

  const handleBlock = () => {
    const action = isBlocked ? unblockContact : blockContact;
    const actionLabel = isBlocked ? '取消拉黑' : '拉黑';
    const confirmMsg = isBlocked
      ? `确定要取消拉黑 ${displayName} 吗？`
      : `确定要拉黑 ${displayName} 吗？拉黑后将不再接收对方消息`;

    Alert.alert(actionLabel, confirmMsg, [
      { text: '取消', style: 'cancel' },
      {
        text: actionLabel,
        style: 'destructive',
        onPress: async () => {
          try {
            const uid = contact.contactId;
            await action(uid);
            updateContactInStore(uid, {
              status: isBlocked ? 'active' : 'blocked',
            } as Partial<ContactItem>);
          } catch {
            Alert.alert('错误', '操作失败');
          }
        },
      },
    ]);
  };

  const handleSaveRemark = async () => {
    try {
      await updateRemark(contact.contactId, remarkText);
      updateContactInStore(contact.contactId, { remark: remarkText } as Partial<ContactItem>);
      setIsEditingRemark(false);
    } catch {
      Alert.alert('错误', '保存备注失败');
    }
  };

  const handleSendMessage = () => {
    navigation.getParent()?.navigate('ChatTab', {
      screen: 'ChatDetail',
      params: { convId: contact.contactId, title: displayName },
    });
  };

  return (
    <View style={styles.container}>
      {/* Profile Card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(contact.contact.nickname || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.nickname}>{contact.contact.nickname}</Text>
        <Text style={styles.username}>微信号: {contact.contact.username}</Text>
        {contact.remark ? (
          <Text style={styles.remark}>备注: {contact.remark}</Text>
        ) : null}
      </View>

      {/* Remark Section */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={() => setIsEditingRemark(!isEditingRemark)}
          activeOpacity={0.7}
        >
          <Text style={styles.menuLabel}>备注</Text>
          <Text style={styles.menuValue}>
            {contact.remark || '未设置'} ›
          </Text>
        </TouchableOpacity>
        {isEditingRemark && (
          <View style={styles.remarkEditContainer}>
            <TextInput
              style={styles.remarkInput}
              value={remarkText}
              onChangeText={setRemarkText}
              placeholder="输入备注名"
              placeholderTextColor={colors.textTertiary}
            />
            <View style={styles.remarkActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setIsEditingRemark(false);
                  setRemarkText(contact.remark || '');
                }}
              >
                <Text style={styles.cancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleSaveRemark}
              >
                <Text style={styles.saveText}>保存</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleSendMessage}
          activeOpacity={0.7}
        >
          <Text style={styles.actionPrimary}>发送消息</Text>
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleDelete}
          activeOpacity={0.7}
        >
          <Text style={styles.actionDanger}>删除联系人</Text>
        </TouchableOpacity>
        <View style={styles.separator} />
        <TouchableOpacity
          style={styles.menuItem}
          onPress={handleBlock}
          activeOpacity={0.7}
        >
          <Text style={[styles.actionDanger, isBlocked && styles.actionNormal]}>
            {isBlocked ? '取消拉黑' : '拉黑'}
          </Text>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
  profileCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingVertical: spacing.xxl,
    marginBottom: spacing.sm,
  },
  avatar: {
    width: sizes.avatarXl + 16,
    height: sizes.avatarXl + 16,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: 36,
    fontWeight: '600',
    color: colors.white,
  },
  nickname: {
    fontSize: fonts.xl,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  username: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  remark: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  section: {
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  menuLabel: {
    fontSize: fonts.md,
    color: colors.text,
  },
  menuValue: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
  remarkEditContainer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  remarkInput: {
    backgroundColor: colors.inputBg,
    borderRadius: sizes.borderRadius,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: fonts.md,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  remarkActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  cancelButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.background,
  },
  cancelText: {
    fontSize: fonts.sm,
    color: colors.textSecondary,
  },
  saveButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: sizes.borderRadius,
    backgroundColor: colors.primary,
  },
  saveText: {
    fontSize: fonts.sm,
    color: colors.white,
    fontWeight: '600',
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: spacing.lg,
  },
  actionPrimary: {
    fontSize: fonts.md,
    color: colors.link,
    fontWeight: '500',
  },
  actionDanger: {
    fontSize: fonts.md,
    color: colors.danger,
    fontWeight: '500',
  },
  actionNormal: {
    color: colors.text,
  },
});
