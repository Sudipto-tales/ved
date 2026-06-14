package crypto

import "testing"

func TestHashVerifyRoundTrip(t *testing.T) {
	hash, err := HashPassword("correct horse battery staple")
	if err != nil {
		t.Fatalf("hash: %v", err)
	}
	if hash == "correct horse battery staple" {
		t.Fatal("hash must not equal plaintext")
	}
	if err := VerifyPassword("correct horse battery staple", hash); err != nil {
		t.Fatalf("verify good password: %v", err)
	}
}

func TestVerifyWrongPassword(t *testing.T) {
	hash, _ := HashPassword("admin1234")
	if err := VerifyPassword("wrong", hash); err != ErrMismatch {
		t.Fatalf("want ErrMismatch, got %v", err)
	}
}

func TestHashIsSalted(t *testing.T) {
	a, _ := HashPassword("same")
	b, _ := HashPassword("same")
	if a == b {
		t.Fatal("two hashes of the same password must differ (random salt)")
	}
}

func TestVerifyBadHashFormat(t *testing.T) {
	if err := VerifyPassword("x", "not-a-phc-string"); err != ErrBadHash {
		t.Fatalf("want ErrBadHash, got %v", err)
	}
}
