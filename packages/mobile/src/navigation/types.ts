import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

// ─── Auth Stack ──────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
};

// ─── Chat Stack ──────────────────────────────────────────────────────────────

export type ChatStackParamList = {
  ChatList: undefined;
  ChatDetail: { convId: string; title: string };
  GroupChat: { groupId: string; title: string };
  GroupSettings: { groupId: string; title: string };
};

// ─── Contacts Stack ──────────────────────────────────────────────────────────

export type ContactsStackParamList = {
  ContactsMain: undefined;
  ContactDetail: { contactId: string; userId: string };
};

// ─── Moments Stack ───────────────────────────────────────────────────────────

export type MomentsStackParamList = {
  MomentsMain: undefined;
  PublishMoment: undefined;
};

// ─── Profile Stack ───────────────────────────────────────────────────────────

export type ProfileStackParamList = {
  ProfileMain: undefined;
  MyMoments: { userId: string };
};

// ─── Main Tabs ───────────────────────────────────────────────────────────────

export type MainTabParamList = {
  ChatTab: NavigatorScreenParams<ChatStackParamList>;
  ContactsTab: NavigatorScreenParams<ContactsStackParamList>;
  MomentsTab: NavigatorScreenParams<MomentsStackParamList>;
  ProfileTab: NavigatorScreenParams<ProfileStackParamList>;
};

// ─── Root Stack ──────────────────────────────────────────────────────────────

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainTabParamList>;
};

// ─── Screen Props ────────────────────────────────────────────────────────────

export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>;
export type RegisterScreenProps = NativeStackScreenProps<AuthStackParamList, 'Register'>;

export type ChatListScreenProps = CompositeScreenProps<
  NativeStackScreenProps<ChatStackParamList, 'ChatList'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type ChatDetailScreenProps = NativeStackScreenProps<ChatStackParamList, 'ChatDetail'>;
export type GroupChatScreenProps = NativeStackScreenProps<ChatStackParamList, 'GroupChat'>;
export type GroupSettingsScreenProps = NativeStackScreenProps<ChatStackParamList, 'GroupSettings'>;

export type ContactsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<ContactsStackParamList, 'ContactsMain'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type ContactDetailScreenProps = NativeStackScreenProps<ContactsStackParamList, 'ContactDetail'>;

export type MomentsScreenProps = CompositeScreenProps<
  NativeStackScreenProps<MomentsStackParamList, 'MomentsMain'>,
  BottomTabScreenProps<MainTabParamList>
>;

export type ProfileScreenProps = CompositeScreenProps<
  NativeStackScreenProps<ProfileStackParamList, 'ProfileMain'>,
  BottomTabScreenProps<MainTabParamList>
>;
