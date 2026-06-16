// Guardian sign-in. Native apps don't get the subdomain gateway, so the guardian enters
// the server URL + school code (slug) once; thereafter the session is remembered. The
// credentials are the GUARDIAN login handle + password issued when the guardian was
// promoted to a portal user (docs/18).
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, H1, Muted } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { DEFAULT_SERVER_URL, DEFAULT_SLUG } from '@/config';
import { theme } from '@/theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [slug, setSlug] = useState(DEFAULT_SLUG);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    setError(null);
    setBusy(true);
    try {
      await signIn(serverUrl, slug, loginId, password);
    } catch (e: any) {
      setError(e?.message ?? 'Sign in failed');
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = serverUrl && slug && loginId && password && !busy;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <View style={{ gap: theme.space(4), width: '100%' }}>
        <View style={{ gap: 4 }}>
          <H1>VED Guardian</H1>
          <Muted>Sign in to follow your child's attendance, marks and fees.</Muted>
        </View>

        <Card>
          <Label>School code</Label>
          <TextInput
            style={styles.input}
            value={slug}
            onChangeText={setSlug}
            autoCapitalize="none"
            placeholder="e.g. lincoln"
            placeholderTextColor={theme.color.muted}
          />

          <Label>Login</Label>
          <TextInput
            style={styles.input}
            value={loginId}
            onChangeText={setLoginId}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="name.guardian@school.com"
            placeholderTextColor={theme.color.muted}
          />

          <Label>Password</Label>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="••••••••"
            placeholderTextColor={theme.color.muted}
          />

          <Label>Server</Label>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            autoCapitalize="none"
            keyboardType="url"
            placeholder="http://10.0.2.2:8091"
            placeholderTextColor={theme.color.muted}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={{ marginTop: theme.space(2) }}>
            <Button title={busy ? 'Signing in…' : 'Sign in'} onPress={onSubmit} disabled={!canSubmit} />
          </View>
        </Card>
      </View>
    </KeyboardAvoidingView>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.color.bg,
    justifyContent: 'center',
    padding: theme.space(5),
  },
  label: { color: theme.color.muted, fontSize: 12, marginTop: theme.space(2), marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: 12,
    paddingHorizontal: theme.space(3),
    paddingVertical: theme.space(3),
    color: theme.color.text,
    backgroundColor: theme.color.surface,
  },
  error: { color: theme.color.danger, marginTop: theme.space(2) },
});
