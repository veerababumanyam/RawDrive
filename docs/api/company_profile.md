# Company Profile & Branding API

This API suite manages workspace branding, including company profiles, public-facing gallery branding using studio defaults, and public profile pages.

---

## 1. Company Profiles (Workspace)

Base Path: `/api/v1/workspaces/{workspace_id}/company-profile`

### `GET /`
Retrieve the current workspace's company profile.
**Responses:**
- `200 OK`: `CompanyProfileResponse`
- `404 Not Found`: Profile not configured yet.

### `POST /`
Create or initialize a company profile.
**Body:** `CreateCompanyProfileRequest`
- `name` (required): Company name.
- `slug` (required): URL-friendly identifier (must be unique).
- `email` (required): Contact email.
- `brand_color`: Hex code.

### `PATCH /`
Update profile settings.
**Body:** `UpdateCompanyProfileRequest` (partial fields)

---

## 2. Public Profiles

Base Path: `/api/v1/public/profiles`

### `GET /{slug}`
Fetch public profile data (filtered by visibility settings).
**Returns:** JSON dict with name, contact info, logo, etc.

### `GET /{slug}/vcard`
Download a vCard 3.0 file for the company contact.

### `GET /{slug}/qr-code`
Get a PNG QR code image linking to the public profile URL.

---

## 3. Policy Generation

Base Path: `/api/v1/workspaces/{workspace_id}/company-profile/policies/generate`

### `POST /`
Generate legal policy text (Privacy, Terms, Refund).
**Params:**
- `policy_type`: `privacy`, `terms`, or `refund`.

**Returns:**
```json
{
  "type": "privacy",
  "content": "# Privacy Policy\n\n..."
}
```

---

## 4. Schemas

### Visibility Configuration
Controls which fields are public.
```json
{
  "email": true,
  "phone": false,
  "address": true
}
```

### Social Links
```json
{
  "instagram": "https://instagram.com/studio",
  "facebook": "..."
}
```
