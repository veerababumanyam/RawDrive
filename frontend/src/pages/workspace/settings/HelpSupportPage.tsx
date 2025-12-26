/**
 * Help & Support Page
 *
 * Comprehensive help center with FAQ, documentation links, contact support,
 * and system status. Uses glassmorphism design consistent with other settings pages.
 */

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  HelpCircle,
  BookOpen,
  Video,
  Sparkles,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Mail,
  MessageCircle,
  Phone,
  Users,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

/* =============================================================================
   Constants
   ============================================================================= */

const FAQ_ITEMS = [
  {
    id: 'account-1',
    category: 'Account & Billing',
    question: 'How do I upgrade my subscription?',
    answer: 'Navigate to Settings > Billing to view available plans and upgrade your subscription. You can choose from Starter, Professional, Business, or Enterprise plans based on your needs.',
  },
  {
    id: 'account-2',
    category: 'Account & Billing',
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes, you can cancel your subscription at any time from the Billing settings. Your access will continue until the end of the current billing period.',
  },
  {
    id: 'gallery-1',
    category: 'Gallery & Photos',
    question: 'What file formats are supported?',
    answer: 'RawDrive supports JPG, PNG, WebP, and GIF for images, and MP4, MOV, and WebM for videos. Maximum file size is 50MB per file.',
  },
  {
    id: 'gallery-2',
    category: 'Gallery & Photos',
    question: 'How do I share a gallery with clients?',
    answer: 'Open your gallery, click the Share button, and enter your client\'s email address. They will receive an invitation to view the gallery. You can also set password protection for added security.',
  },
  {
    id: 'ai-1',
    category: 'AI Features',
    question: 'How does face detection work?',
    answer: 'Our AI automatically detects and recognizes faces in your photos. Go to the People panel in any gallery to see detected faces. You can name individuals and quickly filter photos by person.',
  },
  {
    id: 'privacy-1',
    category: 'Privacy & Security',
    question: 'Is my data secure?',
    answer: 'Yes, all data is encrypted in transit and at rest. We use industry-standard security practices and comply with GDPR. You can review our Privacy Policy for more details.',
  },
];

const SUPPORT_EMAIL = 'support@rawdrive.com';
const STATUS_PAGE_URL = 'https://status.rawdrive.com';
const COMMUNITY_URL = 'https://community.rawdrive.com';

/* =============================================================================
   Subcomponents
   ============================================================================= */

interface ResourceCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  iconVariant?: 'primary' | 'accent' | 'warning' | 'success';
  onClick?: () => void;
}

