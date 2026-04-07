<p align="center">
  <img src="logo/android-chrome-512x512.png" alt="RawDrive Logo" width="180" height="180" style="border-radius: 40px; box-shadow: 0 30px 60px rgba(37, 99, 235, 0.3);" />
</p>

<h1 align="center">RawDrive</h1>

<p align="center">
  <strong>The Operating System for Professional Photography in India</strong>
  <br />
  <sub>Made in India, Made for India, with Love</sub>
</p>

<p align="center">
  <a href="#features"><img src="https://img.shields.io/badge/Platform-SaaS-2563EB?style=for-the-badge" alt="Platform SaaS" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 19" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Go-Backend-00ADD8?style=for-the-badge&logo=go&logoColor=white" alt="Go Backend" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/Tailwind-v4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" alt="Tailwind v4" /></a>
  <a href="#tech-stack"><img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript 5" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/status-Active%20Development-brightgreen?style=flat-square" alt="Status" />
  <img src="https://img.shields.io/badge/%F0%9F%87%AE%F0%9F%87%B3_Made_in-India-FF9933?style=flat-square" alt="Made in India" />
  <img src="https://img.shields.io/badge/%E2%9D%A4%EF%B8%8F_Built_with-Love-e25555?style=flat-square" alt="Built with Love" />
  <img src="https://img.shields.io/badge/license-Proprietary-red?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="#vision">Vision</a> • 
  <a href="#features">Features</a> • 
  <a href="#tech-stack">Tech Stack</a> • 
  <a href="#roadmap">Roadmap</a> • 
  <a href="#getting-started">Getting Started</a>
</p>

---

## 🚀 The Vision: India's Photography Paradigm, Redefined.

Professional photography in India is a unique ecosystem—massive weddings, regional dealer networks, and diverse cultural nuances across 28 states. **RawDrive** isn't just a gallery; it's a unified business engine. It replaces the chaos of 10+ disjointed tools with a single, stunning, AI-powered platform.

> *"We didn't just build a folder. We built a command center for the Indian artist."*

---

## 💎 Why RawDrive Beats Everything Else

| Problem | RawDrive Solution |
| :--- | :--- |
| **Scattered Tools** | **One Unified Vault:** Galleries, CRM, Invoicing, and Marketing in one tab. |
| **English-Only Portals** | **Indic-Native:** Full support for Hindi, Telugu, Tamil, & 10+ Indian languages. |
| **Manual Culling** | **AI Smart Cull:** Gemini-powered aesthetic scoring & blur detection. |
| **Payment Friction** | **Integrated UPI:** One-click PhonePe, Google Pay, & GST-aware billing. |
| **Generic UX** | **Premium Galleries:** PWA-enabled, stunning client experiences that close deals. |

---

## 🔥 Feature Deep-Dive

### 🎨 Stunning Gallery & Client Delivery
*   **Liquid Glass Design:** Premium, high-performance galleries that wow clients at first sight.
*   **Interactive Proofing:** Seamless selection workflows that cut delivery time by 70%.
*   **Cover Design Studio:** 25+ professional layouts for stunning album previews.
*   **PWA Mobility:** Client galleries install as branded Apps on their mobile screens.
*   **"View as Client":** Instant previews to ensure perfection before the link goes out.

### 🧠 AI-Native Intelligence (Gemini Cloud)
*   **Face Recognition:** Instant guest filtering via selfies—no more searching through thousands of photos.
*   **Smart Culling:** Automated detection of blur, closed eyes, and duplicates.
*   **Aesthetic Scoring:** Let the AI identify and highlight your "Hero Shots" instantly.
*   **Scene Auto-Tagging:** Automated categorization (Wedding, Portrait, Landscape, Rituals).

### 💼 Business & Operations Suite
*   **GST-Aware Invoicing:** Compliant contracts and bills designed for the Indian tax code.
*   **CRM 2.0:** Integrated client profiles, deal tracking, and wedding-season calendars.
*   **Payment Hub:** Native UPI integration for faster settlements and payment tracking.
*   **Digital Business Cards:** Personalized `/u/{slug}` cards for modern networking.

### 🌐 Connectivity & Ecosystem
*   **WhatsApp Sync:** Real-time client notifications and delivery links via WhatsApp.
*   **Live Stream:** High-quality, low-latency event streaming via Cloudflare Stream.
*   **Network Marketplaces:** Connect with freelancers, rentals, and gear resellers.
*   **State-First Tenancy:** Built-in regional dealer portal with revenue-sharing dashboards.

---

## 🛠️ The Tech Titan Stack

We use a "Zero-Compromise" architecture to ensure sub-200ms interactivity:

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 19, TypeScript 5, Vite 6, Framer Motion |
| **Backend** | Go (Golang) + Chi Router (Planned) |
| **Intelligence** | Google Gemini AI + PGvector Embeddings |
| **Storage** | Cloudflare R2 Edge + Global CDN |
| **Database** | PostgreSQL + Valkey (Memory Cache) |
| **Identity** | face-api.js ML Models |
| **Experience** | i18next (10+ Indic Languages), Tailwind CSS v4 |

---

## 📁 Project Architecture

```
RawDriveDetails/
  ├── frontend/                  ✨ React SPA Product
  │   ├── src/
  │   │   ├── components/        🎨 Domain UI (Gallery, AI, Admin)
  │   │   ├── contexts/          🔄 State (Auth, Lightbox, PWA)
  │   │   ├── hooks/             🪝 Logic (Uploads, Queries)
  │   │   └── data/              📜 Policies & Legal
  │   └── public/                🖼️ Assets, Models, Locales
  ├── shared/                    🏗️ Workspace Packages
  │   └── constants, types, utils, validation
  └── backend/                   ⚡ Go API (In Development)
```

---

## 🗺️ Roadmap to 1.0 Victory

- [x] **M1: The Core Foundation** — Design System & Base UI
- [x] **M2: Indic-Native i18n** — 10+ Languages & Regional Webfonts
- [x] **M3: PWA & Mobile UX** — Installable Client Galleries
- [ ] **M4: The Gemini Brain** — AI Culling & Auto-Curation
- [ ] **M5: Invoicing & GST** — Financial Engine & PhonePe
- [ ] **M6: Live & Dealers** — Cloudflare Stream & Partner Network

---

## 🚀 Getting Started

**Prerequisites:** Node.js 20+, pnpm 9+

```bash
# Clone the repository
git clone https://github.com/veerababumanyam/RD.git
cd RawDriveDetails

# Install the ecosystem
pnpm install

# Launch Development
cd frontend
pnpm dev
```

---

## 🤝 The Authors

| Profile | Name | Role | Contact |
| :--- | :---: | :--- | :--- |
| 🇮🇳 | **Manyam Prasad** | Visionary & Lead Developer | [manyamprasad@gmail.com](mailto:manyamprasad@gmail.com) |
| ⚡ | **CoBolt** | AI-Native Orchestrator | *Enterprise-Grade Delivery* |

---

<p align="center">
  <strong>RawDrive</strong> — Made with ❤️ in India, for the World.
  <br />
  <sub>Designed for Indian workflows • Built on Indian infrastructure • Priced for Indian businesses</sub>
  <br /><br />
  <img src="logo/favicon-32x32.png" width="32" />
</p>


