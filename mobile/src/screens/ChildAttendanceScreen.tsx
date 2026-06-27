// A child's attendance summary (summed counts from the academics append-only ledger). The
// server returns only a linked child's data — a foreign child id is a 403.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, ErrorNote, Loading, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useChildAttendance } from '@/api/guardian';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChildAttendance'>;

const ORDER = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'TOTAL'];

export default function ChildAttendanceScreen({ route }: Props) {
  const { session } = useAuth();
  const { childId } = route.params;
  const q = useChildAttendance(session!, childId);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote message={String((q.error as Error).message)} />;

  const summary = q.data?.summary ?? {};
  const keys = ORDER.filter((k) => k in summary).concat(
    Object.keys(summary).filter((k) => !ORDER.includes(k)),
  );

  return (
    <Screen>
      {q.data?.note ? (
        <Card>
          <Muted>{q.data.note}</Muted>
        </Card>
      ) : keys.length === 0 ? (
        <Card>
          <Muted>No attendance recorded yet.</Muted>
        </Card>
      ) : (
        <Card>
          {keys.map((k) => (
            <View key={k} style={styles.row}>
              <Text style={styles.label}>{k}</Text>
              <Text style={styles.value}>{summary[k]}</Text>
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  label: { color: theme.color.muted, fontWeight: '600' },
  value: { color: theme.color.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
