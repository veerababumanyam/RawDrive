# Support Playbook

## Overview

The support playbook provides comprehensive guidance for customer support teams to handle common issues, troubleshoot problems, and deliver excellent customer service. This document covers support processes, troubleshooting guides, escalation procedures, and best practices.

## Purpose

The support playbook serves to:
- **Standardize Support**: Consistent support experience
- **Reduce Resolution Time**: Quick issue resolution
- **Improve Satisfaction**: Better customer experience
- **Enable Self-Service**: Empower customers
- **Document Solutions**: Reusable solutions
- **Enable Escalation**: Clear escalation paths

---

## Support Channels

### Available Channels

Support available through multiple channels.

**Support Channels:**
- Email: support@rawdrive.com
- Chat: https://support.rawdrive.com (live chat)
- Phone: +1-555-RAWDRIVE (Business/Enterprise only)
- Help Center: https://help.rawdrive.com
- Community Forum: https://community.rawdrive.com
- Social Media: @rawdrive on Twitter/Instagram

### Response Time SLA

Support response times by tier.

**Response Time SLA:**
```typescript
interface SLAByTier {
  free: {
    responseTime: '48 hours',
    resolutionTime: '7 days',
    channels: ['email', 'help_center'],
  },
  starter: {
    responseTime: '24 hours',
    resolutionTime: '3 days',
    channels: ['email', 'chat', 'help_center'],
  },
  professional: {
    responseTime: '12 hours',
    resolutionTime: '1 day',
    channels: ['email', 'chat', 'phone', 'help_center'],
  },
  business: {
    responseTime: '4 hours',
    resolutionTime: '4 hours',
    channels: ['email', 'chat', 'phone', 'help_center'],
  },
  enterprise: {
    responseTime: '1 hour',
    resolutionTime: '2 hours',
    channels: ['email', 'chat', 'phone', 'dedicated_support', 'help_center'],
  },
}
```

### Support Hours

Support availability.

**Support Hours:**
- Monday - Friday: 9 AM - 6 PM EST
- Saturday: 10 AM - 4 PM EST
- Sunday: Closed
- Holidays: Closed

**Emergency Support (Enterprise):**
- 24/7 availability
- Dedicated support team
- Direct phone line
- Guaranteed response time

---

## Common Issues and Solutions

### Authentication Issues

**Issue: Can't log in**

**Troubleshooting Steps:**
1. Verify email address is correct
2. Check for typos in password
3. Try password reset
4. Clear browser cache and cookies
5. Try different browser
6. Check if account is suspended

**Solution:**
```
1. Ask for email address
2. Verify account exists
3. Send password reset link
4. Confirm reset email received
5. Verify login works
6. If still failing, escalate to engineering
```

**Password Reset:**
- User clicks "Forgot Password"
- Enters email address
- Receives reset link (valid 24 hours)
- Creates new password
- Logs in with new password

**Account Suspended:**
- Check suspension reason
- Contact user about reason
- Provide resolution steps
- Unsuspend if appropriate
- Confirm access restored

### Gallery Issues

**Issue: Can't create gallery**

**Troubleshooting Steps:**
1. Check subscription tier
2. Verify gallery limit not reached
3. Check storage quota
4. Verify permissions
5. Try different browser
6. Check for error messages

**Solution:**
```
1. Ask for subscription tier
2. Check gallery count: SELECT COUNT(*) FROM galleries WHERE photographerId = ?
3. Check storage usage: SELECT SUM(size) FROM photos WHERE galleryId IN (...)
4. If limit reached, suggest upgrade
5. If error, check logs for details
6. If still failing, escalate to engineering
```

**Gallery Limit Reached:**
- Show current tier limits
- Suggest upgrade to higher tier
- Provide upgrade link
- Explain benefits of upgrade

**Storage Limit Reached:**
- Show current storage usage
- Suggest deleting old photos
- Suggest upgrading to higher tier
- Provide cleanup guide

**Issue: Gallery not visible to client**

**Troubleshooting Steps:**
1. Verify client was invited
2. Check invitation status
3. Verify gallery is shared
4. Check access permissions
5. Verify client email is correct
6. Check for typos in invitation

**Solution:**
```
1. Ask for client email
2. Check invitations: SELECT * FROM invitations WHERE email = ? AND galleryId = ?
3. Verify invitation status (pending/accepted)
4. If pending, resend invitation
5. If accepted, verify gallery settings
6. If still not visible, escalate to engineering
```

### Photo Upload Issues

