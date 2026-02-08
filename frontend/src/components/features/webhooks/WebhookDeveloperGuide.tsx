/**
 * WebhookDeveloperGuide Component
 *
 * Comprehensive developer documentation for webhook integration including:
 * - Signature verification examples (Node.js, Python, Ruby, Go, PHP)
 * - Payload structure documentation
 * - Best practices for webhook handling
 * - Retry logic and error handling guidelines
 *
 * Feature: Webhooks Integration
 * Target: Third-party developers building integrations
 */

import React, { useState } from 'react';
import {
  Code2,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Shield,
  Zap,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  FileJson,
  Key,
  Clock,
} from 'lucide-react';
import { AppButton } from '../../ui/AppButton';
import { Card } from '../../ui/AppCard';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Language = 'nodejs' | 'python' | 'ruby' | 'go' | 'php';

interface CodeExample {
  language: Language;
  label: string;
  code: string;
}

// ---------------------------------------------------------------------------
// Code Examples Data
// ---------------------------------------------------------------------------

const SIGNATURE_VERIFICATION_EXAMPLES: CodeExample[] = [
  {
    language: 'nodejs',
    label: 'Node.js',
    code: `const crypto = require('crypto');

/**
 * Verify RawDrive webhook signature
 * @param {Buffer} payload - Raw request body
 * @param {string} signature - X-RawDrive-Signature header
 * @param {string} timestamp - X-RawDrive-Timestamp header
 * @param {string} secret - Your webhook secret
 * @returns {boolean} - Whether signature is valid
 */
function verifyWebhookSignature(payload, signature, timestamp, secret) {
  // Check timestamp freshness (5 minute tolerance)
  const now = Math.floor(Date.now() / 1000);
  const webhookTimestamp = parseInt(timestamp, 10);
  if (Math.abs(now - webhookTimestamp) > 300) {
    console.error('Webhook timestamp too old');
    return false;
  }

  // Construct signed payload
  const signedPayload = \`\${timestamp}.\${payload.toString()}\`;

  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  // Compare signatures (timing-safe)
  const signatureBuffer = Buffer.from(signature.replace('sha256=', ''), 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

// Express.js middleware example
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-rawdrive-signature'];
  const timestamp = req.headers['x-rawdrive-timestamp'];

  if (!verifyWebhookSignature(req.body, signature, timestamp, process.env.WEBHOOK_SECRET)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(req.body);
  console.log('Received event:', event.type);

  // Process webhook...
  res.status(200).json({ received: true });
});`,
  },
  {
    language: 'python',
    label: 'Python',
    code: `import hmac
import hashlib
import time
from flask import Flask, request, jsonify

app = Flask(__name__)

def verify_webhook_signature(payload: bytes, signature: str, timestamp: str, secret: str) -> bool:
    """
    Verify RawDrive webhook signature.

    Args:
        payload: Raw request body
        signature: X-RawDrive-Signature header
        timestamp: X-RawDrive-Timestamp header
        secret: Your webhook secret

    Returns:
        bool: Whether signature is valid
    """
    # Check timestamp freshness (5 minute tolerance)
    current_time = int(time.time())
    webhook_time = int(timestamp)
    if abs(current_time - webhook_time) > 300:
        print("Webhook timestamp too old")
        return False

    # Construct signed payload
    signed_payload = f"{timestamp}.{payload.decode('utf-8')}"

    # Calculate expected signature
    expected_signature = hmac.new(
        secret.encode('utf-8'),
        signed_payload.encode('utf-8'),
        hashlib.sha256
    ).hexdigest()

    # Compare signatures (timing-safe)
    actual_sig = signature.replace('sha256=', '')
    return hmac.compare_digest(actual_sig, expected_signature)


@app.route('/webhook', methods=['POST'])
def handle_webhook():
    signature = request.headers.get('X-RawDrive-Signature', '')
    timestamp = request.headers.get('X-RawDrive-Timestamp', '')

    if not verify_webhook_signature(
        request.get_data(),
        signature,
        timestamp,
        os.environ.get('WEBHOOK_SECRET')
    ):
        return jsonify({'error': 'Invalid signature'}), 401

    event = request.get_json()
    print(f"Received event: {event['type']}")

    # Process webhook...
    return jsonify({'received': True}), 200`,
  },
  {
    language: 'ruby',
    label: 'Ruby',
    code: `require 'openssl'
require 'json'

class WebhookController < ApplicationController
  skip_before_action :verify_authenticity_token

  TOLERANCE_SECONDS = 300

  def handle_webhook
    payload = request.body.read
    signature = request.headers['X-RawDrive-Signature']
    timestamp = request.headers['X-RawDrive-Timestamp']

    unless verify_signature(payload, signature, timestamp, ENV['WEBHOOK_SECRET'])
      render json: { error: 'Invalid signature' }, status: :unauthorized
      return
    end

    event = JSON.parse(payload)
    Rails.logger.info "Received event: #{event['type']}"

    # Process webhook...
    render json: { received: true }, status: :ok
  end

  private

  def verify_signature(payload, signature, timestamp, secret)
    # Check timestamp freshness
    current_time = Time.now.to_i
    webhook_time = timestamp.to_i
    return false if (current_time - webhook_time).abs > TOLERANCE_SECONDS

    # Construct signed payload
    signed_payload = "#{timestamp}.#{payload}"

    # Calculate expected signature
    expected_signature = OpenSSL::HMAC.hexdigest(
      'sha256',
      secret,
      signed_payload
    )

    # Timing-safe comparison
    actual_sig = signature.gsub('sha256=', '')
    ActiveSupport::SecurityUtils.secure_compare(actual_sig, expected_signature)
  end
end`,
  },
  {
    language: 'go',
    label: 'Go',
    code: `package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "encoding/hex"
    "encoding/json"
    "fmt"
    "io"
    "math"
    "net/http"
    "os"
    "strconv"
    "strings"
    "time"
)

const toleranceSeconds = 300

// VerifyWebhookSignature verifies RawDrive webhook signature
func VerifyWebhookSignature(payload []byte, signature, timestamp, secret string) bool {
    // Check timestamp freshness
    webhookTime, err := strconv.ParseInt(timestamp, 10, 64)
    if err != nil {
        return false
    }

    currentTime := time.Now().Unix()
    if math.Abs(float64(currentTime-webhookTime)) > toleranceSeconds {
        fmt.Println("Webhook timestamp too old")
        return false
    }

    // Construct signed payload
    signedPayload := fmt.Sprintf("%s.%s", timestamp, string(payload))

    // Calculate expected signature
    mac := hmac.New(sha256.New, []byte(secret))
    mac.Write([]byte(signedPayload))
    expectedSignature := hex.EncodeToString(mac.Sum(nil))

    // Timing-safe comparison
    actualSig := strings.TrimPrefix(signature, "sha256=")
    return hmac.Equal([]byte(actualSig), []byte(expectedSignature))
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
    payload, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "Failed to read body", http.StatusBadRequest)
        return
    }

    signature := r.Header.Get("X-RawDrive-Signature")
    timestamp := r.Header.Get("X-RawDrive-Timestamp")
    secret := os.Getenv("WEBHOOK_SECRET")

    if !VerifyWebhookSignature(payload, signature, timestamp, secret) {
        http.Error(w, "Invalid signature", http.StatusUnauthorized)
        return
    }

    var event map[string]interface{}
    json.Unmarshal(payload, &event)
    fmt.Printf("Received event: %s\\n", event["type"])

    // Process webhook...
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(map[string]bool{"received": true})
}`,
  },
  {
    language: 'php',
    label: 'PHP',
    code: `<?php

const TOLERANCE_SECONDS = 300;

/**
 * Verify RawDrive webhook signature
 *
 * @param string $payload Raw request body
 * @param string $signature X-RawDrive-Signature header
 * @param string $timestamp X-RawDrive-Timestamp header
 * @param string $secret Your webhook secret
 * @return bool Whether signature is valid
 */
function verifyWebhookSignature(
    string $payload,
    string $signature,
    string $timestamp,
    string $secret
): bool {
    // Check timestamp freshness
    $currentTime = time();
    $webhookTime = (int) $timestamp;

    if (abs($currentTime - $webhookTime) > TOLERANCE_SECONDS) {
        error_log("Webhook timestamp too old");
        return false;
    }

    // Construct signed payload
    $signedPayload = "{$timestamp}.{$payload}";

    // Calculate expected signature
    $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);

    // Timing-safe comparison
    $actualSig = str_replace('sha256=', '', $signature);
    return hash_equals($actualSig, $expectedSignature);
}

// Laravel/Lumen example
Route::post('/webhook', function (Request $request) {
    $payload = $request->getContent();
    $signature = $request->header('X-RawDrive-Signature');
    $timestamp = $request->header('X-RawDrive-Timestamp');

    if (!verifyWebhookSignature(
        $payload,
        $signature,
        $timestamp,
        env('WEBHOOK_SECRET')
    )) {
        return response()->json(['error' => 'Invalid signature'], 401);
    }

    $event = json_decode($payload, true);
    Log::info("Received event: " . $event['type']);

    // Process webhook...
    return response()->json(['received' => true]);
});`,
  },
];

