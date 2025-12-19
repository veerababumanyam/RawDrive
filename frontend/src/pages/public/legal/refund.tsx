import LegalPageLayout from '../../../components/legal/LegalPageLayout';
import PolicyContent from '../../../components/legal/PolicyContent';
import policies from '../../../data/policies/refund';

export default function RefundPage() {
  return (
    <LegalPageLayout policy={policies}>
      <PolicyContent sections={policies.sections} />
    </LegalPageLayout>
  );
}