**Issue: Can't upload photos**

**Troubleshooting Steps:**
1. Check file format (JPG, PNG, WebP, MP4)
2. Check file size (max 50 MB)
3. Check storage quota
4. Check upload limit (100 per day)
5. Try different browser
6. Check internet connection

**Solution:**
```
1. Ask for file format and size
2. Verify format is supported
3. If too large, suggest compression
4. Check storage quota
5. Check daily upload count
6. If limit reached, suggest waiting until next day
7. If still failing, escalate to engineering
```

**Supported Formats:**
- Images: JPG, PNG, WebP, GIF
- Videos: MP4, MOV, WebM
- Max size: 50 MB per file
- Max uploads: 100 per day

**File Compression:**
- Recommend online tools (TinyPNG, Compressor.io)
- Suggest reducing dimensions
- Suggest reducing quality
- Provide compression guide

### Client Access Issues

**Issue: Client can't view gallery**

**Troubleshooting Steps:**
1. Verify client was invited
2. Check invitation status
3. Verify gallery is shared
4. Check password protection
5. Verify client email
6. Check browser compatibility

**Solution:**
```
1. Ask for client email
2. Check invitations: SELECT * FROM invitations WHERE email = ?
3. Verify invitation status
4. If pending, resend invitation
5. If password protected, verify password
6. If still failing, escalate to engineering
```

**Password-Protected Gallery:**
- Verify password is correct
- Check for caps lock
- Verify password hasn't changed
- Provide password reset option

**Expired Invitation:**
- Check invitation expiration date
- If expired, send new invitation
- Verify new invitation received
- Confirm access works

### Payment Issues

**Issue: Payment failed**

**Troubleshooting Steps:**
1. Check card details
2. Verify card is not expired
3. Check available funds
4. Verify billing address
5. Try different payment method
6. Contact card issuer

**Solution:**
```
1. Ask for error message
2. Check Stripe logs for error details
3. Provide specific error explanation
4. Suggest solutions based on error
5. If card issue, suggest contacting bank
6. If system issue, escalate to engineering
```

**Common Payment Errors:**
- Card declined: Contact card issuer
- Expired card: Update card details
- Insufficient funds: Add funds to account
- Invalid address: Verify billing address
- 3D Secure failed: Verify with bank

**Subscription Issues:**
- Verify subscription status
- Check renewal date
- Verify payment method
- Check billing history
- Provide invoice if requested

### Performance Issues

**Issue: Site is slow**

**Troubleshooting Steps:**
1. Check internet connection speed
2. Clear browser cache
3. Try different browser
4. Check for browser extensions
5. Check server status
6. Check for ongoing incidents

**Solution:**
```
1. Ask for specific slow areas
2. Check server metrics
3. Check database performance
4. Check CDN status
5. If user-side issue, provide optimization tips
6. If server-side issue, escalate to engineering
```

**Performance Optimization Tips:**
- Clear browser cache
- Disable browser extensions
- Use modern browser (Chrome, Firefox, Safari)
- Check internet connection speed
- Try wired connection instead of WiFi
- Close other applications

**Server Status:**
- Check status page: https://status.rawdrive.com
- Check for ongoing incidents
- Check maintenance windows
- Provide ETA if applicable

### Feature Requests

**Issue: Feature not available**

**Troubleshooting Steps:**
1. Verify feature is not available in tier
2. Check if feature is in beta
3. Check if feature is planned
4. Suggest workarounds
5. Offer upgrade option

**Solution:**
```
1. Ask for feature description
2. Check if feature is tier-specific
3. If tier-specific, suggest upgrade
4. If not available, check roadmap
5. If planned, provide ETA
6. If not planned, log as feature request
```

**Feature Availability by Tier:**
- Free: Basic features only
- Starter: Custom branding, downloads, face recognition
- Professional: Custom domain, print designer
- Business: API access, team collaboration
- Enterprise: White-label, custom integrations

**Feature Requests:**
- Log in support system
- Track in product roadmap
- Notify user when available
- Prioritize based on demand

---

## Troubleshooting Guides

### Gallery Not Showing Photos

**Symptoms:**
- Gallery created but no photos visible
- Photos uploaded but not appearing
- Gallery shows 0 photos

