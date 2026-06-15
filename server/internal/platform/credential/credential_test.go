package credential

import "testing"

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"John Doe":    "johndoe",
		"José Niño":   "josenino",
		"  A.B  C ":   "abc",
		"":            "user",
		"!!!":         "user",
		"O'Brien 3rd": "obrien3rd",
	}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestTypeSuffix(t *testing.T) {
	for in, want := range map[string]string{
		"STUDENT": "student", "teacher": "teacher", "EMPLOYEE": "employee",
		"GUARDIAN": "guardian", "weird": "user",
	} {
		if got := TypeSuffix(in); got != want {
			t.Errorf("TypeSuffix(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestGenerateHandleCollisionIncrements(t *testing.T) {
	taken := map[string]bool{
		"johndoe.student@ved.com":  true,
		"johndoe2.student@ved.com": true,
	}
	got, err := GenerateHandle("John Doe", "STUDENT", "ved", func(h string) (bool, error) {
		return taken[h], nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if got != "johndoe3.student@ved.com" {
		t.Fatalf("expected johndoe3.student@ved.com, got %s", got)
	}
}

func TestGenerateHandleFirstAvailable(t *testing.T) {
	got, err := GenerateHandle("Jane Roe", "TEACHER", "stmarys", func(string) (bool, error) { return false, nil })
	if err != nil {
		t.Fatal(err)
	}
	if got != "janeroe.teacher@stmarys.com" {
		t.Fatalf("got %s", got)
	}
}

func TestTempPasswordLengthAndAlphabet(t *testing.T) {
	pw, err := TempPassword()
	if err != nil {
		t.Fatal(err)
	}
	if len(pw) != 12 {
		t.Fatalf("expected length 12, got %d", len(pw))
	}
	for _, r := range pw {
		if !contains(pwAlphabet, byte(r)) {
			t.Fatalf("unexpected char %q in password", r)
		}
	}
}

func contains(s string, c byte) bool {
	for i := 0; i < len(s); i++ {
		if s[i] == c {
			return true
		}
	}
	return false
}
