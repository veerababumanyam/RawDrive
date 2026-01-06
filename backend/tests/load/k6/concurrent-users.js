/**
 * RawDrive Load Test: 5000 Concurrent Users
 *
 * Tests the system's ability to handle 5000 concurrent users with:
 * - Gallery view operations (p95 < 3s)
 * - Upload initiations (start < 2s)
 * - Public gallery access (p95 < 3s)
 *
 * Usage:
 *   k6 run concurrent-users.js
 *   k6 run concurrent-users.js --env BASE_URL=https://api.rawdrive.ai
 *   k6 run concurrent-users.js --out influxdb=http://localhost:8086/k6
 *
 * Environment variables:
 *   BASE_URL: API base URL (default: http://localhost:8000)
 *   AUTH_TOKEN: Bearer token for authenticated requests
 *   WORKSPACE_ID: Test workspace ID
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { randomIntBetween, randomItem } from 'https://jslib.k6.io/k6-utils/1.2.0/index.js';

// =============================================================================
// Configuration
// =============================================================================

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || '';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '00000000-0000-0000-0000-000000000001';

// Test thresholds (SLO requirements)
export const options = {
  // Ramping stages: 0 → 1000 → 3000 → 5000 → 0
  stages: [
    { duration: '2m', target: 1000 },   // Warm-up to 1000 users
    { duration: '5m', target: 1000 },   // Hold at 1000
    { duration: '3m', target: 3000 },   // Ramp to 3000
    { duration: '5m', target: 3000 },   // Hold at 3000
    { duration: '3m', target: 5000 },   // Ramp to 5000
    { duration: '10m', target: 5000 },  // Hold at 5000 (main test)
    { duration: '3m', target: 0 },      // Cool down
  ],

  // Performance thresholds
  thresholds: {
    // Overall HTTP metrics
    'http_req_duration': ['p(95)<3000'],     // p95 < 3s
    'http_req_failed': ['rate<0.01'],         // Error rate < 1%

    // Gallery view specific
    'gallery_view_duration': ['p(95)<3000'],  // p95 < 3s
    'gallery_view_failed': ['rate<0.01'],

    // Upload initiation specific
    'upload_init_duration': ['p(95)<2000'],   // p95 < 2s
    'upload_init_failed': ['rate<0.01'],

    // Public gallery specific
    'public_gallery_duration': ['p(95)<3000'], // p95 < 3s
    'public_gallery_failed': ['rate<0.01'],

    // Health check specific (T049 - Redis pool monitoring)
    'health_check_duration': ['p(95)<1000'],   // p95 < 1s
    'health_check_failed': ['rate<0.01'],
    'redis_pool_utilization': ['avg<80'],      // Avg utilization < 80%

    // Media load specific (T054, T055 - CDN verification)
    'media_load_duration': ['p(95)<1000'],     // p95 < 1s for thumbnails
    'media_load_failed': ['rate<0.05'],        // < 5% failure rate
  },

  // Additional options
  noConnectionReuse: false,
  userAgent: 'k6-load-test/1.0',
};

// =============================================================================
// Custom Metrics
// =============================================================================

// Gallery view metrics
const galleryViewDuration = new Trend('gallery_view_duration');
const galleryViewFailed = new Rate('gallery_view_failed');

// Upload initiation metrics
const uploadInitDuration = new Trend('upload_init_duration');
const uploadInitFailed = new Rate('upload_init_failed');

// Public gallery metrics
const publicGalleryDuration = new Trend('public_gallery_duration');
const publicGalleryFailed = new Rate('public_gallery_failed');

// Error counters
const errorCounter = new Counter('errors_total');

// Health check metrics (T049 - Redis connection testing)
const healthCheckDuration = new Trend('health_check_duration');
const healthCheckFailed = new Rate('health_check_failed');
const redisPoolUtilization = new Trend('redis_pool_utilization');

// Media load metrics (T054, T055 - Static asset delivery)
const mediaLoadDuration = new Trend('media_load_duration');
const mediaLoadFailed = new Rate('media_load_failed');
const cdnResponseRate = new Rate('cdn_response_rate');
const cpuUtilization = new Trend('cpu_utilization');

// =============================================================================
// Helper Functions
// =============================================================================

function getAuthHeaders() {
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  }

  return headers;
}

function handleResponse(res, metricDuration, metricFailed, checkName) {
  const success = res.status >= 200 && res.status < 300;

  metricDuration.add(res.timings.duration);
  metricFailed.add(!success);

  if (!success) {
    errorCounter.add(1, { status: res.status, check: checkName });
    console.log(`[ERROR] ${checkName}: status=${res.status}, body=${res.body.substring(0, 200)}`);
  }

  return success;
}

// =============================================================================
// Test Scenarios
// =============================================================================

/**
 * Scenario 1: Gallery View
 * Simulates a user browsing their gallery list and viewing gallery details
 */
