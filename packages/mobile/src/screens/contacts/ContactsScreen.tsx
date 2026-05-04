import React, { useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import type { ContactItem } from '@wechat-clone/shared';
import { useContactStore } from '@/store/contactStore';
import { colors, spacing, fonts, sizes } from '@/theme';
import ContactItemComponent, { SectionHeader } from '@/components/contacts/ContactItem';
import FriendRequestCard from '@/components/contacts/FriendRequestCard';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, ContactsStackParamList } from '@/navigation/types';

type Props = CompositeScreenProps<
  NativeStackScreenProps<ContactsStackParamList, 'ContactsMain'>,
  BottomTabScreenProps<MainTabParamList>
>;

function groupContactsByLetter(contacts: ContactItem[]): { title: string; data: ContactItem[] }[] {
  const grouped: Record<string, ContactItem[]> = {};
  contacts.forEach((c) => {
    const displayName = c.remark || c.contact.nickname;
    const letter = (displayName || '?').charAt(0).toUpperCase();
    if (!grouped[letter]) grouped[letter] = [];
    grouped[letter].push(c);
  });
  return Object.keys(grouped)
    .sort()
    .map((title) => ({ title, data: grouped[title] }));
}

export default function ContactsScreen({ navigation }: Props) {
  const contacts = useContactStore((s) => s.contacts);
  const friendRequests = useContactStore((s) => s.friendRequests);
  const loading = useContactStore((s) => s.loading);
  const fetchContacts = useContactStore((s) => s.fetchContacts);
  const fetchFriendRequests = useContactStore((s) => s.fetchFriendRequests);

  useEffect(() => {
    fetchContacts();
    fetchFriendRequests();
  }, []);

  const sections = useMemo(() => {
    const grouped = groupContactsByLetter(contacts);
    if (friendRequests.length > 0) {
      return [{ title: '☆', data: contacts.slice(0, 0) }, ...grouped];
    }
    return grouped;
  }, [contacts, friendRequests]);

  const handleContactPress = (item: ContactItem) => {
    navigation.navigate('ContactDetail', {
      contactId: item.contactId,
      userId: item.userId,
    });
  };

  const onRefresh = useCallback(() => {
    fetchContacts();
    fetchFriendRequests();
  }, []);

  const renderFriendRequests = () => {
    if (friendRequests.length === 0) return null;
    return (
      <View style={styles.friendRequestsSection}>
        <Text style={styles.sectionLabel}>好友请求</Text>
        {friendRequests.map((req) => (
          <FriendRequestCard key={req.id} request={req} />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="搜索"
          placeholderTextColor={colors.textTertiary}
        />
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ContactItemComponent item={item} onPress={() => handleContactPress(item)} />
        )}
        renderSectionHeader={({ section: { title } }) =>
          title === '☆' ? null : <SectionHeader letter={title} />
        }
        ListHeaderComponent={renderFriendRequests}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} tintColor={colors.primary} />
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>暂无联系人</Text>
            </View>
          )
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        stickySectionHeadersEnabled
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.headerBg,
  },
  searchInput: {
    backgroundColor: colors.white,
    borderRadius: 8,
    height: 36,
    paddingHorizontal: spacing.md,
    fontSize: fonts.sm,
    color: colors.text,
  },
  listContent: {
    flexGrow: 1,
  },
  friendRequestsSection: {
    backgroundColor: colors.white,
    marginBottom: spacing.sm,
  },
  sectionLabel: {
    fontSize: fonts.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.background,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderLight,
    marginLeft: 72,
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: fonts.md,
    color: colors.textSecondary,
  },
});
