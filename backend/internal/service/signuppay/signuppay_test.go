package signuppay

import (
	"context"
	"errors"
	"testing"
)

// ---- fakes -----------------------------------------------------------------

type fakeState struct {
	state string
	err   error
}

func (f fakeState) GetReuseState(context.Context, string) (string, error) { return f.state, f.err }

type fakeOrders struct {
	created   *Order
	getResult Order
	getErr    error
}

func (f *fakeOrders) Create(_ context.Context, o Order) (string, error) {
	o.ID = "order-1"
	f.created = &o
	return "order-1", nil
}
func (f *fakeOrders) GetByProviderOrder(context.Context, string, string) (Order, error) {
	return f.getResult, f.getErr
}

type fakePrices struct {
	amount int64
	paid   bool
}

func (f fakePrices) PriceForTier(context.Context, string, string) (int64, bool, error) {
	return f.amount, f.paid, nil
}

type fakeCreator struct{ called bool }

func (f *fakeCreator) CreateProviderOrder(context.Context, string, int64, string) (string, error) {
	f.called = true
	return "prov-order-1", nil
}

type fakeVerifier struct {
	ok        bool
	calledAt  *int
	callOrder *[]string
}

func (f *fakeVerifier) VerifyPaid(context.Context, string, string, string) (bool, error) {
	if f.callOrder != nil {
		*f.callOrder = append(*f.callOrder, "verify")
	}
	return f.ok, nil
}

type fakeProvisioner struct {
	called    bool
	callOrder *[]string
	gotInput  ProvisionInput
}

func (f *fakeProvisioner) ProvisionPaidAccount(_ context.Context, in ProvisionInput) (string, error) {
	f.called = true
	f.gotInput = in
	if f.callOrder != nil {
		*f.callOrder = append(*f.callOrder, "provision")
	}
	return "ws-1", nil
}

// ---- CreateOrder -----------------------------------------------------------

func TestCreateOrder_PaidPending_CreatesPendingOrder(t *testing.T) {
	orders := &fakeOrders{}
	creator := &fakeCreator{}
	svc := NewService(fakeState{state: "paid_pending"}, orders, fakePrices{amount: 99900, paid: true}, creator, &fakeVerifier{}, &fakeProvisioner{})

	o, err := svc.CreateOrder(context.Background(), "u1", "studio", "monthly", "razorpay")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !creator.called {
		t.Fatal("expected a provider order to be created")
	}
	if orders.created == nil || orders.created.Status != "pending" || orders.created.AmountPaise != 99900 {
		t.Fatalf("order not persisted as pending with the resolved price: %+v", orders.created)
	}
	if o.ProviderOrderID != "prov-order-1" {
		t.Fatalf("order missing provider order id: %+v", o)
	}
}

func TestCreateOrder_NotPaidPending_Rejected(t *testing.T) {
	creator := &fakeCreator{}
	svc := NewService(fakeState{state: "free"}, &fakeOrders{}, fakePrices{amount: 99900, paid: true}, creator, &fakeVerifier{}, &fakeProvisioner{})

	_, err := svc.CreateOrder(context.Background(), "u1", "studio", "monthly", "razorpay")
	if !errors.Is(err, ErrNotPendingPaid) {
		t.Fatalf("want ErrNotPendingPaid, got %v", err)
	}
	if creator.called {
		t.Fatal("must not create a provider order for a non-paid_pending account")
	}
}

func TestCreateOrder_FreeTier_Rejected(t *testing.T) {
	creator := &fakeCreator{}
	svc := NewService(fakeState{state: "paid_pending"}, &fakeOrders{}, fakePrices{amount: 0, paid: false}, creator, &fakeVerifier{}, &fakeProvisioner{})

	_, err := svc.CreateOrder(context.Background(), "u1", "free", "monthly", "razorpay")
	if !errors.Is(err, ErrFreeTierNotAllowed) {
		t.Fatalf("want ErrFreeTierNotAllowed, got %v", err)
	}
	if creator.called {
		t.Fatal("must not create a provider order for a free tier")
	}
}

// ---- Settle ----------------------------------------------------------------

func TestSettle_VerifiedPaidPending_ProvisionsAfterVerify(t *testing.T) {
	order := []string{}
	verifier := &fakeVerifier{ok: true, callOrder: &order}
	provis := &fakeProvisioner{callOrder: &order}
	orders := &fakeOrders{getResult: Order{ID: "order-1", UserID: "u1", Tier: "studio", BillingInterval: "monthly", AmountPaise: 99900, Status: "pending"}}
	svc := NewService(fakeState{state: "paid_pending"}, orders, fakePrices{}, &fakeCreator{}, verifier, provis)

	ws, err := svc.Settle(context.Background(), "razorpay", "prov-order-1", "sig")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ws != "ws-1" {
		t.Fatalf("want ws-1, got %q", ws)
	}
	if !provis.called {
		t.Fatal("expected provisioning")
	}
	// CRITICAL ordering: payment must be verified BEFORE the workspace is created.
	if len(order) != 2 || order[0] != "verify" || order[1] != "provision" {
		t.Fatalf("verify must precede provision; got %v", order)
	}
	if provis.gotInput.Tier != "studio" || provis.gotInput.AmountPaise != 99900 {
		t.Fatalf("provision got wrong input: %+v", provis.gotInput)
	}
}

func TestSettle_PaymentNotVerified_NoProvision(t *testing.T) {
	provis := &fakeProvisioner{}
	orders := &fakeOrders{getResult: Order{ID: "order-1", UserID: "u1", Tier: "studio", Status: "pending"}}
	svc := NewService(fakeState{state: "paid_pending"}, orders, fakePrices{}, &fakeCreator{}, &fakeVerifier{ok: false}, provis)

	_, err := svc.Settle(context.Background(), "razorpay", "prov-order-1", "bad-sig")
	if !errors.Is(err, ErrPaymentNotVerified) {
		t.Fatalf("want ErrPaymentNotVerified, got %v", err)
	}
	if provis.called {
		t.Fatal("must NOT provision when payment is unverified")
	}
}

func TestSettle_AlreadyPaid_Idempotent(t *testing.T) {
	provis := &fakeProvisioner{}
	verifier := &fakeVerifier{ok: true}
	orders := &fakeOrders{getResult: Order{ID: "order-1", UserID: "u1", Status: "paid", WorkspaceID: "ws-existing"}}
	svc := NewService(fakeState{state: "paid_active"}, orders, fakePrices{}, &fakeCreator{}, verifier, provis)

	ws, err := svc.Settle(context.Background(), "razorpay", "prov-order-1", "sig")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ws != "ws-existing" {
		t.Fatalf("idempotent settle must return the existing workspace, got %q", ws)
	}
	if provis.called {
		t.Fatal("must NOT re-provision an already-settled order")
	}
}

func TestSettle_VerifiedButFreeAccount_Rejected(t *testing.T) {
	provis := &fakeProvisioner{}
	orders := &fakeOrders{getResult: Order{ID: "order-1", UserID: "u1", Tier: "studio", Status: "pending"}}
	svc := NewService(fakeState{state: "free"}, orders, fakePrices{}, &fakeCreator{}, &fakeVerifier{ok: true}, provis)

	_, err := svc.Settle(context.Background(), "razorpay", "prov-order-1", "sig")
	if !errors.Is(err, ErrNotPendingPaid) {
		t.Fatalf("want ErrNotPendingPaid, got %v", err)
	}
	if provis.called {
		t.Fatal("must NOT provision a non-pending/active account")
	}
}
