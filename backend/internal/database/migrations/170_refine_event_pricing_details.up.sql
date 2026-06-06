BEGIN;

UPDATE subscription_plans
SET description = 'No subscription. Rs.199 events include a 30-day active phase; Rs.499 wedding uploads include 60 active days.',
    features = ARRAY[
        'Rs.199 Event Upload',
        '30-day Active Phase',
        'View-only After Active Phase',
        'No New Uploads After Expiry',
        'Auto-archive After 90 Days',
        'Rs.499 Wedding Upload (60-day Active Phase)',
        'Extension Packs Available'
    ],
    updated_at = NOW()
WHERE tier = 'pay_per_event';

UPDATE subscription_plans
SET features = ARRAY[
        '100GB Storage',
        '10 Events / Month',
        'AI Face Search',
        'Reel & Shorts Gallery',
        'Basic Branding',
        'Photo Selling (10% Commission)'
    ],
    updated_at = NOW()
WHERE tier = 'creator';

COMMIT;