function galleryViewScenario() {
  group('Gallery View', function() {
    // List galleries
    const listRes = http.get(
      `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/galleries?limit=20`,
      { headers: getAuthHeaders(), tags: { name: 'list_galleries' } }
    );

    const listSuccess = handleResponse(
      listRes,
      galleryViewDuration,
      galleryViewFailed,
      'list_galleries'
    );

    check(listRes, {
      'galleries list status is 200': (r) => r.status === 200,
      'galleries list has data': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.galleries && Array.isArray(body.galleries);
        } catch {
          return false;
        }
      },
    });

    // If we got galleries, view a random one
    if (listSuccess && listRes.status === 200) {
      try {
        const galleries = JSON.parse(listRes.body).galleries;
        if (galleries && galleries.length > 0) {
          const gallery = randomItem(galleries);

          sleep(randomIntBetween(1, 3)); // User think time

          // Get gallery details
          const detailRes = http.get(
            `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/galleries/${gallery.gallery_id}`,
            { headers: getAuthHeaders(), tags: { name: 'get_gallery' } }
          );

          handleResponse(detailRes, galleryViewDuration, galleryViewFailed, 'get_gallery');

          check(detailRes, {
            'gallery detail status is 200': (r) => r.status === 200,
          });

          sleep(randomIntBetween(1, 3)); // User think time

          // Get gallery assets
          const assetsRes = http.get(
            `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/galleries/${gallery.gallery_id}/assets?limit=50`,
            { headers: getAuthHeaders(), tags: { name: 'get_gallery_assets' } }
          );

          handleResponse(assetsRes, galleryViewDuration, galleryViewFailed, 'get_gallery_assets');

          check(assetsRes, {
            'gallery assets status is 200': (r) => r.status === 200,
          });
        }
      } catch (e) {
        console.log(`[ERROR] Gallery view scenario error: ${e}`);
      }
    }
  });
}

/**
 * Scenario 2: Upload Initiation
 * Simulates a user starting an upload session
 */
function uploadInitiationScenario() {
  group('Upload Initiation', function() {
    // Create upload session
    const sessionRes = http.post(
      `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/uploads/sessions`,
      JSON.stringify({
        file_count: randomIntBetween(1, 10),
        total_size: randomIntBetween(1000000, 50000000), // 1MB - 50MB
      }),
      { headers: getAuthHeaders(), tags: { name: 'create_upload_session' } }
    );

    handleResponse(sessionRes, uploadInitDuration, uploadInitFailed, 'create_upload_session');

    check(sessionRes, {
      'upload session status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'upload session has session_id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.session_id || body.upload_session_id;
        } catch {
          return false;
        }
      },
    });

    // If session created, get presigned URL
    if (sessionRes.status === 200 || sessionRes.status === 201) {
      try {
        const sessionId = JSON.parse(sessionRes.body).session_id ||
                         JSON.parse(sessionRes.body).upload_session_id;

        if (sessionId) {
          sleep(0.5); // Brief pause

          // Get presigned upload URL
          const presignRes = http.post(
            `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/uploads/presign`,
            JSON.stringify({
              session_id: sessionId,
              filename: `test-image-${Date.now()}.jpg`,
              content_type: 'image/jpeg',
              size: randomIntBetween(500000, 5000000),
            }),
            { headers: getAuthHeaders(), tags: { name: 'get_presigned_url' } }
          );

          handleResponse(presignRes, uploadInitDuration, uploadInitFailed, 'get_presigned_url');

          check(presignRes, {
            'presigned URL status is 200': (r) => r.status === 200,
            'presigned URL has url': (r) => {
              try {
                const body = JSON.parse(r.body);
                return body.url || body.presigned_url;
              } catch {
                return false;
              }
            },
          });
        }
      } catch (e) {
        console.log(`[ERROR] Upload initiation error: ${e}`);
      }
    }
  });
}

