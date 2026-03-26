require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const FRESH_API_KEY = process.env.FRESH_API_KEY;
const FRESH_BASE_URL = 'https://tickets.autodealersdigital.com/crm/sales/api';

const freshsales = axios.create({
  baseURL: FRESH_BASE_URL,
  headers: {
    Authorization: `Token token=${FRESH_API_KEY}`,
    'Content-Type': 'application/json',
  },
});

// Hard cutoff: accounts cancelled ON or AFTER this date cannot be called by anyone
const HARD_CUTOFF_DATE = new Date('2025-06-21');

// ─── Eligibility Logic ────────────────────────────────────────────────────────
// rep.role: "junior" | "senior" | "manager"
// rep.has_raise, rep.retention_training, rep.team_lead_approval (juniors only)

function getEligibility(dealer, rep) {
  if (!dealer) {
    return {
      decision: 'CHECK WITH MANAGER',
      icon: '🔍',
      reason: 'No dealer record found for this contact. They may not be a current or past customer.',
    };
  }

  const rawStatus = dealer.cf_account_status || dealer.account_status || '';
  const status = rawStatus.toLowerCase().trim();

  // ── Active ──
  if (status !== 'cancelled' && status !== 'canceled' && status !== 'suspended') {
    return {
      decision: 'CALLABLE',
      icon: '✅',
      reason: `Account is active (${rawStatus || 'Set up in progress'}).`,
      account_status: rawStatus || 'Active',
    };
  }

  // ── Suspended ──
  if (status === 'suspended') {
    return {
      decision: 'CHECK WITH MANAGER',
      icon: '🔍',
      reason: 'Account is suspended. Rules for suspended accounts are not yet defined — check with your manager.',
      account_status: rawStatus,
    };
  }

  // ── Cancelled ──
  const closedDateRaw = dealer.closed_date;

  if (!closedDateRaw) {
    return {
      decision: 'NEEDS MANAGER APPROVAL',
      icon: '⚠️',
      reason: 'Account is cancelled but no closed date is recorded. Manager approval required.',
      account_status: rawStatus,
    };
  }

  const cancelDate = new Date(closedDateRaw);
  const today = new Date();
  const daysSince = Math.floor((today - cancelDate) / (1000 * 60 * 60 * 24));

  // Hard cutoff rule: cancelled on or after June 21, 2025 — no one can call
  if (cancelDate >= HARD_CUTOFF_DATE) {
    return {
      decision: 'NOT ALLOWED',
      icon: '❌',
      reason: `Account was cancelled on ${formatDate(cancelDate)}, which is on or after June 21, 2025. No one is allowed to call this account.`,
      account_status: rawStatus,
      days_since_cancellation: daysSince,
      closed_date: closedDateRaw,
    };
  }

  // Cancelled before June 21, 2025 — apply standard rules
  if (daysSince < 90) {
    // Managers can approve themselves
    if (rep.role === 'manager') {
      return {
        decision: 'CALLABLE',
        icon: '✅',
        reason: `Account was cancelled ${daysSince} day(s) ago (under 90 days). As a manager, you can approve this call.`,
        account_status: rawStatus,
        days_since_cancellation: daysSince,
        closed_date: closedDateRaw,
      };
    }
    return {
      decision: 'NEEDS MANAGER APPROVAL',
      icon: '⚠️',
      reason: `Account was cancelled ${daysSince} day(s) ago (less than 90 days). Manager approval required before calling.`,
      account_status: rawStatus,
      days_since_cancellation: daysSince,
      closed_date: closedDateRaw,
    };
  }

  // Junior reps with tenure < 1 year and within 365 days
  if (rep.role === 'junior' && daysSince < 365) {
    const hasAll = rep.has_raise && rep.retention_training && rep.team_lead_approval;
    if (hasAll) {
      return {
        decision: 'CALLABLE',
        icon: '✅',
        reason: `Account cancelled ${daysSince} day(s) ago. All junior conditions met (raise ✓, retention training ✓, team lead approval ✓).`,
        account_status: rawStatus,
        days_since_cancellation: daysSince,
        closed_date: closedDateRaw,
      };
    }

    const missing = [];
    if (!rep.has_raise) missing.push('raise not received');
    if (!rep.retention_training) missing.push('retention training not completed');
    if (!rep.team_lead_approval) missing.push('team lead approval not granted');

    return {
      decision: 'NOT ALLOWED',
      icon: '❌',
      reason: `Account cancelled ${daysSince} day(s) ago. Junior rep missing: ${missing.join(', ')}.`,
      account_status: rawStatus,
      days_since_cancellation: daysSince,
      closed_date: closedDateRaw,
    };
  }

  // Senior / manager with 90+ days, or anyone with 365+ days
  return {
    decision: 'CALLABLE',
    icon: '✅',
    reason: `Account was cancelled ${daysSince} day(s) ago — eligible to call.`,
    account_status: rawStatus,
    days_since_cancellation: daysSince,
    closed_date: closedDateRaw,
  };
}

