// A child's fee ledger: derived outstanding (Σ DEBIT − Σ CREDIT) + the entry history from
// the finance append-only ledger. Read-only here; paying is a Tier-2 write (web for now).
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, ErrorNote, Loading, Muted, Screen, Stat } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useChildFees } from '@/api/guardian';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChildFees'>;

export default function ChildFeesScreen({ route }: Props) {
  const { session } = useAuth();
  const { childId } = route.params;
  const q = useChildFees(session!, childId);

  if (q.isLoading) return <Loading />;
  if (q.error) return <ErrorNote message={String((q.error as Error).message)} />;

  const fees = q.data;
  const entries = fees?.entries ?? [];

  return (
    <Screen>
      <View style={styles.statRow}>
        <Stat label="Outstanding" value={(fees?.outstanding ?? 0).toFixed(2)} accent={(fees?.outstanding ?? 0) > 0} />
        <Stat label="Charged" value={(fees?.total_debit ?? 0).toFixed(2)} />
        <Stat label="Paid" value={(fees?.total_credit ?? 0).toFixed(2)} />
      </View>

      {entries.length === 0 ? (
        <Card>
          <Muted>No fee activity recorded yet.</Muted>
        </Card>
      ) : (
        <Card>
          {entries.map((e, i) => {
            const credit = e.direction === 'CREDIT';
            return (
              <View key={i} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kind}>{e.source_type ?? e.direction}</Text>
                  {e.created_at ? <Muted>{e.created_at.slice(0, 10)}</Muted> : null}
                </View>
                <Text style={[styles.amt, { color: credit ? theme.color.success : theme.color.text }]}>
                  {credit ? '−' : '+'}
                  {e.amount.toFixed(2)}
                </Text>
              </View>
            );
          })}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', gap: theme.space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  kind: { color: theme.color.text, fontWeight: '600' },
  amt: { fontWeight: '700', fontVariant: ['tabular-nums'] },
});
