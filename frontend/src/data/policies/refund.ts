import { PolicyDocument } from '../../types/policies';

const refund: PolicyDocument = {
  type: 'refund',
  title: 'Refund and Cancellation Policy',
  version: '1.1.0',
  lastUpdated: '2025-12-27',
  sections: [
    {
      id: 'introduction',
      heading: 'Introduction',
      content: `<p>This refund and cancellation policy outlines how you can cancel your RawDrive subscription or seek a refund for services purchased through our Platform.</p>
      <p>RawDrive is a Software-as-a-Service (SaaS) platform for professional photographers. This policy applies to all subscription plans and paid features.</p>`,
    },
    {
      id: 'free-trial',
      heading: 'Free Trial',
      content: `<p>RawDrive offers a <strong>14-day free trial</strong> for new users on eligible plans. During the trial period:</p>
      <ul>
        <li>No payment method is required to start your trial</li>
        <li>You have access to all features included in the plan you're trialing</li>
        <li>Your trial will automatically end after 14 days unless you choose to subscribe</li>
        <li>No charges will be made if you do not subscribe before the trial ends</li>
      </ul>
      <p>We encourage you to fully evaluate RawDrive during the trial period to ensure it meets your needs before subscribing.</p>`,
    },
    {
      id: 'subscription-cancellation',
      heading: 'Subscription Cancellation',
      content: `<p>You may cancel your RawDrive subscription at any time through your account settings or by contacting our support team.</p>
      <p><strong>How Cancellation Works:</strong></p>
      <ul>
        <li>Your subscription will remain active until the end of your current billing period</li>
        <li>You will not be charged for subsequent billing periods after cancellation</li>
        <li>Access to premium features will continue until your current billing period ends</li>
        <li>After cancellation, your account will be downgraded to the free plan (if available) or deactivated</li>
      </ul>
      <p><strong>Note:</strong> Cancellation does not automatically delete your data. See the "Data Retention After Cancellation" section for details.</p>`,
    },
    {
      id: 'refund-eligibility',
      heading: 'Refund Eligibility',
      content: `<p>RawDrive offers refunds under the following conditions:</p>
      <p><strong>30-Day Money-Back Guarantee (New Subscriptions):</strong></p>
      <ul>
        <li>If you are a new subscriber and are not satisfied with RawDrive, you may request a full refund within <strong>30 days</strong> of your first payment</li>
        <li>This guarantee applies only to the first payment on a new subscription</li>
        <li>The guarantee does not apply to renewal payments or users who have previously received a refund</li>
      </ul>
      <p><strong>Technical Issues:</strong></p>
      <ul>
        <li>If RawDrive experiences significant downtime or technical issues that prevent you from using the service for an extended period, you may be eligible for a prorated refund or service credit</li>
        <li>Please contact support with details of the issue for evaluation</li>
      </ul>
      <p><strong>Billing Errors:</strong></p>
      <ul>
        <li>If you were charged in error (e.g., duplicate charges, charges after cancellation), we will promptly issue a full refund</li>
      </ul>`,
    },
    {
      id: 'non-refundable',
      heading: 'Non-Refundable Items',
      content: `<p>The following are generally not eligible for refunds:</p>
      <ul>
        <li>Subscription fees after the 30-day money-back guarantee period</li>
        <li>Partial month refunds (we do not prorate cancellations)</li>
        <li>Add-on storage or bandwidth purchased</li>
        <li>One-time setup fees or professional services</li>
        <li>Accounts terminated for Terms of Service violations</li>
      </ul>`,
    },
    {
      id: 'refund-processing',
      heading: 'Refund Processing',
      content: `<p>Once a refund is approved:</p>
      <ul>
        <li>Refunds are processed within <strong>7-10 business days</strong></li>
        <li>The refund will be credited to the original payment method used during purchase</li>
        <li>Depending on your bank or credit card company, it may take an additional 5-10 business days for the refund to appear on your statement</li>
      </ul>
      <p>You will receive an email confirmation when your refund has been processed.</p>`,
    },
    {
      id: 'data-retention',
      heading: 'Data Retention After Cancellation',
      content: `<p>After you cancel your subscription:</p>
      <ul>
        <li>Your photos and data will be retained for <strong>30 days</strong> after your subscription ends</li>
        <li>During this period, you can reactivate your subscription to regain access to your data</li>
        <li>After 30 days, your data may be permanently deleted in accordance with our data retention policies</li>
        <li>We recommend downloading or exporting your photos before cancelling if you wish to retain them</li>
      </ul>
      <p>If you need more time to export your data, please contact support before the 30-day period ends.</p>`,
    },
    {
      id: 'how-to-request-refund',
      heading: 'How to Request a Refund',
      content: `<p>To request a refund:</p>
      <ol>
        <li>Email our support team at <strong>support@rawdrive.ai</strong></li>
        <li>Include your account email address and the reason for your refund request</li>
        <li>Our team will review your request and respond within 2 business days</li>
      </ol>
      <p>Please note that refund decisions are made on a case-by-case basis, and we reserve the right to deny refund requests that do not meet the criteria outlined in this policy.</p>`,
    },
    {
      id: 'contact-customer-service',
      heading: 'Contact Customer Service',
      content: `<p>For any questions or concerns regarding refunds, cancellations, or billing, please contact our customer service team:</p>
      <p><strong>Email:</strong> support@rawdrive.ai</p>
      <p><strong>Company:</strong> SWAZ CONSULTANTS<br/>
      54-05-10 Revenue Ward No 28<br/>
      Addepalli Colony, Rajahmundry<br/>
      Andhra Pradesh, India</p>
      <p><strong>Support Hours:</strong> Monday - Friday (9:00 AM - 6:00 PM IST)</p>
      <p>We typically respond to all inquiries within 24-48 hours.</p>`,
    },
  ],
};

export default refund;
