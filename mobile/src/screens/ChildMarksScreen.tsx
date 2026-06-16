// A child's marks for an exam (latest-per-subject from the ONE marks ledger). Pick an exam;
// the server enriches each row with the subject name. Linked-child only (foreign → 403).
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Card, ErrorNote, Loading, Muted, Screen } from '@/components/ui';
import { useAuth } from '@/auth/AuthContext';
import { useChildMarks, useExams } from '@/api/guardian';
import type { RootStackParamList } from '@/navigation/types';
import { theme } from '@/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ChildMarks'>;

export default function ChildMarksScreen({ route }: Props) {
  const { session } = useAuth();
  const s = session!;
  const { childId } = route.params;
  const exams = useExams(s);
  const [examId, setExamId] = useState('');

  const examList = exams.data?.exams ?? [];

  useEffect(() => {
    if (!examId && examList.length > 0) setExamId(examList[0].id);
  }, [examList, examId]);

  const marks = useChildMarks(s, childId, examId);

  if (exams.isLoading) return <Loading />;
  if (exams.error) return <ErrorNote message={String((exams.error as Error).message)} />;

  return (
    <Screen>
      {examList.length === 0 ? (
        <Card>
          <Muted>No exams have been published yet.</Muted>
        </Card>
      ) : (
        <>
          <View style={styles.chips}>
            {examList.map((e) => {
              const active = e.id === examId;
              return (
                <Pressable
                  key={e.id}
                  onPress={() => setExamId(e.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && { color: theme.color.primaryText }]}>{e.name}</Text>
                </Pressable>
              );
            })}
          </View>

          {marks.isLoading ? (
            <Loading />
          ) : marks.error ? (
            <ErrorNote message={String((marks.error as Error).message)} />
          ) : marks.data?.note ? (
            <Card>
              <Muted>{marks.data.note}</Muted>
            </Card>
          ) : (marks.data?.marks ?? []).length === 0 ? (
            <Card>
              <Muted>No marks recorded for this exam yet.</Muted>
            </Card>
          ) : (
            <Card>
              {(marks.data?.marks ?? []).map((m, i) => (
                <View key={`${m.subject_id}-${i}`} style={styles.row}>
                  <Text style={styles.subject}>{m.subject_name ?? m.subject_id.slice(0, 8)}</Text>
                  <Text style={styles.value}>{m.marks}</Text>
                </View>
              ))}
            </Card>
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: theme.space(2),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.color.border,
  },
  subject: { color: theme.color.text, fontWeight: '600' },
  value: { color: theme.color.text, fontWeight: '700', fontVariant: ['tabular-nums'] },
});