/**
 * Scenario 3: Health Check with Redis Pool Monitoring (T049)
 * Monitors Redis connection pool utilization under load
 */
function healthCheckScenario() {
  group('Health Check', function() {
    // Check readiness endpoint (includes Redis pool status)
    const readyRes = http.get(
      `${BASE_URL}/ready`,
      { tags: { name: 'readiness_check' } }
    );

    handleResponse(readyRes, healthCheckDuration, healthCheckFailed, 'readiness_check');

    check(readyRes, {
      'readiness status is 200': (r) => r.status === 200,
      'redis is healthy': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.checks && body.checks.redis === true;
        } catch {
          return false;
        }
      },
      'redis pool available': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.checks && body.checks.redis_pool_available === true;
        } catch {
          return false;
        }
      },
    });

    // Record Redis pool utilization for trend analysis
    if (readyRes.status === 200) {
      try {
        const body = JSON.parse(readyRes.body);
        if (body.pools && body.pools.redis) {
          const redis = body.pools.redis;
          const maxConns = redis.max_connections || 50;
          const activeConns = redis.active_connections || 0;
          const utilization = (activeConns / maxConns) * 100;
          redisPoolUtilization.add(utilization);
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }
  });
}

/**
 * Scenario 4: Media Load with CDN Verification (T054, T055)
 * Simulates media requests and verifies CDN serving
 */
function mediaLoadScenario() {
  group('Media Load', function() {
    // Get a gallery with assets to test media loading
    const listRes = http.get(
      `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/galleries?limit=5`,
      { headers: getAuthHeaders(), tags: { name: 'list_galleries_media' } }
    );

    if (listRes.status === 200) {
      try {
        const galleries = JSON.parse(listRes.body).galleries;
        if (galleries && galleries.length > 0) {
          const gallery = randomItem(galleries);

          // Get assets with thumbnail URLs
          const assetsRes = http.get(
            `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/galleries/${gallery.gallery_id}/assets?limit=10`,
            { headers: getAuthHeaders(), tags: { name: 'get_assets_media' } }
          );

          if (assetsRes.status === 200) {
            const assets = JSON.parse(assetsRes.body).assets || [];

            // Load thumbnails (simulate gallery view)
            for (const asset of assets.slice(0, 3)) {
              if (asset.thumbnail_url) {
                const thumbnailUrl = asset.thumbnail_url.startsWith('http')
                  ? asset.thumbnail_url
                  : `${BASE_URL}${asset.thumbnail_url}`;

                const mediaRes = http.get(thumbnailUrl, {
                  tags: { name: 'load_thumbnail' },
                });

                mediaLoadDuration.add(mediaRes.timings.duration);
                mediaLoadFailed.add(mediaRes.status >= 400);

                // Check if response came from CDN (via headers)
                const isCdnResponse = (
                  mediaRes.headers['x-cache'] ||
                  mediaRes.headers['cf-cache-status'] ||
                  mediaRes.headers['x-cdn-cache'] ||
                  false
                );
                cdnResponseRate.add(isCdnResponse ? 1 : 0);

                check(mediaRes, {
                  'media loads successfully': (r) => r.status === 200 || r.status === 302,
                  'media response time < 1s': (r) => r.timings.duration < 1000,
                });
              }
            }
          }
        }
      } catch (e) {
        console.log(`[ERROR] Media load scenario error: ${e}`);
      }
    }

    // Check CPU utilization via metrics endpoint (T055)
    const metricsRes = http.get(`${BASE_URL}/metrics`, {
      tags: { name: 'get_metrics' },
    });

    if (metricsRes.status === 200) {
      // Parse Prometheus metrics for CPU utilization
      const cpuMatch = metricsRes.body.match(/process_cpu_seconds_total\s+(\d+\.?\d*)/);
      if (cpuMatch) {
        // This is cumulative, so we track the value for trend analysis
        cpuUtilization.add(parseFloat(cpuMatch[1]));
      }
    }
  });
}

/**
 * Scenario 5: Public Gallery Access
 * Simulates a client accessing a shared gallery via magic link
 */
