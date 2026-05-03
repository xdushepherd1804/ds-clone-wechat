import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MomentsScreen from '@/screens/moments/MomentsScreen';
import PublishMomentScreen from '@/screens/moments/PublishMomentScreen';
import type { MomentsStackParamList } from './types';

const Stack = createNativeStackNavigator<MomentsStackParamList>();

export default function MomentsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#EDEDED' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="MomentsMain"
        component={MomentsScreen}
        options={{ headerTitle: '朋友圈' }}
      />
      <Stack.Screen
        name="PublishMoment"
        component={PublishMomentScreen}
        options={{ headerTitle: '发表动态', headerBackTitle: '返回' }}
      />
    </Stack.Navigator>
  );
}
