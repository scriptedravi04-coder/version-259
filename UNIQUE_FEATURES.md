# Unique Features & Architectural Enhancements

This document catalogs the unique, advanced capabilities engineered into the Ybex Influencer Marketplace platform. It serves as an architectural record for developers, administrators, and future AI agents.

---

## 1. Live Influencer Verification with Google Search Grounding

### Overview
Traditional influencer platforms rely on static self-reported metrics or stale scraper caches that quickly become outdated. This feature grounds influencer authenticity checks directly in real-time web search results powered by Gemini models (`gemini-2.5-flash`) with dynamic Google Search Grounding tools.

### Backend Endpoints
- **`POST /api/market-intelligence/creator-verify`**
  - **Inputs:** `creator_id`, `name`, `handle`, `platform`, `category`, `force_refresh`
  - **Functionality:**
    - Queries Google Search Grounding to evaluate real-time follower footprint, media coverage, controversies, verified brand partnerships, and organic engagement sentiment.
    - Generates a quantified **Verification Score (0-100)**.
    - Detects risk signals (disputes, paid follower spikes, inactive handles).
    - Extracts live web grounding sources and citations with verifiable URLs.
    - Caches results in `db.json` (`creator_verifications`) and mirrors to Supabase when connected.

### Frontend Components
- **`src/components/market/GoogleSearchVerificationModal.jsx`**
  - Accessible directly from `CreatorCard` across the **Explore** page (`src/pages/dashboard/Explore.jsx`).
  - Displays:
    - Real-time Authenticity & Trust Gauge.
    - Detected Quality Badges (e.g., "Active Brand Endorsements", "Clean Public Sentiment").
    - Web Citations with direct external links.
    - Risk Signal & Sentiment Breakdown.
    - Adheres to the button alignment standard (Cancel/Close on the left, Re-scan on the right).

---

## 2. Interactive D3.js Campaign Performance & Telemetry Engine

### Overview
A custom, SVG-driven data visualization suite built from scratch using **D3.js** (`d3.line()`, `d3.area()`, `d3.curveMonotoneX`, `d3.scaleLinear`, `d3.scalePoint`). Unlike generic static chart libraries, this provides interactive crosshairs, fluid gradient fills, responsive tooltips, and multi-metric velocity analysis.

### Visualized Metrics
1. **Growth Velocity Curve:**
   - Multi-metric toggle: **Cumulative Views**, **Unique Reach**, **Total Likes**, **Engagement Rate %**.
   - Time window filter: **7 Days** vs **14 Days**.
   - Dashed **Industry / Category Benchmark Line** showing campaign outperformance.
   - Interactive hover cursor, crosshair guideline, and real-time floating tooltip.
2. **Audience Conversion Funnel:**
   - Visualizes pipeline drop-off: *Impressions ➔ Unique Reach ➔ Engaged Viewers ➔ Profile Visits ➔ Link Conversions*.
   - Dynamic percentage bars and step-by-step retention rates.
3. **Geographic Metro Split:**
   - Regional distribution covering Tier-1 Metros (Mumbai, Delhi-NCR, Bangalore) vs Tier-2 (Pune, Ahmedabad, Jaipur) vs Tier-3.

### Backend Endpoints
- **`GET /api/market-intelligence/performance/:id`**
  - Synthesizes and persists time-series telemetry linked to deal IDs.
  - Automatically handles fallbacks and persists records to `db.json` (`campaign_performance_metrics`) and Supabase.

### Frontend Components
- **`src/components/analytics/D3PerformanceVisualizer.jsx`**
  - Integrated into:
    - **Deal Detail Milestones:** `src/pages/collabs/DealDetail.jsx`
    - **Live Post Performance Workspace:** `src/pages/collabs/UploadedCollab.jsx`

---

## 3. Real-Time Market Rate Advisor & Pricing Benchmark

### Overview
Eliminates pricing friction between Indian brands and creators by providing dynamic, grounded pricing benchmarks based on deliverable types, follower count, and industry niche (CPM / Reel standards).

### Backend Endpoints
- **`POST /api/market-intelligence/rate-advisor`**
  - **Inputs:** `niche`, `follower_count`, `platform`, `deliverable_type`, `proposed_rate`
  - **Outputs:** Recommended min/max fair price range, median benchmark in INR (₹), CPM estimate, and negotiation tactics.
- **`GET /api/market-intelligence/trending-topics`**
  - Returns live viral content hooks and themes grounded via Google Search.

### Frontend Components
- **`src/components/market/RateAdvisorWidget.jsx`**
  - Embedded as a collapsible panel in `src/pages/dashboard/Explore.jsx`.
  - Enables brands to test deliverable pricing before initiating collaborations.
  - One-click "Apply Median" button to carry market rates directly into negotiations.

---

## 4. Database & Supabase Integration Guidelines

The architecture uses a dual-layer persistence model:
1. **Primary / Local Cache:** `db.json` managed via `getDb()` and `saveDb()`.
2. **Relational / Cloud Layer:** Supabase tables with graceful error handling.

### Optional Supabase Tables (Recommended Schema):
```sql
-- 1. Creator Live Verifications
CREATE TABLE IF NOT EXISTS creator_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL,
  verification_score INT DEFAULT 85,
  badges JSONB DEFAULT '[]'::jsonb,
  audience_sentiment TEXT,
  risk_level TEXT DEFAULT 'LOW',
  grounding_sources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Campaign Telemetry Time-Series
CREATE TABLE IF NOT EXISTS campaign_performance_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT NOT NULL,
  time_series JSONB DEFAULT '[]'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  funnel_data JSONB DEFAULT '[]'::jsonb,
  demographics_bubble JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
*Note: The backend gracefully detects if these tables exist; if not yet migrated, it seamlessly falls back to `db.json` without breaking any client functionality or throwing blob errors.*