function publicGalleryScenario() {
  group('Public Gallery', function() {
    // Simulate accessing a public gallery with magic link token
    // In real tests, you would use actual magic link tokens
    const magicLinkToken = __ENV.MAGIC_LINK_TOKEN || 'test-magic-link-token';

    // Validate magic link
    const validateRes = http.post(
      `${BASE_URL}/api/v1/galleries/validate-magic-link`,
      JSON.stringify({ token: magicLinkToken }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'validate_magic_link' }
      }
    );

    handleResponse(validateRes, publicGalleryDuration, publicGalleryFailed, 'validate_magic_link');

    // Get public gallery (even if validation fails, test the endpoint)
    const publicGalleryId = __ENV.PUBLIC_GALLERY_ID || '00000000-0000-0000-0000-000000000001';

    sleep(randomIntBetween(1, 2));

    // Get public gallery assets
    const assetsRes = http.get(
      `${BASE_URL}/api/v1/public/galleries/${publicGalleryId}/assets?limit=50`,
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { name: 'get_public_gallery_assets' }
      }
    );

    handleResponse(assetsRes, publicGalleryDuration, publicGalleryFailed, 'get_public_gallery_assets');

    check(assetsRes, {
      'public gallery assets status is 200 or 401': (r) => r.status === 200 || r.status === 401,
    });
  });
}

// =============================================================================
// Main Test Function
// =============================================================================

export default function() {
  // Distribute traffic across scenarios based on realistic usage patterns
  const scenario = Math.random();

  if (scenario < 0.45) {
    // 45% of traffic: Gallery browsing (most common action)
    galleryViewScenario();
  } else if (scenario < 0.60) {
    // 15% of traffic: Public gallery access
    publicGalleryScenario();
  } else if (scenario < 0.75) {
    // 15% of traffic: Upload initiation
    uploadInitiationScenario();
  } else if (scenario < 0.90) {
    // 15% of traffic: Media loading (CDN verification)
    mediaLoadScenario();
  } else {
    // 10% of traffic: Health checks with pool monitoring
    healthCheckScenario();
  }

  // Random think time between scenarios
  sleep(randomIntBetween(2, 5));
}

// =============================================================================
// Setup and Teardown
// =============================================================================

