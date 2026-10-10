/**
 * @file src/unique_features.js
 * @description Architectural documentation and schema blueprint for:
 *  1. Google Search Grounding for Real-Time Influencer Verification & Market Trends
 *  2. Interactive D3.js Performance Metrics & Audience Funnel Visualization
 *
 * This module exports the architectural contracts, configuration constants,
 * and SQL definitions used to synchronize telemetry and verification signals
 * across the frontend React components, backend Express routes, and Supabase database.
 */

export const UNIQUE_FEATURES_ARCHITECTURE = {
  version: "1.0.0",
  last_updated: "2026-09-23",

  // =========================================================================
  // 1. GOOGLE SEARCH GROUNDING INTEGRATION ARCHITECTURE
  // =========================================================================
  googleSearchGrounding: {
    purpose:
      "Eliminate fake influencer metrics, stale follower counts, and fraud in influencer marketing by grounding verification in live Google web search results.",
    benefits: [
      "Real-time validation of creator identity, social handles, and active brand deals.",
      "Instant fraud risk detection (e.g., bot engagement spikes, controversies, impersonation).",
      "Transparent web citations and references that build trust between brands and creators.",
      "Fair pricing intelligence grounded in current Indian creator economy benchmarks (CPM, barter limits)."
    ],
    backendRoutes: [
      {
        endpoint: "POST /api/market-intelligence/creator-verify",
        handler: "setupMarketIntelligenceRoutes -> handleCreatorVerify",
        model: "gemini-3.8-flash",
        tools: [{ googleSearch: {} }],
        description:
          "Executes a live search query evaluating the creator's social footprint, brand collaborations, and risk profile. Generates a 0-100 authenticity score and citations."
      },
      {
        endpoint: "POST /api/market-intelligence/rate-advisor",
        handler: "setupMarketIntelligenceRoutes -> handleRateAdvisor",
        model: "gemini-3.8-flash",
        tools: [{ googleSearch: {} }],
        description:
          "Calculates fair compensation ranges (min, median, max) and CPM benchmarks for Indian creators based on follower count, deliverable type, and category."
      },
      {
        endpoint: "GET /api/market-intelligence/trending-topics",
        handler: "setupMarketIntelligenceRoutes -> handleTrendingTopics",
        description:
          "Fetches real-time viral formats, trending hashtags, and campaign hooks by category."
      }
    ],
    frontendComponents: [
      {
        file: "src/components/market/GoogleSearchVerificationModal.jsx",
        description:
          "Accessible from any CreatorCard via the 'Verify' badge. Displays trust score, quality badges, web citations, and risk assessment."
      },
      {
        file: "src/components/market/RateAdvisorWidget.jsx",
        description:
          "Interactive calculator mounted in Explore.jsx. Allows brands/creators to estimate market rates and one-click apply them to deals."
      }
    ]
  },

  // =========================================================================
  // 2. D3.JS CAMPAIGN PERFORMANCE VISUALIZATION ARCHITECTURE
  // =========================================================================
  d3Visualization: {
    purpose:
      "Provide high-fidelity, interactive telemetry that tracks influencer delivery velocity, impression-to-conversion funnel health, and metro distribution.",
    benefits: [
      "Custom responsive SVG graphics that dynamically render time-series curves without heavy external canvas wrappers.",
      "Interactive multi-metric analysis (Views, Reach, Likes, Engagement %) with hover crosshairs and tooltips.",
      "Industry benchmark comparison curve allowing brands to audit whether campaigns outperformed the category average.",
      "Full visibility into audience drop-off at every stage of the deal conversion funnel."
    ],
    backendRoutes: [
      {
        endpoint: "GET /api/market-intelligence/performance/:id",
        handler: "setupMarketIntelligenceRoutes -> handleGetPerformanceMetrics",
        description:
          "Retrieves or auto-generates calibrated time-series metrics, audience funnel stages, and metro demographics for any deal or creator."
      },
      {
        endpoint: "POST /api/market-intelligence/performance/:id/record",
        handler: "setupMarketIntelligenceRoutes -> handleRecordPerformanceSnapshot",
        description:
          "Stores a point-in-time snapshot of live delivered views, reach, and likes from external post sync."
      }
    ],
    frontendComponents: [
      {
        file: "src/components/analytics/D3PerformanceVisualizer.jsx",
        description:
          "Modular D3.js component implementing d3.line, d3.area, d3.curveMonotoneX, d3.scaleLinear, and d3.scalePoint with tabs for Velocity, Funnel, and Metro Split."
      }
    ],
    integrationPages: [
      "src/pages/collabs/DealDetail.jsx",
      "src/pages/collabs/UploadedCollab.jsx"
    ]
  },

  // =========================================================================
  // 3. STRUCTURED SUPABASE SCHEMA PLAN
  // =========================================================================
  supabaseSchemaPlan: {
    description:
      "Dual-persistence architecture: Data is cached in db.json for zero-latency local fallback and mirrored to Supabase tables for relational queries.",
    sqlStatements: `
-- ============================================================================
-- Table 1: creator_verifications
-- Stores live Google Search Grounding verification reports and authenticity scores
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.creator_verifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL,
  creator_name TEXT,
  creator_handle TEXT,
  platform TEXT DEFAULT 'Instagram',
  category TEXT DEFAULT 'Lifestyle',
  verification_score INTEGER DEFAULT 85,
  badges JSONB DEFAULT '[]'::jsonb,
  audience_sentiment TEXT,
  risk_level TEXT DEFAULT 'LOW',
  risk_note TEXT,
  summary TEXT,
  grounding_sources JSONB DEFAULT '[]'::jsonb,
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_creator_verification UNIQUE (creator_id)
);

CREATE INDEX IF NOT EXISTS idx_creator_verifications_creator_id 
  ON public.creator_verifications (creator_id);

CREATE INDEX IF NOT EXISTS idx_creator_verifications_score 
  ON public.creator_verifications (verification_score);

-- Enable Row Level Security (RLS)
ALTER TABLE public.creator_verifications ENABLE ROW LEVEL SECURITY;

-- Allow public read access to verified badges
CREATE POLICY "Allow public read creator_verifications" 
  ON public.creator_verifications 
  FOR SELECT 
  TO public 
  USING (true);

-- Allow authenticated service / backend upsert
CREATE POLICY "Allow service upsert creator_verifications" 
  ON public.creator_verifications 
  FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);


-- ============================================================================
-- Table 2: campaign_performance_metrics
-- Stores D3.js time-series telemetry, conversion funnel, and demographic splits
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_performance_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id TEXT NOT NULL,
  time_series JSONB DEFAULT '[]'::jsonb,
  summary JSONB DEFAULT '{}'::jsonb,
  funnel_data JSONB DEFAULT '[]'::jsonb,
  demographics_bubble JSONB DEFAULT '[]'::jsonb,
  last_synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_deal_performance UNIQUE (deal_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_metrics_deal_id 
  ON public.campaign_performance_metrics (deal_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.campaign_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Allow deal participants (creator or brand) to read telemetry
CREATE POLICY "Allow participants read performance_metrics" 
  ON public.campaign_performance_metrics 
  FOR SELECT 
  TO public 
  USING (true);

-- Allow service upsert for sync processes
CREATE POLICY "Allow service upsert performance_metrics" 
  ON public.campaign_performance_metrics 
  FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);


-- ============================================================================
-- Table 3: market_rate_benchmarks (Optional Pricing Cache)
-- Caches Indian creator market benchmarks across tiers and deliverable formats
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.market_rate_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  niche TEXT NOT NULL,
  tier TEXT NOT NULL, -- 'nano', 'micro', 'macro', 'mega'
  deliverable_type TEXT NOT NULL,
  min_rate NUMERIC DEFAULT 0,
  median_rate NUMERIC DEFAULT 0,
  max_rate NUMERIC DEFAULT 0,
  cpm_estimate TEXT,
  tips JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_niche_tier_deliverable UNIQUE (niche, tier, deliverable_type)
);

-- ============================================================================
-- Table 4: influencer_data (Real-Time Search Grounding Persistent Registry)
-- Stores real-time Google Search discovered creators, engagement metrics, and risk flags
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.influencer_data (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  creator_id TEXT NOT NULL,
  query TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT,
  platform TEXT DEFAULT 'Instagram',
  followers TEXT,
  category TEXT DEFAULT 'Lifestyle',
  engagement_rate TEXT,
  verification_score INTEGER DEFAULT 80,
  summary TEXT,
  recent_collaborations JSONB DEFAULT '[]'::jsonb,
  risk_signals JSONB DEFAULT '[]'::jsonb,
  grounding_sources JSONB DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_influencer_creator_id UNIQUE (creator_id)
);

CREATE INDEX IF NOT EXISTS idx_influencer_data_query 
  ON public.influencer_data (query);

CREATE INDEX IF NOT EXISTS idx_influencer_data_handle 
  ON public.influencer_data (handle);

ALTER TABLE public.influencer_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read influencer_data" 
  ON public.influencer_data 
  FOR SELECT 
  TO public 
  USING (true);

CREATE POLICY "Allow service upsert influencer_data" 
  ON public.influencer_data 
  FOR ALL 
  TO authenticated 
  USING (true) 
  WITH CHECK (true);
`
  },

  // =========================================================================
  // 4. FRONTEND-BACKEND SYNCHRONIZATION LOGIC
  // =========================================================================
  synchronizationLogic: {
    overview:
      "Ensures seamless bidirectional data sync between client UI states, backend AI processing, and persistence layers.",
    flowStages: [
      {
        step: 1,
        title: "Client Trigger & Optimistic UI",
        description:
          "When a user clicks 'Verify' on CreatorCard or 'Calculate Fair Benchmark', the frontend shows an immediate loading indicator while caching previous values in local React state."
      },
      {
        step: 2,
        title: "Gemini Grounding & Web Search Execution",
        description:
          "The backend executes the generateContent call with Google Search Grounding tools enabled. It extracts the response text along with groundingMetadata (searchQueries and groundingChunks with web URLs)."
      },
      {
        step: 3,
        title: "Dual Persistence Pipeline",
        description:
          "The backend immediately persists the structured payload to db.json (ensuring offline and sandbox continuity), and simultaneously runs an upsert against the Supabase tables (creator_verifications / campaign_performance_metrics) using service role credentials."
      },
      {
        step: 4,
        title: "Real-time Telemetry Push & D3 Invalidation",
        description:
          "On response, the React components (D3PerformanceVisualizer, GoogleSearchVerificationModal) receive fresh data, automatically recalculating D3 scales (xScale, yScale) and triggering SVG transition animations with zero page refreshes."
      }
    ]
  }
};

export default UNIQUE_FEATURES_ARCHITECTURE;
