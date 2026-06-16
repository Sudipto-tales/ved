// Native-stack route params. The child screens receive the child id + a display name so
// headers read nicely without an extra fetch.
export type RootStackParamList = {
  Home: undefined;
  ChildAttendance: { childId: string; childName: string };
  ChildMarks: { childId: string; childName: string };
  ChildFees: { childId: string; childName: string };
};