const ResourceCard: React.FC<ResourceCardProps> = ({
  icon,
  title,
  description,
  iconVariant = 'primary',
  onClick,
}) => {
  const variantClasses = {
    primary: 'icon-container-primary',
    accent: 'icon-container-accent',
    warning: 'icon-container-warning',
    success: 'icon-container-success',
  };

  return (
    <button
      onClick={onClick}
      className="group glass-list-item flex items-start gap-4 p-4 rounded-xl text-left w-full transition-all hover:shadow-md hover:scale-[1.02]"
    >
      <div className={`icon-container icon-container-lg ${variantClasses[iconVariant]} rounded-xl shadow-md flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-text-primary group-hover:text-primary transition-colors">
          {title}
        </div>
        <div className="text-sm text-text-tertiary mt-0.5">
          {description}
        </div>
      </div>
      <ExternalLink size={16} className="text-text-tertiary group-hover:text-primary transition-colors flex-shrink-0 mt-1" />
    </button>
  );
};

interface FAQItemProps {
  question: string;
  answer: string;
  isOpen: boolean;
  onToggle: () => void;
}

const FAQItem: React.FC<FAQItemProps> = ({ question, answer, isOpen, onToggle }) => (
  <div className="glass-list-item rounded-xl overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-4 text-left transition-colors hover:bg-surface-hover/50"
      aria-expanded={isOpen}
    >
      <span className="font-medium text-text-primary pr-4">{question}</span>
      {isOpen ? (
        <ChevronUp size={20} className="text-primary flex-shrink-0" />
      ) : (
        <ChevronDown size={20} className="text-text-tertiary flex-shrink-0" />
      )}
    </button>
    {isOpen && (
      <div className="px-4 pb-4 text-text-secondary text-sm leading-relaxed border-t border-border/30 pt-3 mx-4 mb-0">
        {answer}
      </div>
    )}
  </div>
);

interface ContactCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  iconVariant?: 'primary' | 'accent' | 'warning' | 'success' | 'error';
}

const ContactCard: React.FC<ContactCardProps> = ({
  icon,
  title,
  description,
  action,
  href,
  onClick,
  disabled = false,
  iconVariant = 'primary',
}) => {
  const variantClasses = {
    primary: 'icon-container-primary',
    accent: 'icon-container-accent',
    warning: 'icon-container-warning',
    success: 'icon-container-success',
    error: 'icon-container-error',
  };

  const content = (
    <div className={`group glass-list-item p-5 rounded-xl transition-all ${disabled ? 'opacity-60' : 'hover:shadow-md hover:scale-[1.02]'}`}>
      <div className={`icon-container icon-container-lg ${variantClasses[iconVariant]} rounded-xl shadow-md mb-4`}>
        {icon}
      </div>
      <h3 className="font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-tertiary mb-4">{description}</p>
      <span className={`text-sm font-medium ${disabled ? 'text-text-disabled' : 'text-primary group-hover:underline'}`}>
        {action}
      </span>
    </div>
  );

  if (disabled) {
    return content;
  }

  if (href) {
    return (
      <a href={href} target={href.startsWith('mailto:') ? undefined : '_blank'} rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }

  return (
    <button onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
};

/* =============================================================================
   Main Component
   ============================================================================= */

const HelpSupportPage: React.FC = () => {
  const { t } = useTranslation('common');
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  const handleFaqToggle = (id: string) => {
    setOpenFaqId(openFaqId === id ? null : id);
  };

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Page Header */}
      <div className="sticky top-0 z-10 glass-premium border-b border-white/10 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl sm:text-2xl font-bold text-gradient flex items-center gap-3">
                <div className="section-header-icon icon-container-accent">
                  <HelpCircle className="w-5 h-5" />
                </div>
                {t('nav.help')}
              </h1>
              <p className="text-sm text-text-secondary hidden sm:block mt-0.5">
                {t('help.description', { defaultValue: 'Find answers, get assistance, and explore resources' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto py-6 sm:py-8 px-4 sm:px-6 lg:px-8">
        <div className="space-y-6 sm:space-y-8">
          {/* Help Center Section */}
          <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="icon-container icon-container-lg icon-container-primary rounded-xl shadow-lg">
                <BookOpen size={22} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t('help.helpCenter.title', { defaultValue: 'Help Center' })}
                </h2>
                <p className="text-sm text-text-secondary mt-0.5">
                  {t('help.helpCenter.description', { defaultValue: 'Browse our guides and documentation' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ResourceCard
                icon={<BookOpen size={20} />}
                title={t('help.helpCenter.gettingStarted', { defaultValue: 'Getting Started' })}
                description={t('help.helpCenter.gettingStartedDesc', { defaultValue: 'Learn the basics of RawDrive' })}
                iconVariant="primary"
              />
              <ResourceCard
                icon={<LayoutGrid size={20} />}
                title={t('help.helpCenter.galleries', { defaultValue: 'Gallery Management' })}
                description={t('help.helpCenter.galleriesDesc', { defaultValue: 'Create and manage client galleries' })}
                iconVariant="accent"
              />
              <ResourceCard
                icon={<Sparkles size={20} />}
                title={t('help.helpCenter.aiFeatures', { defaultValue: 'AI Features' })}
                description={t('help.helpCenter.aiFeaturesDesc', { defaultValue: 'Face detection and smart organization' })}
                iconVariant="warning"
              />
              <ResourceCard
                icon={<Video size={20} />}
                title={t('help.helpCenter.videoTutorials', { defaultValue: 'Video Tutorials' })}
                description={t('help.helpCenter.videoTutorialsDesc', { defaultValue: 'Watch step-by-step guides' })}
                iconVariant="success"
              />
            </div>
          </section>

          {/* FAQ Section */}
          <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="icon-container icon-container-lg icon-container-accent rounded-xl shadow-lg">
                <HelpCircle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t('help.faq.title', { defaultValue: 'Frequently Asked Questions' })}
                </h2>
                <p className="text-sm text-text-secondary mt-0.5">
                  {t('help.faq.description', { defaultValue: 'Quick answers to common questions' })}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {FAQ_ITEMS.map((item) => (
                <FAQItem
                  key={item.id}
                  question={item.question}
                  answer={item.answer}
                  isOpen={openFaqId === item.id}
                  onToggle={() => handleFaqToggle(item.id)}
                />
              ))}
            </div>
          </section>

          {/* Contact Support Section */}
          <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
            <div className="flex items-start gap-4 mb-6">
              <div className="icon-container icon-container-lg icon-container-warning rounded-xl shadow-lg">
                <MessageCircle size={22} />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  {t('help.contact.title', { defaultValue: 'Contact Support' })}
                </h2>
                <p className="text-sm text-text-secondary mt-0.5">
                  {t('help.contact.description', { defaultValue: 'Get in touch with our support team' })}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <ContactCard
                icon={<Mail size={22} />}
                title={t('help.contact.email', { defaultValue: 'Email Support' })}
                description={t('help.contact.emailDesc', { defaultValue: 'We typically respond within 24 hours' })}
                action={SUPPORT_EMAIL}
                href={`mailto:${SUPPORT_EMAIL}`}
                iconVariant="primary"
              />
              <ContactCard
                icon={<MessageCircle size={22} />}
                title={t('help.contact.chat', { defaultValue: 'Live Chat' })}
                description={t('help.contact.chatDesc', { defaultValue: 'Chat with our support team' })}
                action="Coming Soon"
                disabled
                iconVariant="accent"
              />
              <ContactCard
                icon={<Phone size={22} />}
                title={t('help.contact.phone', { defaultValue: 'Phone Support' })}
                description={t('help.contact.phoneDesc', { defaultValue: 'Available for Business & Enterprise' })}
                action="Business Plans Only"
                disabled
                iconVariant="warning"
              />
              <ContactCard
                icon={<Users size={22} />}
                title={t('help.contact.community', { defaultValue: 'Community Forum' })}
                description={t('help.contact.communityDesc', { defaultValue: 'Connect with other photographers' })}
                action="Join Community"
                href={COMMUNITY_URL}
                iconVariant="success"
              />
            </div>
          </section>

          {/* System Status Section */}
          <section className="glass-card glass-card-hover rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-start gap-4">
                <div className="icon-container icon-container-lg icon-container-success rounded-xl shadow-lg">
                  <CheckCircle2 size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    {t('help.status.title', { defaultValue: 'System Status' })}
                  </h2>
                  <p className="text-sm text-success flex items-center gap-2 mt-0.5">
                    <span className="w-2 h-2 bg-success rounded-full animate-pulse" />
                    {t('help.status.operational', { defaultValue: 'All Systems Operational' })}
                  </p>
                </div>
              </div>
              <a
                href={STATUS_PAGE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-sm flex items-center gap-2"
              >
                {t('help.status.viewStatus', { defaultValue: 'View Status Page' })}
                <ExternalLink size={14} />
              </a>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default HelpSupportPage;
