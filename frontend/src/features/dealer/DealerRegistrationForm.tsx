// Design source: design-tokens.json semantic classes
"use client";

import { useState, type FormEvent } from "react";
import { createDealer, type CreateDealerRequest } from "@/lib/api/dealer";
import { getStoredAccessToken } from "@/lib/auth";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const INDIAN_STATES = [
  { id: 1, code: "AN", name: "Andaman & Nicobar Islands" },
  { id: 2, code: "AP", name: "Andhra Pradesh" },
  { id: 3, code: "AR", name: "Arunachal Pradesh" },
  { id: 4, code: "AS", name: "Assam" },
  { id: 5, code: "BR", name: "Bihar" },
  { id: 6, code: "CH", name: "Chandigarh" },
  { id: 7, code: "CT", name: "Chhattisgarh" },
  { id: 8, code: "DL", name: "Delhi" },
  { id: 9, code: "GA", name: "Goa" },
  { id: 10, code: "GJ", name: "Gujarat" },
  { id: 11, code: "HR", name: "Haryana" },
  { id: 12, code: "HP", name: "Himachal Pradesh" },
  { id: 13, code: "JK", name: "Jammu & Kashmir" },
  { id: 14, code: "JH", name: "Jharkhand" },
  { id: 15, code: "KA", name: "Karnataka" },
  { id: 16, code: "KL", name: "Kerala" },
  { id: 17, code: "MP", name: "Madhya Pradesh" },
  { id: 18, code: "MH", name: "Maharashtra" },
  { id: 19, code: "MN", name: "Manipur" },
  { id: 20, code: "ML", name: "Meghalaya" },
  { id: 21, code: "MZ", name: "Mizoram" },
  { id: 22, code: "NL", name: "Nagaland" },
  { id: 23, code: "OR", name: "Odisha" },
  { id: 24, code: "PB", name: "Punjab" },
  { id: 25, code: "RJ", name: "Rajasthan" },
  { id: 26, code: "SK", name: "Sikkim" },
  { id: 27, code: "TN", name: "Tamil Nadu" },
  { id: 28, code: "TS", name: "Telangana" },
  { id: 29, code: "TR", name: "Tripura" },
  { id: 30, code: "UK", name: "Uttarakhand" },
  { id: 31, code: "UP", name: "Uttar Pradesh" },
  { id: 32, code: "WB", name: "West Bengal" },
];

interface Props {
  onSuccess: () => void;
}

