// Types for policy documents and user acceptance

export type PolicyType =
  | 'terms'
  | 'privacy'
  | 'refund'
  | 'data-protection'
  | 'acceptable-use'
  | 'limitation-of-liability'
  | 'intellectual-property'
  | 'cookies'
  | 'dispute-resolution'
  | 'cancellation'
  | 'sla';

export interface PolicyDocument {
  type: PolicyType;
  title: string;
  version: string;
  lastUpdated: string; // ISO date
  sections: PolicySection[];
}

export interface PolicySection {
  id: string;
  heading: string;
  content: string;
  children?: PolicySection[];
}

export interface UserAcceptance {
  userId: string;
  policyType: PolicyType;
  acceptedVersion: string;
  acceptedAt: string; // ISO date
}
