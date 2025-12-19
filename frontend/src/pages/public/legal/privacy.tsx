import LegalPageLayout from '../../../components/legal/LegalPageLayout';
import PolicyContent from '../../../components/legal/PolicyContent';
import policies from '../../../data/policies/privacy';

export default function PrivacyPage() {
  return (
    <LegalPageLayout policy={policies}>
      <PolicyContent sections={policies.sections} />
    </LegalPageLayout>
  );
}