function formatDate(d) {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// ─── Fetch dealer for a contact ───────────────────────────────────────────────
async function getDealerForContact(contactId) {
  try {
    const res = await freshsales.get(`/contacts/${contactId}/deals`);
    const deals = res.data?.deals || [];
    if (deals.length === 0) return null;
    deals.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    return deals[0];
  } catch (err) {
    console.error(`Failed to fetch dealer for contact ${contactId}:`, err?.response?.data || err.message);
    return null;
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// POST /api/search
app.post('/api/search', async (req, res) => {
  const { query, rep } = req.body;

  if (!query || !query.trim()) return res.status(400).json({ error: 'Query is required.' });
  if (!rep) return res.status(400).json({ error: 'Rep info is required.' });

  try {
    const contactRes = await freshsales.get('/contacts/search', {
      params: { q: query.trim() },
    });

    const contacts = contactRes.data?.contacts || [];

    if (contacts.length === 0) {
      return res.json({ results: [], message: 'No contacts found.' });
    }

    const results = await Promise.all(
      contacts.map(async (contact) => {
        const dealer = await getDealerForContact(contact.id);
        const eligibility = getEligibility(dealer, rep);

        return {
          id: contact.id,
          name: contact.first_name
            ? `${contact.first_name} ${contact.last_name || ''}`.trim()
            : null,
          email: contact.email,
          phone: contact.mobile_number || contact.work_number || contact.phone,
          customer_id: contact.cf_customer_id || contact.customer_id || null,
          dealer_name: dealer?.name || null,
          dealer_stage: dealer?.deal_stage?.name || dealer?.stage_name || null,
          eligibility,
        };
      })
    );

    return res.json({ results });
  } catch (err) {
    console.error('Search error:', err?.response?.data || err.message);
    return res.status(500).json({
      error: 'Failed to search Freshsales.',
      details: err?.response?.data || err.message,
    });
  }
});

// GET /api/contact/:id
app.get('/api/contact/:id', async (req, res) => {
  try {
    const [contactRes, dealer] = await Promise.all([
      freshsales.get(`/contacts/${req.params.id}`),
      getDealerForContact(req.params.id),
    ]);
    return res.json({ contact: contactRes.data?.contact || contactRes.data, dealer });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch contact.', details: err?.response?.data || err.message });
  }
});

// GET /api/debug/contact/:id
app.get('/api/debug/contact/:id', async (req, res) => {
  try {
    const contact = await freshsales.get(`/contacts/${req.params.id}`);
    const dealer = await getDealerForContact(req.params.id);
    return res.json({ contact: contact.data, dealer });
  } catch (err) {
    return res.status(500).json({ error: err?.response?.data || err.message });
  }
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Call Eligibility server running on port ${PORT}`));
