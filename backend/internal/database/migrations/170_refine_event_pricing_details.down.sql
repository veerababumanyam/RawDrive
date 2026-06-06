BEGIN;

UPDATE subscription_plans
SET description = 'No subscription. One clean price per delivery cycle.',
    features = ARRAY[
        '7-day Upload Window',
        '30-day Client Access',
        '90-day Storage Retention',
        'Wedding Bundle Available',
        'Extend or Archive Anytime'
    ],
    updated_at = NOW()
WHERE tier = 'pay_per_event';

UPDATE subscription_plans
SET features = ARRAY[
        '100GB Storage',
        '10 Events / Month',
        'AI Face Search',
        'Reels & Shorts Gallery',
        'Basic Branding',
        'Photo Selling (10% Commission)'
    ],
    updated_at = NOW()
WHERE tier = 'creator';

COMMIT;
