// Home: the multi-child switcher + a quick summary for the selected child, with links into
// the attendance / marks / fees detail screens. One login → all linked children (the
// guardian_student set the server resolves; the app never addresses a foreign child).
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, Card, ErrorNote, H1, Loading, Muted, Stat } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useChildAttendance, useChildFees, useChildren } from '@/api/guardian';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export default function DashboardScreen({ navigation }: Props) {
  const { session, signOut } = useAuth();
  const s = session!; // guarded by the navigator (only mounted when signed in)
  const children = useChildren(s);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const list = children.data?.children ?? [];
  const selected = useMemo(
    () => list.find((c) => c.student_id === selectedId) ?? list[0],
    [list, selectedId],
  );

  if (children.isLoading) return <Loading />;
  if (children.error) return <ErrorNote message={String((children.error as Error).message)} />;

  return (
    <View style={styles.screen}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <H1>My children</H1>
          <Muted>{list.length} linked</Muted>
        </View>
        <Pressable onPress={signOut} hitSlop={8}>
          <Text style={{ color: theme.color.primary, fontWeight: '600' }}>Sign out</Text>
        </Pressable>
      </View>

      {list.length === 0 ? (
        <Card>
          <Text style={{ fontWeight: '600' }}>No children linked</Text>
          <Muted>This account isn't linked to any students yet. Contact the school office.</Muted>
        </Card>
      ) : (
        <>
          {/* child switcher */}
          <View style={styles.chips}>
            {list.map((c) => {
              const active = c.student_id === selected?.student_id;
              return (
                <Pressable
                  key={c.student_id}
                  onPress={() => setSelectedId(c.student_id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && { color: theme.color.primaryText }]}>
                    {c.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {selected && <ChildSummary key={selected.student_id} childId={selected.student_id} name={selected.name} navigation={navigation} />}
        </>
      )}
    </View>
  );
}

function ChildSummary({
  childId,
  name,
  navigation,
}: {
  childId: string;
  name: string;
  navigation: Props['navigation'];
}) {
  const { session } = useAuth();
  const s = session!;
  const att = useChildAttendance(s, childId);
  const fees = useChildFees(s, childId);

  const summary: Record<string, number> = att.data?.summary ?? {};
  const present = summary.PRESENT ?? 0;
  const total = summary.TOTAL ?? Object.values(summary).reduce((a, b) => a + b, 0);
  const pct = total > 0 ? Math.round((present / total) * 100) : null;
  const outstanding = fees.data?.outstanding ?? 0;

  return (
    <View style={{ gap: theme.space(3) }}>
      <View style={styles.statRow}>
        <Stat label="Attendance" value={pct === null ? '—' : `${pct}%`} />
        <Stat label="Outstanding" value={outstanding.toFixed(0)} accent={outstanding > 0} />
      </View>

      <Card>
        <Text style={{ fontWeight: '700', color: theme.color.text }}>{name}</Text>
        <Muted>View the full records below.</Muted>
        <View style={{ gap: theme.space(2), marginTop: theme.space(2) }}>
          <Button title="Attendance" variant="ghost" onPress={() => navigation.navigate('ChildAttendance', { childId, childName: name })} />
          <Button title="Marks / report card" variant="ghost" onPress={() => navigation.navigate('ChildMarks', { childId, childName: name })} />
          <Button title="Fees & dues" variant="ghost" onPress={() => navigation.navigate('ChildFees', { childId, childName: name })} />
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.color.bg, padding: theme.space(4), gap: theme.space(3) },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.space(2) },
  chip: {
    paddingVertical: theme.space(2),
    paddingHorizontal: theme.space(3),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.color.border,
    backgroundColor: theme.color.surface,
  },
  chipActive: { backgroundColor: theme.color.primary, borderColor: theme.color.primary },
  chipText: { color: theme.color.text, fontWeight: '600' },
  statRow: { flexDirection: 'row', gap: theme.space(3) },
});