const PAYLOAD_STRUCTURE = `{
  "id": "evt_abc123def456",
  "type": "asset.uploaded",
  "api_version": "v1",
  "created": "2026-01-25T10:30:00Z",
  "data": {
    "object": {
      "id": "asset_xyz789",
      "workspace_id": "ws_123",
      "gallery_id": "gal_456",
      "filename": "photo.jpg",
      "file_size": 2048576,
      "content_type": "image/jpeg",
      "status": "ready",
      "created_at": "2026-01-25T10:29:55Z"
    },
    "previous_attributes": null
  },
  "workspace_id": "ws_123",
  "livemode": true
}`;

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  code: string;
  language?: string;
}

function CodeBlock({ code, language }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-zinc-900 rounded-lg p-4 overflow-x-auto text-sm font-mono text-zinc-300">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-3 right-3 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100"
        title="Copy code"
      >
        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}

interface AccordionItemProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function AccordionItem({ title, icon, children, defaultOpen = false }: AccordionItemProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
      >
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-text-secondary" />
        ) : (
          <ChevronRight className="w-5 h-5 text-text-secondary" />
        )}
        <span className="text-text-secondary">{icon}</span>
        <span className="text-text-primary font-medium">{title}</span>
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export interface WebhookDeveloperGuideProps {
  className?: string;
}

