# Freshsales Call Eligibility — Project Progress

## Project Overview
Call Eligibility Checker for AutoDealers Digital internal sales team.
Reps type a dealership name, phone, or email — the system looks it up in Freshsales and tells them if they're allowed to call or not.

## Architecture
- **Frontend**: `index.html` — hosted on GitHub Pages
- **Backend**: `server.js` (Node.js + Express) — to be deployed on Railway
- **CRM**: Freshsales at `tickets.autodealersdigital.com`
- **Repo**: https://github.com/RyanSparks7/freshsales-call-eligibility
- **Live site**: https://ryansparks7.github.io/freshsales-call-eligibility/

---

## Changelog

### 2026-03-26 — Initial Build
- Project initialized in `c:/Users/pc/Desktop/Freshsales Call eligibility/`
- Created `PROGRESS.md` progress tracking file
- Built full project scaffold:
  - `package.json` — Express, Axios, CORS, dotenv dependencies
  - `server.js` — Node/Express backend
  - `index.html` — frontend UI
  - `.env` — API key config (never committed to git)
  - `.gitignore` — excludes node_modules and .env
- Created GitHub repo and pushed all files
- Enabled GitHub Pages on the repo

### 2026-03-26 — CRM Structure Discovery
- Reviewed actual Freshsales CRM screenshots to understand data structure:
  - Contacts ARE the dealerships (no separate sales_account object)
  - **Account Status** lives on the Dealer (Deal) record — values: `Cancelled`, `Suspended`, or active (anything else)
  - **Cancellation date** = `closed_date` field on the dealer record
  - Dealer stage pipeline: Re set up → Set up in progress → Set-up complete → Review
- Rewrote `server.js`:
  - Removed `sales_accounts` search entirely
  - Eligibility now reads from the dealer record linked to each contact via `getDealerForContact()`
  - `Account Status` mapped to `cf_account_status` custom field on dealer
  - Added `GET /api/debug/contact/:id` route for field name inspection during testing

### 2026-03-26 — Brand Redesign
- Redesigned `index.html` to match AutoDealers Digital brand style (https://ryansparks7.github.io/Main/):
  - Dark background `#1a1a1a`
  - Teal accent `#00C8B4`
  - Font: Montserrat (400–900 weights)
  - White cards with 4px teal top border
  - Uppercase labels with letter-spacing
  - Hover animations on result cards

### 2026-03-26 — Rep System + Eligibility Rules
- Replaced manual tenure/raise/training fields with a **rep name dropdown**
  - 36 reps loaded by default with assigned roles (Junior / Senior / Manager)
  - Selection persists in `localStorage` — rep doesn't need to re-select every session
  - Role badge displayed next to selected name
  - Junior reps see extra fields (raise received, retention training, team lead approval)
  - Senior and Manager reps skip those fields entirely
- Added **Add a Rep** section at the bottom — new reps saved to `localStorage` and appear in dropdown immediately
- Updated `server.js` eligibility logic to use roles instead of tenure years:
  - **Manager**: "Needs Manager Approval" → auto-approved (they are the manager)
  - **Senior**: standard rules apply
  - **Junior**: stricter rules for cancelled accounts 90–365 days old
- Added **June 21, 2025 hard cutoff rule**: any account cancelled on or after June 21, 2025 → ❌ NOT ALLOWED for everyone, no exceptions
- Added **Hajar** as manager to the rep list

## Rep Roster
| Name | Role |
|---|---|
| Aaron Price | Junior |
| Adam | Senior |
| Alexa Clark | Senior |
| Amanda Moore | Senior |
| Amy | Manager |
| Anthony Sparks | Senior |
| Ashley Bennett | Senior |
| Austin Parker | Junior |
| Autumn | Junior |
| Bill Carter | Senior |
| Chris Walker | Junior |
| Claire Wilson | Senior |
| Emily White | Senior |
| Hailey Anderson | Manager |
| Hajar | Manager |
| Hazel | Senior |
| Heather Green | Senior |
| Jamie Mckenzie | Manager |
| Jessica Clark | Manager |
| John Harris | Junior |
| Jordan Hill | Junior |
| Katie Walker | Manager |
| Kyla Carter | Junior |
| Kyle Young | Junior |
| Laura Clark | Senior |
| Lisa Kelly | Senior |
| Mark White | Junior |
| Mason Miller | Senior |
| Mike Cohen | Junior |
| Rachel Winter | Junior |
| Robert Anderson | Junior |
| Ryan Sparks | Manager |
| Sam Davis | Junior |
| Staci van Wyk | Manager |
| Travis Cole | Junior |
| William Lamperd | Senior |

## Pending
- Backend deployment on Railway (needs FRESH_API_KEY environment variable)
- Verify exact Freshsales API field name for `cf_account_status` on dealer record once backend is live
- Cancelled/suspended accounts list to be shared by Ryan — will be used to add assigned rep restrictions
