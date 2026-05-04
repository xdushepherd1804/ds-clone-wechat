import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, StyleSheet } from 'react-native';
import ChatStack from './ChatStack';
import ContactsStack from './ContactsStack';
import MomentsStack from './MomentsStack';
import ProfileStack from './ProfileStack';
import { colors, fonts, sizes } from '@/theme';
import type { MainTabParamList } from './types';

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const iconMap: Record<string, string> = {
    ChatTab: '💬',
    ContactsTab: '👥',
    MomentsTab: '🌐',
    ProfileTab: '👤',
  };

  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconFocused]}>
      {iconMap[name] || '•'}
    </Text>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon name={route.name} focused={focused} />
        ),
        tabBarActiveTintColor: colors.tabBarActive,
        tabBarInactiveTintColor: colors.tabBarInactive,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
      })}
    >
      <Tab.Screen
        name="ChatTab"
        component={ChatStack}
        options={{ tabBarLabel: '微信' }}
      />
      <Tab.Screen
        name="ContactsTab"
        component={ContactsStack}
        options={{ tabBarLabel: '通讯录' }}
      />
      <Tab.Screen
        name="MomentsTab"
        component={MomentsStack}
        options={{ tabBarLabel: '朋友圈' }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{ tabBarLabel: '我' }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.white,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    height: sizes.tabBarHeight,
    paddingBottom: 4,
  },
  tabBarLabel: {
    fontSize: fonts.xs,
    marginTop: -2,
  },
  tabIcon: {
    fontSize: sizes.iconLg,
    opacity: 0.5,
  },
  tabIconFocused: {
    opacity: 1,
  },
});
