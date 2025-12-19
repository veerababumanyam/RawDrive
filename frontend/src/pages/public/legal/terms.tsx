import LegalPageLayout from '../../../components/legal/LegalPageLayout';
import PolicyContent from '../../../components/legal/PolicyContent';
import policies from '../../../data/policies/terms';

export default function TermsPage() {
  return (
    <LegalPageLayout policy={policies}>
      <PolicyContent sections={policies.sections} />
    </LegalPageLayout>
  );
}
