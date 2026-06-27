// The app's navigation: an auth gate. No session → the Login screen (its own stack); a
// session → the guardian stack (Home + the child detail screens). Switching is driven by
// AuthContext, so signing out unmounts the whole authed stack.
import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '@/auth/AuthContext';
import { Loading } from '@/components/ui';
import type { RootStackParamList } from './types';
import LoginScreen from '@/screens/LoginScreen';
import DashboardScreen from '@/screens/DashboardScreen';
import ChildAttendanceScreen from '@/screens/ChildAttendanceScreen';
import ChildMarksScreen from '@/screens/ChildMarksScreen';
import ChildFeesScreen from '@/screens/ChildFeesScreen';
import { theme } from '@/theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: theme.color.surface },
  headerTintColor: theme.color.text,
  contentStyle: { backgroundColor: theme.color.bg },
} as const;

export default function RootNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: theme.color.bg, justifyContent: 'center' }}><Loading /></View>;
  }

  if (!session) {
    return <LoginScreen />;
  }

  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Home" component={DashboardScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ChildAttendance"
        component={ChildAttendanceScreen}
        options={({ route }) => ({ title: `${route.params.childName} · Attendance` })}
      />
      <Stack.Screen
        name="ChildMarks"
        component={ChildMarksScreen}
        options={({ route }) => ({ title: `${route.params.childName} · Marks` })}
      />
      <Stack.Screen
        name="ChildFees"
        component={ChildFeesScreen}
        options={({ route }) => ({ title: `${route.params.childName} · Fees` })}
      />
    </Stack.Navigator>
  );
}
