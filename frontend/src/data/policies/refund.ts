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
      id: 'cancellation-policy',
      heading: 'Cancellation Policy',
      content: `<p>Under this policy:</p>
      <ol>
        <li><strong>Cancellation Window:</strong> Cancellations will only be considered if the request is made within <strong>7 days</strong> of placing the order. However, cancellation requests may not be entertained if the orders have been communicated to such sellers/merchant(s) listed on the Platform and they have initiated the process of shipping them, or the product is out for delivery. In such an event, you may choose to reject the product at the doorstep.</li>
        <li><strong>Perishable Items:</strong> SWAZ CONSULTANTS does not accept cancellation requests for perishable items like flowers, eatables, etc. However, the refund/replacement can be made if the user establishes that the quality of the product delivered is not good.</li>
        <li><strong>Damaged or Defective Items:</strong> In case of receipt of damaged or defective items, please report to our customer service team. The request would be entertained once the seller/merchant listed on the Platform, has checked and determined the same at its own end. This should be reported within <strong>7 days</strong> of receipt of products.</li>
        <li><strong>Product Not as Expected:</strong> In case you feel that the product received is not as shown on the site or as per your expectations, you must bring it to the notice of our customer service within <strong>7 days</strong> of receiving the product. The customer service team after looking into your complaint will take an appropriate decision.</li>
        <li><strong>Warranty Items:</strong> In case of complaints regarding the products that come with a warranty from the manufacturers, please refer the issue to them.</li>
      </ol>`,
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
      id: 'return-process',
      heading: 'Return Process',
      content: `<p>For exchange/return accepted request(s) (as applicable), once your returned product/item is received and inspected by us, we will send you an email to notify you about receipt of the returned/exchanged product.</p>
      <p>Further, if the same has been approved after the quality check at our end, your request (i.e. return/exchange) will be processed in accordance with our policies.</p>`,
    },
    {
      id: 'shipping-policy',
      heading: 'Shipping Policy',
      content: `<p>The orders for the user are shipped through registered domestic courier companies and/or speed post only.</p>
      <p><strong>Shipping Timeline:</strong> Orders are shipped within <strong>2 days</strong> from the date of the order and/or payment or as per the delivery date agreed at the time of order confirmation and delivering of the shipment, subject to courier company/post office norms.</p>
      <p><strong>Delivery Address:</strong> Delivery of all orders will be made to the address provided by the buyer at the time of purchase. Delivery of our services will be confirmed on your email ID as specified at the time of registration.</p>
      <p><strong>Shipping Costs:</strong> If there are any shipping cost(s) levied by the seller or the Platform Owner (as the case be), the same is not refundable.</p>
      <p><strong>Delivery Delays:</strong> Platform Owner shall not be liable for any delay in delivery by the courier company/postal authority.</p>`,
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
