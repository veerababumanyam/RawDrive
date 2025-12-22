import React, { useState } from 'react';
import {
  LandingLayout,
  LandingHeader,
  LandingFooter,
  SEOHead,
  StructuredData,
} from '../../components/landing';
import { FadeIn } from '../../components/landing/animations/FadeIn';

/* =============================================================================
   ContactPage Component

   Contact page with form and contact information.
   ============================================================================= */

interface ContactFormData {
  name: string;
  email: string;
  subject: string;
  message: string;
  inquiryType: string;
}

const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState<ContactFormData>({
    name: '',
    email: '',
    subject: '',
    message: '',
    inquiryType: 'general',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Simulate form submission
      await new Promise(resolve => setTimeout(resolve, 2000));

      // In a real app, you would send this to your backend
      console.log('Form submitted:', formData);

      setSubmitStatus('success');
      setFormData({
        name: '',
        email: '',
        subject: '',
        message: '',
        inquiryType: 'general',
      });
    } catch (error) {
      setSubmitStatus('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Structured data for contact page
  const structuredDataProps = {
    organization: {
      name: 'RawDrive',
      url: 'https://rawdrive.ai',
      logo: 'https://rawdrive.ai/logo.png',
      contactPoint: {
        contactType: 'customer support',
        email: 'support@rawdrive.ai',
        telephone: '+91-XXXXXXXXXX', // Replace with actual number
      },
    },
  };

  return (
    <>
      {/* SEO Meta Tags */}
      <SEOHead
        title="Contact Us | RawDrive"
        description="Get in touch with RawDrive. We're here to help with your photography business needs. Contact our support team for assistance."
        keywords={['contact RawDrive', 'photography support', 'customer service', 'help']}
        canonicalUrl="/contact"
      />

      {/* Structured Data */}
      <StructuredData {...structuredDataProps} />

      <LandingLayout>
        {/* Skip to main content link */}
        <a
          href="#main-content"
          className="
            sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4
            bg-primary-600 text-white px-4 py-2 rounded-lg z-[100]
            focus:outline-none focus:ring-2 focus:ring-white
          "
        >
          Skip to main content
        </a>

        <LandingHeader />

        {/* Main Content */}
        <main id="main-content" className="pb-16">
          <div className="container mx-auto px-4 md:px-6 lg:px-8">
            {/* Hero Section */}
            <FadeIn>
              <section className="py-16 md:py-20 lg:py-24">
                <div className="max-w-4xl mx-auto text-center">
                  <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
                    Get in Touch
                  </h1>
                  <p className="text-xl md:text-2xl text-slate-300 mb-8 leading-relaxed">
                    Have questions about RawDrive? Need help with your photography business?
                    We're here to help you succeed.
                  </p>
                </div>
              </section>
            </FadeIn>

            <div className="max-w-6xl mx-auto">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-16">
                {/* Contact Form */}
                <FadeIn direction="left">
                  <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 md:p-10">
                    <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                      Send us a Message
                    </h2>

                    {submitStatus === 'success' && (
                      <div className="mb-6 p-4 bg-green-500/10 border border-green-400/20 rounded-xl">
                        <div className="flex items-start gap-3">
                          <svg className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-green-400 font-medium mb-1">Message Sent Successfully!</p>
                            <p className="text-slate-300 text-sm">
                              Thank you for contacting us. We'll get back to you within 24 hours.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {submitStatus === 'error' && (
                      <div className="mb-6 p-4 bg-red-500/10 border border-red-400/20 rounded-xl">
                        <div className="flex items-start gap-3">
                          <svg className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                          </svg>
                          <div>
                            <p className="text-red-400 font-medium mb-1">Failed to Send Message</p>
                            <p className="text-slate-300 text-sm">
                              Please try again or contact us directly at support@rawdrive.ai
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                            Full Name *
                          </label>
                          <input
                            type="text"
                            id="name"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-colors"
                            placeholder="Your full name"
                          />
                        </div>
                        <div>
                          <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                            Email Address *
                          </label>
                          <input
                            type="email"
                            id="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-colors"
                            placeholder="your@email.com"
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="inquiryType" className="block text-sm font-medium text-slate-300 mb-2">
                          Inquiry Type
                        </label>
                        <select
                          id="inquiryType"
                          name="inquiryType"
                          value={formData.inquiryType}
                          onChange={handleInputChange}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-colors"
                        >
                          <option value="general">General Inquiry</option>
                          <option value="support">Technical Support</option>
                          <option value="billing">Billing & Pricing</option>
                          <option value="partnership">Partnership</option>
                          <option value="feedback">Feedback</option>
                          <option value="other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                          Subject *
                        </label>
                        <input
                          type="text"
                          id="subject"
                          name="subject"
                          value={formData.subject}
                          onChange={handleInputChange}
                          required
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-colors"
                          placeholder="Brief description of your inquiry"
                        />
                      </div>

                      <div>
                        <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                          Message *
                        </label>
                        <textarea
                          id="message"
                          name="message"
                          value={formData.message}
                          onChange={handleInputChange}
                          required
                          rows={6}
                          className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:border-transparent transition-colors resize-vertical"
                          placeholder="Please provide details about your inquiry..."
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                      >
                        {isSubmitting ? (
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending...
                          </div>
                        ) : (
                          'Send Message'
                        )}
                      </button>
                    </form>
                  </div>
                </FadeIn>

                {/* Contact Information */}
                <FadeIn direction="right">
                  <div className="space-y-8">
                    {/* Contact Methods */}
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-8 md:p-10">
                      <h2 className="text-2xl md:text-3xl font-bold text-white mb-6">
                        Contact Information
                      </h2>

                      <div className="space-y-6">
                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-400/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-1">Email Support</h3>
                            <p className="text-slate-300 mb-2">
                              Get in touch with our support team for quick assistance.
                            </p>
                            <a
                              href="mailto:support@rawdrive.ai"
                              className="text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                              support@rawdrive.ai
                            </a>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-400/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                          </svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-1">Help Center</h3>
                            <p className="text-slate-300 mb-2">
                              Find answers to common questions in our comprehensive help center.
                            </p>
                            <a
                              href="/faq"
                              className="text-cyan-400 hover:text-cyan-300 transition-colors"
                            >
                              Visit FAQ →
                            </a>
                          </div>
                        </div>

                        <div className="flex items-start gap-4">
                          <div className="w-12 h-12 bg-cyan-500/10 border border-cyan-400/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <svg className="w-6 h-6 text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 2L3 7v11a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V7l-7-5z" clipRule="evenodd" />
                            </svg>
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-white mb-1">Business Address</h3>
                            <p className="text-slate-300">
                              SWAZ CONSULTANTS<br />
                              54-05-10 Revenue Ward No 28<br />
                              Addepalli Colony, Rajahmundry<br />
                              Andhra Pradesh, India
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Response Time */}
                    <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-400/20 rounded-2xl p-6">
                      <div className="flex items-start gap-4">
                        <svg className="w-8 h-8 text-cyan-400 mt-1 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        <div>
                          <h3 className="text-lg font-semibold text-white mb-2">Response Time</h3>
                          <p className="text-slate-300">
                            We typically respond to all inquiries within 24 hours during business days.
                            For urgent technical issues, please include "URGENT" in your subject line.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Social Links */}
                    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-2xl p-6">
                      <h3 className="text-lg font-semibold text-white mb-4">Follow Us</h3>
                      <div className="flex gap-4">
                        <a
                          href="https://twitter.com/rawdrive"
                          className="w-10 h-10 bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-400/30 rounded-lg flex items-center justify-center transition-colors"
                          aria-label="Follow us on Twitter"
                        >
                          <svg className="w-5 h-5 text-slate-300 hover:text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M6.29 18.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0020 3.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.073 4.073 0 01.8 7.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 010 16.407a11.616 11.616 0 006.29 1.84" />
                          </svg>
                        </a>
                        <a
                          href="https://linkedin.com/company/rawdrive"
                          className="w-10 h-10 bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-400/30 rounded-lg flex items-center justify-center transition-colors"
                          aria-label="Follow us on LinkedIn"
                        >
                          <svg className="w-5 h-5 text-slate-300 hover:text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.338 16.338H13.67V12.16c0-.995-.017-2.277-1.387-2.277-1.39 0-1.601 1.086-1.601 2.207v4.248H8.014v-8.59h2.559v1.174h.037c.356-.675 1.227-1.387 2.526-1.387 2.703 0 3.203 1.778 3.203 4.092v4.711zM5.005 6.575a1.548 1.548 0 11-.003-3.096 1.548 1.548 0 01.003 3.096zm-1.337 9.763H6.34v-8.59H3.667v8.59zM17.668 1H2.328C1.595 1 1 1.581 1 2.298v15.403C1 18.418 1.595 19 2.328 19h15.34c.734 0 1.332-.582 1.332-1.299V2.298C19 1.581 18.402 1 17.668 1z" clipRule="evenodd" />
                          </svg>
                        </a>
                        <a
                          href="https://instagram.com/rawdrive"
                          className="w-10 h-10 bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-400/30 rounded-lg flex items-center justify-center transition-colors"
                          aria-label="Follow us on Instagram"
                        >
                          <svg className="w-5 h-5 text-slate-300 hover:text-cyan-400" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M12.017 0H7.99C5.22 0 3 2.187 3 4.92v4.096c0 2.733 2.22 4.92 4.99 4.92h4.027c2.77 0 4.99-2.187 4.99-4.92V4.92C17.007 2.187 14.787 0 12.017 0zm2.937 9.016c0 1.624-1.333 2.938-2.977 2.938H7.99c-1.644 0-2.977-1.314-2.977-2.938V4.92c0-1.624 1.333-2.938 2.977-2.938h4.027c1.644 0 2.977 1.314 2.977 2.938v4.096z" clipRule="evenodd" />
                            <path d="M10.005 5.21a2.81 2.81 0 100 5.62 2.81 2.81 0 000-5.62zM12.75 5.21a.56.56 0 100 1.12.56.56 0 000-1.12z" />
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
                </FadeIn>
              </div>
            </div>
          </div>
        </main>

        <LandingFooter />
      </LandingLayout>
    </>
  );
};

export default ContactPage;