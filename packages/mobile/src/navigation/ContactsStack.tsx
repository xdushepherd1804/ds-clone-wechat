import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ContactsScreen from '@/screens/contacts/ContactsScreen';
import ContactDetailScreen from '@/screens/contacts/ContactDetailScreen';
import type { ContactsStackParamList } from './types';

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export default function ContactsStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#EDEDED' },
        headerTintColor: '#333333',
        headerTitleStyle: { fontWeight: '600' },
      }}
    >
      <Stack.Screen
        name="ContactsMain"
        component={ContactsScreen}
        options={{ headerTitle: '通讯录' }}
      />
      <Stack.Screen
        name="ContactDetail"
        component={ContactDetailScreen}
        options={{ headerTitle: '详细资料', headerBackTitle: '返回' }}
      />
    </Stack.Navigator>
  );
}
