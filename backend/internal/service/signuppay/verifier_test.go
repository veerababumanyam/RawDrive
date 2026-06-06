package signuppay

import (
	"context"
	"testing"
)

func TestRazorpayVerifier_ValidSignature(t *testing.T) {
	secret := "test_secret_key"
	orderID := "order_ABC123"
	paymentID := "pay_XYZ789"
	sig := hmacSHA256Hex(orderID+"|"+paymentID, secret)

	v := NewRazorpayVerifier(secret)
	ok, err := v.VerifyPaid(context.Background(), "razorpay", orderID, paymentID+"|"+sig)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ok {
		t.Fatal("valid signature must verify")
	}
}

func TestRazorpayVerifier_TamperedSignature(t *testing.T) {
	v := NewRazorpayVerifier("test_secret_key")
	ok, err := v.VerifyPaid(context.Background(), "razorpay", "order_ABC123", "pay_XYZ789|deadbeefnotvalid")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ok {
		t.Fatal("a tampered signature must NOT verify")
	}
}

func TestRazorpayVerifier_WrongOrderID(t *testing.T) {
	secret := "test_secret_key"
	sig := hmacSHA256Hex("order_REAL|pay_1", secret)
	v := NewRazorpayVerifier(secret)
	// Same payment/signature but replayed against a different order id must fail.
	ok, _ := v.VerifyPaid(context.Background(), "razorpay", "order_OTHER", "pay_1|"+sig)
	if ok {
		t.Fatal("signature bound to a different order must not verify")
	}
}

func TestRazorpayVerifier_NonRazorpayProvider(t *testing.T) {
	v := NewRazorpayVerifier("test_secret_key")
	if _, err := v.VerifyPaid(context.Background(), "phonepe", "order", "proof"); err == nil {
		t.Fatal("RazorpayVerifier must reject non-razorpay providers explicitly")
	}
}

func TestRazorpayVerifier_MalformedProof(t *testing.T) {
	v := NewRazorpayVerifier("test_secret_key")
	if _, err := v.VerifyPaid(context.Background(), "razorpay", "order", "no-delimiter"); err == nil {
		t.Fatal("malformed proof must error")
	}
}