**Troubleshooting:**
```
1. Verify photos were uploaded
   SELECT COUNT(*) FROM photos WHERE galleryId = ?

2. Check photo status
   SELECT status FROM photos WHERE galleryId = ?

3. Verify photos are not archived
   SELECT * FROM photos WHERE galleryId = ? AND status != 'archived'

4. Check for processing delays
   - Photos may take 1-2 minutes to process
   - Check if status is 'processing'

5. Verify permissions
   - Check if user has access to gallery
   - Check if photos are visible to user

6. Clear cache
   - Clear browser cache
   - Refresh page
```

**Resolution:**
- If photos are processing, wait 1-2 minutes
- If photos are archived, unarchive them
- If permission issue, grant access
- If still failing, escalate to engineering

### Client Can't Download Photos

**Symptoms:**
- Download button not visible
- Download fails with error
- Download starts but doesn't complete

**Troubleshooting:**
```
1. Verify downloads are enabled
   SELECT allowDownload FROM galleries WHERE id = ?

2. Verify client has download permission
   SELECT accessLevel FROM invitations WHERE clientId = ? AND galleryId = ?

3. Check file size
   - Large files may take longer
   - Check browser download limits

4. Verify file exists
   SELECT * FROM photos WHERE id = ?

5. Check storage
   - Verify file is in S3
   - Verify CDN is working

6. Try different browser
   - Some browsers have download restrictions
```

**Resolution:**
- If downloads disabled, enable in gallery settings
- If permission issue, update invitation
- If file too large, suggest splitting download
- If browser issue, try different browser
- If still failing, escalate to engineering

### Subscription Not Activating

**Symptoms:**
- Paid tier features not available
- Subscription shows as pending
- Features still limited after payment

**Troubleshooting:**
```
1. Verify payment was successful
   SELECT * FROM subscriptions WHERE userId = ?

2. Check subscription status
   SELECT status FROM subscriptions WHERE userId = ?

3. Verify tier was updated
   SELECT subscriptionTier FROM users WHERE id = ?

4. Check for webhook delays
   - Stripe webhooks may take 1-2 minutes
   - Check webhook logs

5. Verify features are enabled
   - Check feature flags
   - Check tier configuration

6. Clear cache
   - Clear browser cache
   - Refresh page
```

**Resolution:**
- If payment pending, wait 1-2 minutes
- If payment failed, retry payment
- If webhook delayed, wait and refresh
- If features not enabled, manually enable
- If still failing, escalate to engineering

### Email Not Received

**Symptoms:**
- Verification email not received
- Password reset email not received
- Invitation email not received

**Troubleshooting:**
```
1. Check spam/junk folder
   - Emails may be filtered

2. Verify email address
   - Check for typos
   - Verify email is correct

3. Check email logs
   SELECT * FROM email_logs WHERE recipient = ?

4. Verify email was sent
   - Check if email was queued
   - Check if email was delivered

5. Check email provider
   - Gmail, Outlook, Yahoo may have delays
   - Check provider status

6. Resend email
   - Request new verification email
   - Request new password reset
```

**Resolution:**
- If in spam, add to contacts
- If typo, correct email address
- If not sent, resend email
- If delivery failed, check logs
- If provider issue, wait and retry
- If still failing, escalate to engineering

---

## Escalation Procedures

### When to Escalate

Escalate issues that cannot be resolved by support.

**Escalation Triggers:**
- Technical issue requiring code changes
- Database issue requiring admin access
- Security issue requiring investigation
- Data loss or corruption
- Payment processing issue
- Third-party service failure
- Issue unresolved after 2 attempts

### Escalation Process

Follow escalation process.

**Step 1: Document Issue**
```
- Gather all relevant information
- Reproduce issue if possible
- Collect error messages
- Collect logs
- Collect screenshots
```

**Step 2: Create Ticket**
```
- Create support ticket in system
- Assign to engineering team
- Set priority level
- Add all documentation
- Set SLA based on priority
```

**Step 3: Notify Customer**
```
- Inform customer of escalation
- Provide ticket number
- Set expectations for resolution time
- Provide workaround if available
- Offer alternative solutions
```

**Step 4: Follow Up**
```
- Check ticket status daily
- Update customer on progress
- Provide ETA for resolution
- Escalate further if needed
```

### Priority Levels

Assign priority based on impact.

**Priority Levels:**
```
Critical (P1):
- System down
- Data loss
- Security breach
- Multiple users affected
- SLA: 1 hour response, 4 hours resolution

High (P2):
- Major feature broken
- Performance degradation
- Payment processing issue
- SLA: 4 hours response, 24 hours resolution

Medium (P3):
- Minor feature broken
- Workaround available
- Single user affected
- SLA: 24 hours response, 3 days resolution

Low (P4):
- Cosmetic issue
- Feature request
- Documentation issue
- SLA: 48 hours response, 7 days resolution
```