export function WebhookDeveloperGuide({ className }: WebhookDeveloperGuideProps) {
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('nodejs');

  const selectedExample = SIGNATURE_VERIFICATION_EXAMPLES.find(
    (e) => e.language === selectedLanguage
  );

  return (
    <div className={cn('space-y-8', className)}>
      {/* Header */}
      <div>
        <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-3">
          <Code2 className="w-7 h-7 text-accent" />
          Developer Integration Guide
        </h2>
        <p className="text-text-secondary mt-2">
          Build powerful integrations with RawDrive webhooks. Receive real-time notifications
          for platform events and automate your workflows.
        </p>
      </div>

      {/* Quick Start */}
      <Card variant="elevated" className="p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-accent" />
          Quick Start
        </h3>
        <ol className="space-y-3 text-text-secondary">
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
              1
            </span>
            <span>
              Create a webhook subscription in your{' '}
              <a href="/workspace/settings/integrations" className="text-primary hover:underline">
                Workspace Settings
              </a>{' '}
              and copy your secret key.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
              2
            </span>
            <span>
              Set up an HTTPS endpoint on your server to receive webhook events.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
              3
            </span>
            <span>
              Implement signature verification using the examples below to ensure request
              authenticity.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center">
              4
            </span>
            <span>
              Return a 2xx response within 30 seconds to acknowledge receipt.
            </span>
          </li>
        </ol>
      </Card>

      {/* Signature Verification */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-500" />
            Signature Verification
          </h3>
          <div className="flex gap-1 bg-surface-hover rounded-lg p-1">
            {SIGNATURE_VERIFICATION_EXAMPLES.map((example) => (
              <button
                key={example.language}
                onClick={() => setSelectedLanguage(example.language)}
                className={cn(
                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',
                  selectedLanguage === example.language
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {example.label}
              </button>
            ))}
          </div>
        </div>

        <p className="text-text-secondary text-sm">
          Always verify webhook signatures to ensure requests are authentic and haven't been
          tampered with. RawDrive signs all webhook payloads with HMAC-SHA256.
        </p>

        {selectedExample && <CodeBlock code={selectedExample.code} />}
      </div>

      {/* Webhook Headers */}
      <Card variant="elevated" className="p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Key className="w-5 h-5 text-purple-500" />
          Webhook Headers
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-2 px-3 text-text-secondary font-medium">Header</th>
                <th className="text-left py-2 px-3 text-text-secondary font-medium">Description</th>
              </tr>
            </thead>
            <tbody className="text-text-primary">
              <tr className="border-b border-border/30">
                <td className="py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded">
                  X-RawDrive-Signature
                </td>
                <td className="py-2 px-3">
                  HMAC-SHA256 signature of the payload, prefixed with "sha256="
                </td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded">
                  X-RawDrive-Timestamp
                </td>
                <td className="py-2 px-3">Unix timestamp (seconds) when the webhook was sent</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded">
                  X-RawDrive-Event-Type
                </td>
                <td className="py-2 px-3">The type of event (e.g., "asset.uploaded")</td>
              </tr>
              <tr className="border-b border-border/30">
                <td className="py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded">
                  X-RawDrive-Delivery-Id
                </td>
                <td className="py-2 px-3">Unique ID for this delivery attempt (for idempotency)</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded">
                  Content-Type
                </td>
                <td className="py-2 px-3">Always "application/json"</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* Payload Structure */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <FileJson className="w-5 h-5 text-blue-500" />
          Payload Structure
        </h3>
        <p className="text-text-secondary text-sm">
          All webhook payloads follow a consistent structure. The <code>data.object</code>{' '}
          field contains the resource that triggered the event.
        </p>
        <CodeBlock code={PAYLOAD_STRUCTURE} />
      </div>

      {/* Best Practices */}
      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Best Practices
        </h3>

        <AccordionItem
          title="Respond Quickly"
          icon={<Clock className="w-5 h-5" />}
          defaultOpen
        >
          <p className="text-text-secondary text-sm mb-3">
            Return a 2xx response within <strong>30 seconds</strong> to acknowledge receipt.
            Process webhook data asynchronously if your handler takes longer.
          </p>
          <CodeBlock
            code={`// Good: Acknowledge immediately, process async
app.post('/webhook', async (req, res) => {
  // Queue for background processing
  await queue.add('processWebhook', req.body);

  // Return immediately
  res.status(200).json({ received: true });
});`}
          />
        </AccordionItem>

        <AccordionItem title="Handle Retries" icon={<RefreshCw className="w-5 h-5" />}>
          <p className="text-text-secondary text-sm mb-3">
            RawDrive retries failed deliveries with exponential backoff (1min, 5min, 30min, 2hr,
            24hr). Use the <code>X-RawDrive-Delivery-Id</code> header to implement idempotency.
          </p>
          <CodeBlock
            code={`// Idempotency example
const processedDeliveries = new Set();

app.post('/webhook', (req, res) => {
  const deliveryId = req.headers['x-rawdrive-delivery-id'];

  if (processedDeliveries.has(deliveryId)) {
    // Already processed, skip
    return res.status(200).json({ received: true });
  }

  // Process webhook...
  processedDeliveries.add(deliveryId);
  res.status(200).json({ received: true });
});`}
          />
        </AccordionItem>

        <AccordionItem
          title="Verify Timestamp Freshness"
          icon={<Clock className="w-5 h-5" />}
        >
          <p className="text-text-secondary text-sm">
            Reject webhooks with timestamps older than 5 minutes to prevent replay attacks.
            The timestamp is already checked in the verification examples above.
          </p>
        </AccordionItem>

        <AccordionItem title="Use HTTPS" icon={<Shield className="w-5 h-5" />}>
          <p className="text-text-secondary text-sm">
            Always use HTTPS endpoints. RawDrive only sends webhooks to secure URLs. This
            ensures payload encryption in transit and prevents man-in-the-middle attacks.
          </p>
        </AccordionItem>
      </div>

      {/* External Resources */}
      <Card variant="elevated" className="p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Resources</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <a
            href="https://docs.rawdrive.io/webhooks"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-lg bg-surface-hover hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-5 h-5 text-accent" />
            <div>
              <p className="text-text-primary font-medium">Full Documentation</p>
              <p className="text-sm text-text-secondary">Complete webhook API reference</p>
            </div>
          </a>
          <a
            href="https://github.com/rawdrive/webhook-examples"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-4 rounded-lg bg-surface-hover hover:bg-white/10 transition-colors"
          >
            <ExternalLink className="w-5 h-5 text-accent" />
            <div>
              <p className="text-text-primary font-medium">Example Projects</p>
              <p className="text-sm text-text-secondary">Sample implementations on GitHub</p>
            </div>
          </a>
        </div>
      </Card>
    </div>
  );
}

export default WebhookDeveloperGuide;
