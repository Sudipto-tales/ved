// Tiny presentational kit shared by the screens — keeps each screen focused on data.
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import { theme } from '@/theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ padding: theme.space(4), gap: theme.space(3) }}>
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function H1({ children }: { children: React.ReactNode }) {
  return <Text style={styles.h1}>{children}</Text>;
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

export function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={[styles.stat, accent && { backgroundColor: theme.color.accentBg }]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}) {
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        ghost && styles.btnGhost,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      <Text style={[styles.btnText, ghost && { color: theme.color.primary }]}>{title}</Text>
    </Pressable>
  );
}

export function Loading() {
  return (
    <View style={{ padding: theme.space(8), alignItems: 'center' }}>
      <ActivityIndicator color={theme.color.primary} />
    </View>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <Card style={{ borderColor: theme.color.danger }}>
      <Text style={{ color: theme.color.danger, fontWeight: '600' }}>Something went wrong</Text>
      <Muted>{message}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(4),
    gap: theme.space(2),
  },
  h1: { fontSize: 22, fontWeight: '700', color: theme.color.text },
  muted: { color: theme.color.muted, fontSize: 13, lineHeight: 18 },
  stat: {
    flex: 1,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.color.border,
    padding: theme.space(4),
    gap: 2,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: theme.color.text },
  statLabel: { color: theme.color.muted, fontSize: 12 },
  btn: {
    backgroundColor: theme.color.primary,
    paddingVertical: theme.space(3),
    paddingHorizontal: theme.space(4),
    borderRadius: theme.radius,
    alignItems: 'center',
  },
  btnGhost: { backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.color.primary },
  btnText: { color: theme.color.primaryText, fontWeight: '700' },
});