---

## Knowledge Base

### Help Center Articles

Create help center articles for common issues.

**Article Categories:**
- Getting Started
- Account Management
- Gallery Management
- Photo Management
- Client Management
- Billing & Subscription
- Troubleshooting
- FAQ

**Article Template:**
```markdown
# [Article Title]

## Problem
[Describe the problem]

## Solution
[Step-by-step solution]

## Screenshots
[Include screenshots if helpful]

## Related Articles
[Link to related articles]

## Still Need Help?
[Contact support link]
```

### Video Tutorials

Create video tutorials for common tasks.

**Video Topics:**
- How to sign up
- How to create a gallery
- How to upload photos
- How to invite clients
- How to design an album
- How to manage subscription
- How to use AI features
- How to troubleshoot issues

### FAQ

Maintain FAQ for common questions.

**FAQ Categories:**
- Account & Billing
- Galleries & Photos
- Clients & Sharing
- Albums & Print
- AI Features
- Troubleshooting
- Pricing & Plans

---

## Customer Communication

### Email Templates

Use templates for consistent communication.

**Welcome Email:**
```
Subject: Welcome to RawDrive!

Hi [Name],

Welcome to RawDrive! We're excited to have you on board.

Here's what you can do:
✓ Upload and organize photos
✓ Share galleries with clients
✓ Design print albums
✓ Use AI-powered features

Get started: [Dashboard Link]

Questions? Check our help center: [Help Center Link]

Welcome aboard!
RawDrive Team
```

**Support Response Email:**
```
Subject: Re: [Issue Title]

Hi [Name],

Thank you for contacting RawDrive support.

[Provide solution or next steps]

If you have any questions, please reply to this email.

Best regards,
RawDrive Support Team
```

**Issue Resolution Email:**
```
Subject: [Issue] - Resolved

Hi [Name],

Great news! We've resolved your issue.

[Explain what was done]

Please verify that everything is working correctly.

If you have any questions, please let us know.

Best regards,
RawDrive Support Team
```

### Tone and Style

Maintain professional and friendly tone.

**Communication Guidelines:**
- Be empathetic and understanding
- Use clear and simple language
- Avoid technical jargon
- Be concise and direct
- Provide specific solutions
- Follow up on issues
- Thank customers for patience

---

## Support Metrics

### Key Metrics

Track support performance.

**Metrics to Track:**
- Response time (target: < SLA)
- Resolution time (target: < SLA)
- First contact resolution rate (target: > 80%)
- Customer satisfaction (target: > 4.5/5)
- Ticket volume (track trends)
- Escalation rate (target: < 10%)
- Repeat issues (track and fix)

### Reporting

Generate support reports.

**Weekly Report:**
- Total tickets: [Number]
- Average response time: [Time]
- Average resolution time: [Time]
- First contact resolution: [%]
- Customer satisfaction: [Score]
- Top issues: [List]
- Escalations: [Number]

**Monthly Report:**
- Total tickets: [Number]
- Trends: [Analysis]
- Top issues: [List]
- Customer satisfaction: [Score]
- Team performance: [Analysis]
- Recommendations: [List]

---

## Best Practices

### Do's
- ✅ Respond quickly to all tickets
- ✅ Provide clear and specific solutions
- ✅ Follow up on unresolved issues
- ✅ Document all interactions
- ✅ Escalate when appropriate
- ✅ Maintain professional tone
- ✅ Empathize with customers
- ✅ Provide workarounds when possible
- ✅ Track and fix recurring issues
- ✅ Continuously improve processes

### Don'ts
- ❌ Don't ignore tickets
- ❌ Don't provide vague solutions
- ❌ Don't make promises you can't keep
- ❌ Don't be dismissive of issues
- ❌ Don't escalate unnecessarily
- ❌ Don't use technical jargon
- ❌ Don't blame customers
- ❌ Don't share sensitive information
- ❌ Don't forget to follow up
- ❌ Don't ignore feedback

---

## Related Files

- `docs/CUSTOMER_AUTOMATED_ONBOARDING.md` - Onboarding process
- `docs/RBAC_AND_USER_MANAGEMENT.md` - User management
- `docs/API_AND_INTEGRATIONS.md` - API documentation
- `docs/TROUBLESHOOTING.md` - Detailed troubleshooting

## Last Updated

2025-12-17
