import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ChatListScreen from '@/screens/chat/ChatListScreen';
import ChatDetailScreen from '@/screens/chat/ChatDetailScreen';
import GroupChatScreen from '@/screens/chat/GroupChatScreen';
import GroupSettingsScreen from '@/screens/chat/GroupSettingsScreen';
import type { ChatStackParamList } from './types';

const Stack = createNativeStackNavigator<ChatStackParamList>();

export default function ChatStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#EDEDED' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="ChatList"
        component={ChatListScreen}
        options={{ headerTitle: '微信' }}
      />
      <Stack.Screen
        name="ChatDetail"
        component={ChatDetailScreen}
        options={({ route }) => ({
          headerTitle: route.params.title,
          headerBackTitle: '返回',
        })}
      />
      <Stack.Screen
        name="GroupChat"
        component={GroupChatScreen}
        options={({ route }) => ({
          headerTitle: route.params.title,
          headerBackTitle: '返回',
        })}
      />
      <Stack.Screen
        name="GroupSettings"
        component={GroupSettingsScreen}
        options={({ route }) => ({
          headerTitle: '群聊设置',
          headerBackTitle: '返回',
        })}
      />
    </Stack.Navigator>
  );
}
