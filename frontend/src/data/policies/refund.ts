import { PolicyDocument } from '../../types/policies';

const refund: PolicyDocument = {
  type: 'refund',
  title: 'Refund and Cancellation Policy',
  version: '1.0.0',
  lastUpdated: '2025-12-19',
  sections: [
    {
      id: 'introduction',
      heading: 'Introduction',
      content: `<p>This refund and cancellation policy outlines how you can cancel or seek a refund for a product/service that you have purchased through the Platform.</p>`,
    },
    {
      id: 'refund-processing',
      heading: 'Refund Processing',
      content: `<p>In case of any refunds approved by SWAZ CONSULTANTS, it will take <strong>7 days</strong> for the refund to be processed to you.</p>
      <p>The refund will be credited to the original payment method used during the purchase.</p>`,
    },
    {
      id: 'return-policy',
      heading: 'Return Policy',
      content: `<p>We offer refund/exchange within first <strong>7 days</strong> from the date of your purchase. If 7 days have passed since your purchase, you will not be offered a return, exchange or refund of any kind.</p>
      <p><strong>Eligibility for Returns/Exchanges:</strong></p>
      <p>In order to become eligible for a return or an exchange:</p>
      <ol>
        <li>The purchased item should be <strong>unused</strong> and in the <strong>same condition</strong> as you received it</li>
        <li>The item must have <strong>original packaging</strong></li>
        <li>If the item that you purchased on a sale, then the item may not be eligible for a return/exchange</li>
      </ol>
      <p>Further, only such items are replaced by us (based on an exchange request), if such items are found defective or damaged.</p>`,
    },
    {
      id: 'exempted-categories',
      heading: 'Exempted Categories',
      content: `<p>You agree that there may be a certain category of products/items that are exempted from returns or refunds. Such categories of the products would be identified to you at the time of purchase.</p>`,
    },
    {
      id: 'contact-customer-service',
      heading: 'Contact Customer Service',
      content: `<p>For any questions or concerns regarding refunds, cancellations, returns, or shipping, please contact our customer service team:</p>
      <p><strong>SWAZ CONSULTANTS</strong><br/>
      54-05-10 Revenue Ward No 28<br/>
      Addepalli Colony, Rajahmundry<br/>
      Andhra Pradesh, India</p>
      <p><strong>Contact Hours:</strong> Monday - Friday (9:00 AM - 6:00 PM IST)</p>`,
    },
  ],
};

export default refund;