export function setup() {
  console.log('Starting load test...');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workspace ID: ${WORKSPACE_ID}`);
  console.log(`Auth Token: ${AUTH_TOKEN ? 'provided' : 'not provided'}`);

  // Verify API is accessible
  const healthRes = http.get(`${BASE_URL}/health`);
  if (healthRes.status !== 200) {
    throw new Error(`API health check failed: ${healthRes.status}`);
  }

  return {
    startTime: new Date().toISOString(),
  };
}

export function teardown(data) {
  console.log('Load test completed');
  console.log(`Started at: ${data.startTime}`);
  console.log(`Ended at: ${new Date().toISOString()}`);
}

// =============================================================================
// Stress Test Scenario (Alternative)
// =============================================================================

export const stressTest = {
  executor: 'ramping-arrival-rate',
  preAllocatedVUs: 100,
  maxVUs: 500,
  stages: [
    { duration: '1m', target: 100 },   // 100 req/s
    { duration: '2m', target: 500 },   // Ramp to 500 req/s
    { duration: '3m', target: 1000 },  // Ramp to 1000 req/s
    { duration: '5m', target: 1000 },  // Sustain 1000 req/s
    { duration: '2m', target: 0 },     // Cool down
  ],
};

// =============================================================================
// Soak Test Scenario (Alternative)
// =============================================================================

export const soakTest = {
  executor: 'constant-vus',
  vus: 500,
  duration: '2h',
};

// =============================================================================
// Graceful Degradation Test (T084 - FR-023)
// =============================================================================
// This scenario drives HPA to maxReplicas and verifies graceful degradation:
// - In-flight requests continue to succeed
// - Low-priority requests are rate-limited
// - ApproachingMaxReplicas and AtMaxReplicas alerts fire

export const gracefulDegradationOptions = {
  scenarios: {
    // High-priority traffic (gallery views, critical operations)
    high_priority: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 3000 },   // Ramp up high-priority traffic
        { duration: '15m', target: 3000 },  // Sustain to trigger max replicas
        { duration: '5m', target: 0 },      // Cool down
      ],
      exec: 'highPriorityRequests',
      tags: { priority: 'high' },
    },
    // Low-priority traffic (AI analysis, batch operations)
    low_priority: {
      executor: 'ramping-vus',
      startVUs: 0,
      startTime: '2m',  // Start after initial ramp
      stages: [
        { duration: '3m', target: 3000 },   // Ramp up low-priority traffic
        { duration: '12m', target: 3000 },  // Sustain during max replicas
        { duration: '5m', target: 0 },      // Cool down
      ],
      exec: 'lowPriorityRequests',
      tags: { priority: 'low' },
    },
    // Monitor alerts
    alert_monitor: {
      executor: 'constant-vus',
      vus: 1,
      duration: '25m',
      exec: 'monitorAlerts',
      tags: { type: 'monitoring' },
    },
  },
  thresholds: {
    // High-priority requests should succeed even under load
    'http_req_duration{priority:high}': ['p(95)<5000'],  // Relaxed during stress
    'http_req_failed{priority:high}': ['rate<0.05'],     // < 5% failure for high priority

    // Low-priority requests may be rate-limited (429 is expected)
    'http_req_failed{priority:low}': ['rate<0.30'],      // Up to 30% can be rejected

    // Alert verification
    'alerts_approaching_max': ['count>0'],  // Must fire
    'alerts_at_max': ['count>0'],           // Must fire
  },
};

// High-priority request handler
export function highPriorityRequests() {
  group('High Priority - Gallery View', function() {
    const res = http.get(
      `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/galleries?limit=10`,
      {
        headers: getAuthHeaders(),
        tags: { name: 'high_priority_gallery', priority: 'high' }
      }
    );

    check(res, {
      'high priority succeeds': (r) => r.status === 200,
      'response time acceptable': (r) => r.timings.duration < 5000,
    });

    galleryViewDuration.add(res.timings.duration);
    galleryViewFailed.add(res.status >= 400);
  });

  sleep(randomIntBetween(1, 3));
}

// Low-priority request handler (expected to be rate-limited under stress)
export function lowPriorityRequests() {
  group('Low Priority - AI Analysis', function() {
    const res = http.post(
      `${BASE_URL}/api/v1/workspaces/${WORKSPACE_ID}/ai/analyze`,
      JSON.stringify({
        asset_ids: ['00000000-0000-0000-0000-000000000001'],
        analysis_type: 'quality'
      }),
      {
        headers: getAuthHeaders(),
        tags: { name: 'low_priority_ai', priority: 'low' }
      }
    );

    // 429 (rate limited) is acceptable for low-priority during stress
    const isAcceptable = res.status === 200 || res.status === 201 ||
                         res.status === 429 || res.status === 503;

    check(res, {
      'low priority handled': (r) => isAcceptable,
      'rate limit response is graceful': (r) => {
        if (r.status === 429) {
          try {
            const body = JSON.parse(r.body);
            return body.retry_after !== undefined || body.message !== undefined;
          } catch {
            return true;  // Accept even without body
          }
        }
        return true;
      },
    });
  });

  sleep(randomIntBetween(2, 5));
}

// Alert monitor - checks Prometheus for expected alerts
const alertsApproachingMax = new Counter('alerts_approaching_max');
const alertsAtMax = new Counter('alerts_at_max');

export function monitorAlerts() {
  const prometheusUrl = __ENV.PROMETHEUS_URL || 'http://localhost:9090';

  group('Alert Monitoring', function() {
    // Check for ApproachingMaxReplicas alert
    const approachingRes = http.get(
      `${prometheusUrl}/api/v1/alerts`,
      { tags: { name: 'check_alerts' } }
    );

    if (approachingRes.status === 200) {
      try {
        const alerts = JSON.parse(approachingRes.body);
        const activeAlerts = alerts.data.alerts || [];

        for (const alert of activeAlerts) {
          if (alert.labels.alertname === 'ApproachingMaxReplicas' &&
              alert.state === 'firing') {
            alertsApproachingMax.add(1);
            console.log('[ALERT] ApproachingMaxReplicas is FIRING');
          }

          if (alert.labels.alertname === 'AtMaxReplicas' &&
              alert.state === 'firing') {
            alertsAtMax.add(1);
            console.log('[ALERT] AtMaxReplicas is FIRING');
          }
        }
      } catch (e) {
        console.log(`[WARN] Could not parse alerts: ${e}`);
      }
    }

    // Check HPA status
    const hpaRes = http.get(
      `${BASE_URL}/api/v1/health/detailed`,
      { tags: { name: 'check_hpa' } }
    );

    if (hpaRes.status === 200) {
      console.log(`[INFO] Health check response: ${hpaRes.timings.duration}ms`);
    }
  });

  sleep(30);  // Check every 30 seconds
}
