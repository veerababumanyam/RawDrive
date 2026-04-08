// Design source: design-tokens.json semantic classes
"use client";

import { useState, type FormEvent } from "react";
import { createDealer, type CreateDealerRequest } from "@/lib/api/dealer";

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

interface Props {
  onSuccess: () => void;
}

export default function DealerRegistrationForm({ onSuccess }: Props) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [businessName, setBusinessName] = useState("");
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
      const req: CreateDealerRequest = {
        business_name: businessName,
        state_id: stateId,
        territory_type: territoryType,
        pan_number: panNumber,
        gstin: gstin || undefined,
        bank_account: { bank, ifsc, account_number: accountNumber, upi_id: upiId || undefined },
        agreement_accepted: true,
      };
      await createDealer("", req);
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
          <label className="block text-sm font-medium text-text-secondary mb-1">State *</label>
          <select
            value={stateId}
            onChange={(e) => setStateId(Number(e.target.value))}
            required
            className="input-base w-full min-h-[44px]"
          >
            <option value={0}>Select state</option>
            {/* States populated from API */}
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