export default function DealerRegistrationForm({ onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
  const [dealerEmail, setDealerEmail] = useState("");
  const [stateId, setStateId] = useState<number>(0);
  const [territoryType, setTerritoryType] = useState<"primary" | "secondary" | "ambassador">("primary");
  const [panNumber, setPanNumber] = useState("");
  const [gstin, setGstin] = useState("");
  const [bank, setBank] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [upiId, setUpiId] = useState("");
  const [agreement, setAgreement] = useState(false);

  const [panError, setPanError] = useState("");
  const [ifscError, setIfscError] = useState("");

  const validatePAN = (value: string) => {
    const upper = value.toUpperCase();
    setPanNumber(upper);
    setPanError(upper && !PAN_REGEX.test(upper) ? "Invalid PAN format (e.g., ABCDE1234F)" : "");
  };

  const validateIFSC = (value: string) => {
    const upper = value.toUpperCase();
    setIfsc(upper);
    setIfscError(upper && !IFSC_REGEX.test(upper) ? "Invalid IFSC format" : "");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!agreement) {
      setError("You must accept the dealer agreement");
      return;
    }
    if (!PAN_REGEX.test(panNumber)) {
      setError("Invalid PAN number");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      // QA #51: the backend stores bank_account as a JSONB column but its
      // Go struct is `BankAccount *string`. Without stringifying, the JSON
      // decoder fails to unmarshal an object into *string → 400, which
      // surfaces as "registration failed" at the last submit step. Cast
      // to unknown then CreateDealerRequest so TS is happy with the
      // typed-object → string coercion (BankAccount is typed as object
      // in the frontend for form ergonomics).
      const req = {
        business_name: businessName,
        dealer_email: dealerEmail || undefined,
        state_id: stateId,
        territory_type: territoryType,
        pan_number: panNumber,
        gstin: gstin || undefined,
        bank_account: JSON.stringify({ bank, ifsc, account_number: accountNumber, upi_id: upiId || undefined }),
        agreement_accepted: true,
      };
      await createDealer(getStoredAccessToken(), req as unknown as CreateDealerRequest);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-6 space-y-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-semibold text-text-primary">Dealer Registration</h2>

      {error && (
        <div className="p-3 rounded-lg bg-feedback-error/10 text-feedback-error text-sm">{error}</div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Business Name *</label>
          <input
            type="text"
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            required
            minLength={2}
            maxLength={255}
            className="input-base w-full"
            placeholder="Your business name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Dealer Email *</label>
          <input
            type="email"
            value={dealerEmail}
            onChange={(e) => setDealerEmail(e.target.value)}
            required
            className="input-base w-full"
            placeholder="dealer@example.com"
          />
          <p className="text-xs text-text-tertiary mt-1">Login credentials will be sent to this address on approval.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">State *</label>
          <select
            value={stateId}
            onChange={(e) => setStateId(Number(e.target.value))}
            required
            className="input-base w-full min-h-[44px]"
          >
            <option value={0}>Select state</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Territory Type *</label>
          <div className="flex gap-4">
            {(["primary", "secondary", "ambassador"] as const).map((type) => (
              <label key={type} className="flex items-center gap-2 min-h-[44px] cursor-pointer">
                <input
                  type="radio"
                  name="territory_type"
                  value={type}
                  checked={territoryType === type}
                  onChange={() => setTerritoryType(type)}
                  className="accent-accent-primary"
                />
                <span className="text-text-primary capitalize">{type}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">PAN Number *</label>
            <input
              type="text"
              value={panNumber}
              onChange={(e) => validatePAN(e.target.value)}
              required
              maxLength={10}
              className="input-base w-full"
              placeholder="ABCDE1234F"
            />
            {panError && <p className="text-xs text-feedback-error mt-1">{panError}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">GSTIN</label>
            <input
              type="text"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              className="input-base w-full"
              placeholder="22AAAAA0000A1Z5"
            />
          </div>
        </div>

        <fieldset className="border border-border-default rounded-lg p-4 space-y-3">
          <legend className="text-sm font-medium text-text-secondary px-2">Bank Account Details *</legend>
          <input
            type="text"
            value={bank}
            onChange={(e) => setBank(e.target.value)}
            required
            className="input-base w-full"
            placeholder="Bank Name"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <input
                type="text"
                value={ifsc}
                onChange={(e) => validateIFSC(e.target.value)}
                required
                maxLength={11}
                className="input-base w-full"
                placeholder="IFSC Code"
              />
              {ifscError && <p className="text-xs text-feedback-error mt-1">{ifscError}</p>}
            </div>
            <input
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              required
              pattern="[0-9]{9,18}"
              className="input-base w-full"
              placeholder="Account Number"
            />
          </div>
          <input
            type="text"
            value={upiId}
            onChange={(e) => setUpiId(e.target.value)}
            className="input-base w-full"
            placeholder="UPI ID (optional)"
          />
        </fieldset>

        <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
          <input
            type="checkbox"
            checked={agreement}
            onChange={(e) => setAgreement(e.target.checked)}
            required
            className="mt-1 accent-accent-primary"
          />
          <span className="text-sm text-text-secondary">
            I accept the Dealer Agreement and acknowledge the terms and conditions of the RawDrive
            dealer program.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isSubmitting || !agreement}
        className="btn-primary w-full min-h-[44px] disabled:opacity-50"
      >
        {isSubmitting ? "Registering..." : "Submit Registration"}
      </button>
    </form>
  );
}
