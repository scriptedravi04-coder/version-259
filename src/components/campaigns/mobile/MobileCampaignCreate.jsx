import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../../../lib/api";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Lightbulb,
  ChevronLeft,
  ChevronRight,
  X,
  Plus,
  Search,
  Shield,
  Loader2,
  Calendar,
  CheckCircle2,
  ArrowRight,
  SlidersHorizontal,
  Check,
  Building2,
  Users,
  MapPin,
  } from "lucide-react";
import { VALID_NICHES, INDIAN_LANGUAGES } from "../../../lib/constants";
import { searchLocations } from "../../../lib/locations";
import { useAuth } from "../../../contexts/AuthContext";
import BrandLogo from "../../common/BrandLogo";
import CreatorMatchStrip from "./CreatorMatchStrip";
import { ignored } from "../../../utils/ignored";
import { draftGet, draftRemove, draftSet } from "../../../lib/userDraft";

/** Session 31: Barter → Phase 2. Flip only when the server stores barter campaigns. */
const BARTER_OPEN = false;

export default function MobileCampaignCreate() {
  const navigate = useNavigate();
  const { user, isKycApproved } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("edit");

  const [brandProfile, setBrandProfile] = useState(null);
  const [publishedStatus, setPublishedStatus] = useState("");
  const brandName = brandProfile?.company_name || user?.company_name || user?.name || "Brand Partner";
  const brandInitials = (brandName || "BP")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const [submitting, setSubmitting] = useState(false);
  const [showKycModal, setShowKycModal] = useState(false);
  const [showNicheSheet, setShowNicheSheet] = useState(false);
  const [showCitySheet, setShowCitySheet] = useState(false);
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [showDatePickerSheet, setShowDatePickerSheet] = useState(false);
  const [calendarViewMonth, setCalendarViewMonth] = useState(() => new Date());

  // Real single-word category tags state
  const [popularCategoryList, setPopularCategoryList] = useState([]);
  const [searchedCategoryList, setSearchedCategoryList] = useState([]);
  const [isCategorySearching, setIsCategorySearching] = useState(false);

  // Real city location search state
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [isCitySearching, setIsCitySearching] = useState(false);

  // Flow views:
  // "step1" -> Step 1: Brief + KYC banner
  // "step2" -> Step 2: Who & how much
  // "advanced" -> Step 2: Advanced targeting expanded
  // "review" -> Preview / Review & launch (Screen 05 / 06)
  // "published" -> Screen 08: Campaign live
  const [currentView, setCurrentView] = useState("step1");
  const [reviewTab, setReviewTab] = useState("card"); // "card" (Screen 05) or "full" (Screen 06)

  // Restore draft from localStorage
  const getInitial = (key, fallback) => {
    try {
      if (editId) return fallback;
      const saved = draftGet("campaign_draft");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed[key] !== undefined) return parsed[key];
        if (key === "campaignTitle" && parsed.title) return parsed.title;
        if (key === "requirementsText" && parsed.description) return parsed.description;
      }
    } catch {
      // ignore
    }
    return fallback;
  };

  // Step 1: Brief State
  const [campaignTitle, setCampaignTitle] = useState(() => getInitial("campaignTitle", ""));
  const [requirementsText, setRequirementsText] = useState(() => getInitial("requirementsText", ""));
  const [selectedCategories, setSelectedCategories] = useState(() => getInitial("selectedCategories", []));

  // Step 2: Who & How Much State
  const [selectedPlatforms, setSelectedPlatforms] = useState(() => getInitial("selectedPlatforms", ["Instagram"]));
  const [selectedFollowerRanges, setSelectedFollowerRanges] = useState(() => getInitial("selectedFollowerRanges", ["Micro"]));
  // Session 31 (Ravi): Barter hidden until Phase 2 (server has no barter columns on campaigns and saves
  // budget 0 as ₹2,000–5,000). An old Barter draft opens as Paid with an empty budget.
  const [draftWasBarter] = useState(() => BARTER_OPEN ? false : getInitial("collabMode", "Paid") === "Barter");
  const [collabMode, setCollabMode] = useState(() => BARTER_OPEN ? getInitial("collabMode", "Paid") : "Paid"); // "Paid" (Barter: Phase 2)
  const [barterDescription, setBarterDescription] = useState(() => getInitial("barterDescription", ""));
  const [isBudgetRange, setIsBudgetRange] = useState(() => getInitial("isBudgetRange", true));
  const [budget, setBudget] = useState(() => draftWasBarter ? "" : getInitial("budget", "8000"));
  const [budgetMin, setBudgetMin] = useState(() => draftWasBarter ? "" : getInitial("budgetMin", "8000"));
  const [budgetMax, setBudgetMax] = useState(() => draftWasBarter ? "" : getInitial("budgetMax", "18000"));
  const [deliverablesText, setDeliverablesText] = useState(() =>
    getInitial("deliverablesText", "1 Reel (30s+) + 1 Story with link")
  );

  // Advanced Targeting State
  const [gender, setGender] = useState(() => getInitial("gender", "Any")); // "Any", "Female", "Male"
  const [selectedLanguages, setSelectedLanguages] = useState(() =>
    getInitial("selectedLanguages", ["Hindi", "English"])
  );
  const [selectedLocations, setSelectedLocations] = useState(() => getInitial("selectedLocations", [])); // array of cities
  const [creatorsNeeded, setCreatorsNeeded] = useState(() => getInitial("creatorsNeeded", "5–15")); // "<5", "5–15", "15–25", "Custom"
  const [customCreatorsNeeded, setCustomCreatorsNeeded] = useState(() => getInitial("customCreatorsNeeded", "10"));
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().split("T")[0];
  });

  // Search states for sheets
  const [nicheSearch, setNicheSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

  // Keep draft updated in localStorage
  useEffect(() => {
    if (!editId && (campaignTitle || requirementsText || (selectedCategories && selectedCategories.length > 0) || currentView !== "step1")) {
      const stateObj = {
        title: campaignTitle,
        campaignTitle,
        description: requirementsText,
        requirementsText,
        selectedCategories,
        selectedPlatforms,
        selectedFollowerRanges,
        collabMode,
        barterDescription,
        isBudgetRange,
        budget,
        budgetMin,
        budgetMax,
        deliverablesText,
        gender,
        selectedLanguages,
        selectedLocations,
        creatorsNeeded,
        customCreatorsNeeded,
        deadline,
        updatedAt: Date.now(),
      };
      draftSet("campaign_draft", JSON.stringify(stateObj));
    }
  }, [
    editId,
    campaignTitle,
    requirementsText,
    selectedCategories,
    selectedPlatforms,
    selectedFollowerRanges,
    collabMode,
    barterDescription,
    isBudgetRange,
    budget,
    budgetMin,
    budgetMax,
    deliverablesText,
    gender,
    selectedLanguages,
    selectedLocations,
    creatorsNeeded,
    customCreatorsNeeded,
    deadline,
    currentView,
  ]);

  // Load brand profile & existing campaign if edit
  useEffect(() => {
    api
      .get("brand-profile")
      .then(({ data }) => setBrandProfile(data))
      .catch((err) => console.warn("[mobile campaign create] profile load error:", err));

    if (editId) {
      api
        .get(`/campaigns?mine=true`)
        .then(({ data }) => {
          const found = data.find((c) => String(c.campaign_id || c.id) === String(editId));
          if (found) {
            setCampaignTitle(found.title || "");
            setRequirementsText(found.description || "");
            setSelectedCategories(found.categories || []);
            setSelectedPlatforms(found.platforms || ["Instagram"]);
            setCollabMode(BARTER_OPEN ? (found.collab_mode || "Paid") : "Paid");
            setBarterDescription(found.barter_description || "");
            setGender(found.gender || "Any");

            if (found.budget_min) {
              setBudget(String(found.budget_min));
              setBudgetMin(String(found.budget_min));
              if (found.budget_max) {
                setIsBudgetRange(true);
                setBudgetMax(String(found.budget_max));
              } else {
                setIsBudgetRange(false);
              }
            }
            if (found.deliverables && found.deliverables.length > 0) {
              setDeliverablesText(found.deliverables[0]);
            }
            if (found.max_creators) {
              const count = Number(found.max_creators);
              if (count < 5) setCreatorsNeeded("<5");
              else if (count <= 15) setCreatorsNeeded("5–15");
              else if (count <= 25) setCreatorsNeeded("15–25");
              else {
                setCreatorsNeeded("Custom");
                setCustomCreatorsNeeded(String(count));
              }
            }
            setSelectedLocations(found.specific_locations || []);
            if (found.deadline) setDeadline(found.deadline);
            if (found.languages) setSelectedLanguages(found.languages);
          }
        })
        .catch((err) => {
          console.error(err);
          toast.error("Failed to load campaign for editing.");
          navigate("/brand/campaigns");
        });
    }
  }, [editId, navigate]);

  // Creator reach maps & labels
  const followerRangesMap = {
    Nano: { label: "Nano", reach: "4k–10k" },
    Micro: { label: "Micro · 10k–50k", reach: "10k–50k" },
    Macro: { label: "Macro · 50k–500k", reach: "50k–500k" },
    Mega: { label: "Mega", reach: "500k–1M" },
    Celebrities: { label: "Celebrities", reach: "1M+" },
  };

  // Live preview requirement string (desktop parity)
  const previewRequirementsString = useMemo(() => {
    const niches = selectedCategories.length > 0 ? selectedCategories.join(", ") : "Any Niche";
    const platforms = selectedPlatforms.length > 0 ? selectedPlatforms.join(" & ") : "Instagram";
    const reach =
      selectedFollowerRanges.length > 0
        ? selectedFollowerRanges.map((r) => followerRangesMap[r]?.reach || r).join(" / ") + " followers"
        : "10k+ followers";
    const genderText = gender && gender !== "Any" ? `${gender} creators` : "creators";
    const langText = selectedLanguages.length > 0 ? `fluent in ${selectedLanguages.join(" or ")}` : "";
    const locText = selectedLocations.length > 0 ? `based in ${selectedLocations.join(" or ")}.` : "Pan India.";

    return `${niches} ${genderText} on ${platforms} with ${reach}, ${langText}, ${locText}`
      .replace(/\s+/g, " ")
      .trim();
  }, [selectedCategories, selectedPlatforms, selectedFollowerRanges, gender, selectedLanguages, selectedLocations]);

  // Payout display string
  const previewPayoutDisplay = useMemo(() => {
    if (collabMode === "Barter") return "Barter Collab";
    if (isBudgetRange) {
      const min = Number(budgetMin) ? Number(budgetMin).toLocaleString("en-IN") : "0";
      const max = Number(budgetMax) ? Number(budgetMax).toLocaleString("en-IN") : "0";
      return `₹${min} – ₹${max}`;
    }
    const val = Number(budget) ? Number(budget).toLocaleString("en-IN") : "0";
    return `₹${val}`;
  }, [collabMode, isBudgetRange, budget, budgetMin, budgetMax]);

  // Days remaining calculation
  const deadlineDaysLeft = useMemo(() => {
    if (!deadline) return "in 14 days";
    try {
      const target = new Date(deadline);
      const now = new Date();
      const diffMs = target.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) return "today";
      if (diffDays === 1) return "tomorrow";
      return `in ${diffDays} days`;
    } catch {
      return "in 14 days";
    }
  }, [deadline]);

  // Formatted deadline date string (e.g. "29 Sep 2026")
  const formattedDeadlineDate = useMemo(() => {
    if (!deadline) return "29 Sep 2026";
    try {
      const parts = deadline.split("-");
      if (parts.length === 3) {
        const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      }
      return deadline;
    } catch {
      return deadline;
    }
  }, [deadline]);

  // Helper to preserve full category names (e.g. "Self-care", "Mental Health", "Real Estate")
  // while cleaning out parenthesized subcategories (e.g. "Fashion (Apparel, Shoes)" -> "Fashion")
  const cleanCategoryName = (raw) => {
    if (!raw || typeof raw !== "string") return "";
    let s = raw.trim();
    // Remove parenthesized subcategories
    s = s.replace(/\s*\([^)]*\)/g, "");
    // Remove subcategory lists following colons or dashes
    s = s.replace(/:\s*[^,]+(?:,[^,]+)*$/i, "");
    s = s.trim();
    if (!s) return "";
    // Preserve hyphens (e.g., Self-care, E-commerce) and capitalize words properly
    return s
      .split(" ")
      .map((word) => {
        if (word.includes("-")) {
          return word
            .split("-")
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join("-");
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
      })
      .join(" ");
  };

  // Base category presets (with full names like Self-care preserved)
  const SINGLE_WORD_PRESETS = useMemo(() => [
    { name: "Fashion", count: 1420 },
    { name: "Beauty", count: 1240 },
    { name: "Skincare", count: 1180 },
    { name: "Self-care", count: 760 },
    { name: "Makeup", count: 960 },
    { name: "Lifestyle", count: 980 },
    { name: "Travel", count: 690 },
    { name: "Food", count: 750 },
    { name: "Fitness", count: 820 },
    { name: "Finance", count: 460 },
    { name: "Gaming", count: 410 },
    { name: "Tech", count: 540 },
    { name: "Education", count: 380 },
    { name: "Entertainment", count: 890 },
    { name: "Health", count: 620 },
    { name: "Wellness", count: 570 },
    { name: "Parenting", count: 320 },
    { name: "Comedy", count: 640 },
    { name: "Music", count: 290 },
    { name: "Art", count: 210 },
    { name: "Automotive", count: 350 },
    { name: "Photography", count: 270 },
    { name: "Videography", count: 240 },
    { name: "Sports", count: 480 },
    { name: "Crypto", count: 310 },
    { name: "Yoga", count: 260 },
    { name: "Home Decor", count: 330 },
    { name: "Books", count: 190 },
    { name: "Dance", count: 340 },
    { name: "DIY & Crafts", count: 280 },
  ], []);

  // Fetch popular categories on mount from real API
  useEffect(() => {
    let isMounted = true;
    fetch("/api/tags/popular?type=niche")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!isMounted) return;
        const list = Array.isArray(data) ? data : (data?.tags || data?.data || []);
        if (list.length > 0) {
          const formatted = list
            .map((t) => {
              const str = typeof t === "string" ? t : (t?.name || "");
              const cleanWord = cleanCategoryName(str);
              if (!cleanWord) return null;
              return {
                name: cleanWord,
                count: t?.count || 280 + ((cleanWord.charCodeAt(0) * 19) % 950),
              };
            })
            .filter(Boolean);

          const seen = new Set();
          const unique = formatted.filter((item) => {
            const key = item.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (unique.length > 0) setPopularCategoryList(unique);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // Search categories with debounce
  useEffect(() => {
    const q = nicheSearch.trim().toLowerCase();
    if (!q) {
      setSearchedCategoryList([]);
      setIsCategorySearching(false);
      return;
    }

    setIsCategorySearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/tags/search?q=${encodeURIComponent(q)}&type=niche`);
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : (data?.suggestions || data?.tags || data?.data || []);
          if (list.length > 0) {
            const formatted = list
              .map((t) => {
                const str = typeof t === "string" ? t : (t?.name || "");
                const cleanWord = cleanCategoryName(str);
                if (!cleanWord) return null;
                return {
                  name: cleanWord,
                  count: t?.count || 240 + ((cleanWord.charCodeAt(0) * 13) % 800),
                };
              })
              .filter(Boolean);

            const seen = new Set();
            const unique = formatted.filter((item) => {
              const key = item.name.toLowerCase();
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
            setSearchedCategoryList(unique);
          } else {
            setSearchedCategoryList([]);
          }
        }
      } catch {
        setSearchedCategoryList([]);
      } finally {
        setIsCategorySearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [nicheSearch]);

  const filteredNiches = useMemo(() => {
    const query = nicheSearch.trim().toLowerCase();
    if (query) {
      if (searchedCategoryList.length > 0) return searchedCategoryList;
      const pool = popularCategoryList.length > 0 ? popularCategoryList : SINGLE_WORD_PRESETS;
      return pool.filter((item) => item.name.toLowerCase().includes(query)).slice(0, 30);
    }
    const pool = popularCategoryList.length > 0 ? popularCategoryList : SINGLE_WORD_PRESETS;
    return pool;
  }, [nicheSearch, searchedCategoryList, popularCategoryList, SINGLE_WORD_PRESETS]);

  // Real City search: instant local indexing + debounced /api/locations/search
  useEffect(() => {
    const q = citySearch.trim().toLowerCase();
    if (!q) {
      const defaultMetros = [
        { name: "Mumbai", state: "Maharashtra", country: "India" },
        { name: "Delhi", state: "Delhi", country: "India" },
        { name: "Bengaluru", state: "Karnataka", country: "India" },
        { name: "Hyderabad", state: "Telangana", country: "India" },
        { name: "Ahmedabad", state: "Gujarat", country: "India" },
        { name: "Chennai", state: "Tamil Nadu", country: "India" },
        { name: "Kolkata", state: "West Bengal", country: "India" },
        { name: "Pune", state: "Maharashtra", country: "India" },
        { name: "Jaipur", state: "Rajasthan", country: "India" },
        { name: "Surat", state: "Gujarat", country: "India" },
        { name: "Lucknow", state: "Uttar Pradesh", country: "India" },
        { name: "Chandigarh", state: "Punjab", country: "India" },
        { name: "Indore", state: "Madhya Pradesh", country: "India" },
        { name: "Goa", state: "Goa", country: "India" },
        { name: "Kochi", state: "Kerala", country: "India" },
      ];
      setCitySuggestions(defaultMetros);
      return;
    }

    let localMatches = [];
    try {
      localMatches = searchLocations(q, 15) || [];
    } catch {
      localMatches = [];
    }
    setCitySuggestions(localMatches);

    const timer = setTimeout(async () => {
      try {
        setIsCitySearching(true);
        const res = await fetch(`/api/locations/search?q=${encodeURIComponent(q)}&limit=15`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const combined = [...localMatches];
            data.forEach((item) => {
              if (item && item.name && !combined.some((c) => c.name.toLowerCase() === item.name.toLowerCase())) {
                combined.push(item);
              }
            });
            setCitySuggestions(combined.slice(0, 20));
          }
        }
      } catch {
        // keep localMatches
      } finally {
        setIsCitySearching(false);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [citySearch]);

  // Actions & Toggles
  const handleNicheToggle = (nicheName) => {
    if (selectedCategories.includes(nicheName)) {
      setSelectedCategories((prev) => prev.filter((n) => n !== nicheName));
    } else {
      if (selectedCategories.length >= 3) {
        toast.warning("You can pick up to 3 niches.");
        return;
      }
      setSelectedCategories((prev) => [...prev, nicheName]);
    }
  };

  const handleCreateCustomNiche = (name) => {
    let clean = name.trim();
    if (!clean) return;
    clean = clean.split(/[\s\-_]+/)[0];
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    if (!clean) return;
    if (selectedCategories.length >= 3) {
      toast.warning("You can pick up to 3 niches.");
      return;
    }
    if (!selectedCategories.includes(clean)) {
      setSelectedCategories((prev) => [...prev, clean]);
    }
    setNicheSearch("");
  };

  const handlePlatformToggle = (platform) => {
    if (selectedPlatforms.includes(platform)) {
      if (selectedPlatforms.length <= 1) {
        toast.warning("At least one platform must remain selected.");
        return;
      }
      setSelectedPlatforms((prev) => prev.filter((p) => p !== platform));
    } else {
      setSelectedPlatforms((prev) => [...prev, platform]);
    }
  };

  const handleReachToggle = (tier) => {
    if (selectedFollowerRanges.includes(tier)) {
      if (selectedFollowerRanges.length <= 1) {
        toast.warning("At least one reach tier must remain selected.");
        return;
      }
      setSelectedFollowerRanges((prev) => prev.filter((t) => t !== tier));
    } else {
      setSelectedFollowerRanges((prev) => [...prev, tier]);
    }
  };

  const handleCityToggle = (city) => {
    if (selectedLocations.includes(city)) {
      setSelectedLocations((prev) => prev.filter((c) => c !== city));
    } else {
      if (selectedLocations.length >= 5) {
        toast.warning("Up to 5 focused cities allowed.");
        return;
      }
      setSelectedLocations((prev) => [...prev, city]);
    }
  };

  const handleLanguageToggle = (lang) => {
    if (selectedLanguages.includes(lang)) {
      if (selectedLanguages.length <= 1) {
        toast.warning("Please keep at least one content language.");
        return;
      }
      setSelectedLanguages((prev) => prev.filter((l) => l !== lang));
    } else {
      setSelectedLanguages((prev) => [...prev, lang]);
    }
  };

  const handleResetAdvanced = () => {
    setGender("Any");
    setSelectedLanguages(["Hindi", "English"]);
    setSelectedLocations([]);
    setCreatorsNeeded("5–15");
    setCustomCreatorsNeeded("10");
    const d = new Date();
    d.setDate(d.getDate() + 14);
    setDeadline(d.toISOString().split("T")[0]);
    toast.success("Advanced targeting reset to defaults.");
  };

  // Step 1 Validation
  const handleContinueStep1 = () => {
    if (!campaignTitle.trim()) {
      toast.error("Please enter a campaign title.");
      return;
    }
    if (requirementsText.trim().length < 15) {
      toast.error("Please enter a creative brief (minimum 15 characters).");
      return;
    }
    if (selectedCategories.length === 0) {
      toast.error("Please select at least 1 niche.");
      return;
    }
    setCurrentView("step2");
  };

  // Step 2 Validation -> Preview
  const handleContinueStep2 = () => {
    if (selectedPlatforms.length === 0) {
      toast.error("Please select at least one platform.");
      return;
    }
    if (selectedFollowerRanges.length === 0) {
      toast.error("Please select creator reach.");
      return;
    }
    if (collabMode === "Paid") {
      if (isBudgetRange) {
        if (!budgetMin || !budgetMax || Number(budgetMin) >= Number(budgetMax)) {
          toast.error("Min payout must be less than max payout.");
          return;
        }
      } else {
        if (!budget || Number(budget) <= 0) {
          toast.error("Please enter a valid payout.");
          return;
        }
      }
    } else {
      if (!barterDescription.trim()) {
        toast.error("Please describe what product/service you offer for barter.");
        return;
      }
    }
    if (!deliverablesText.trim()) {
      toast.error("Please specify creator deliverables.");
      return;
    }
    setCurrentView("review");
  };

  // Save / Publish logic connected directly to desktop endpoints
  const handleSaveCampaign = async (isDraftMode = false) => {
    if (!campaignTitle.trim()) {
      toast.error("Please provide a campaign title.");
      return;
    }

    // If publishing live without KYC approval, show the mobile KYC modal (Screen 07)
    if (!isDraftMode && !isKycApproved) {
      setShowKycModal(true);
      return;
    }

    try {
      setSubmitting(true);

      const parsedMaxCreators =
        creatorsNeeded === "Custom"
          ? parseInt(customCreatorsNeeded, 10) || 10
          : creatorsNeeded === "<5"
          ? 4
          : creatorsNeeded === "5–15"
          ? 15
          : creatorsNeeded === "15–25"
          ? 25
          : 50;

      const payload = {
        title: campaignTitle.trim(),
        description: requirementsText.trim() || "No description provided",
        collab_mode: collabMode,
        budget_min:
          collabMode === "Paid"
            ? isBudgetRange
              ? Number(budgetMin) || 1000
              : Number(budget) || 1000
            : 0,
        budget_max: collabMode === "Paid" && isBudgetRange ? Number(budgetMax) || null : null,
        deliverables: [deliverablesText.trim() || "1 Promo Reel"],
        deliverables_detailed: [
          {
            duration: "30-60 seconds",
            collab_type: "Collaborative",
            type: "Reel",
            content_type: "Promotional",
            script_type: "SLA",
          },
        ],
        categories: selectedCategories.length > 0 ? selectedCategories : ["Beauty & skincare"],
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : ["Instagram"],
        deadline: deadline || "2026-09-29",
        status: isDraftMode ? "draft" : "live",
        location_type: selectedLocations.length > 0 ? "Specific location" : "Pan India",
        specific_locations: selectedLocations,
        language_type: selectedLanguages.length > 0 ? "Select languages" : "Any language",
        languages: selectedLanguages,
        max_creators: parsedMaxCreators,
        brand_type: "Verified",
        follower_min: selectedFollowerRanges.includes("Nano") ? 4000 : 10000,
        follower_max: selectedFollowerRanges.includes("Celebrities") ? 1000000 : 500000,
        gender: gender === "Any" ? "Both" : gender,
        dos: "Include clear product close-up, maintain brand tone.",
        donts: "Do not post low lighting clips, avoid competitor mentions.",
        hashtags: `#CreatorCollab #${campaignTitle.split(" ")[0] || "Campaign"}`,
      };

      if (editId) {
        // No fallback to POST /campaigns: when the update failed (not allowed, validation, a
        // network blip) this silently created a SECOND campaign — a duplicate live listing —
        // and reported "updated". A failed update now shows its error (catch below).
        await api.post(`/campaigns/${editId}/update`, payload);
        toast.success(isDraftMode ? "Draft updated successfully!" : "Campaign updated and launched!");
      } else {
        const created = await api.post("campaigns", payload);
        const st = String(created?.data?.status || created?.data?.campaign?.status || created?.data?.data?.status || "").toLowerCase();
        setPublishedStatus(st);
        toast.success(isDraftMode ? "Draft saved successfully!" : st.includes("review") || st.includes("pending") ? "Campaign sent for review!" : "Campaign published successfully!");
      }

      if (!editId && !isDraftMode) {
        draftRemove("campaign_draft");
      }

      if (!isDraftMode) {
        // Show Screen 08 (Campaign Live)
        setCurrentView("published");
      } else {
        navigate("/brand/campaigns");
      }
    } catch (e) {
      toast.error(
        e?.response?.data?.detail ||
          e?.response?.data?.error ||
          e?.message ||
          "Failed to save campaign. Please check inputs."
      );
    } finally {
      setSubmitting(false);
    }
  };

  // Header back navigation handler
  const handleHeaderBack = () => {
    if (currentView === "step1") {
      if (campaignTitle.trim() || requirementsText.trim() || selectedCategories.length > 0) {
        const stateObj = {
          title: campaignTitle,
          campaignTitle,
          description: requirementsText,
          requirementsText,
          selectedCategories,
          selectedPlatforms,
          selectedFollowerRanges,
          collabMode,
          barterDescription,
          isBudgetRange,
          budget,
          budgetMin,
          budgetMax,
          deliverablesText,
          gender,
          selectedLanguages,
          selectedLocations,
          creatorsNeeded,
          customCreatorsNeeded,
          deadline,
          updatedAt: Date.now(),
        };
        try {
          draftSet("campaign_draft", JSON.stringify(stateObj));
        } catch (e) { ignored("MobileCampaignCreate:786", e); }
        toast.info("Draft auto-saved.");
      }
      navigate("/brand/campaigns");
    } else if (currentView === "step2") {
      setCurrentView("step1");
    } else if (currentView === "advanced") {
      setCurrentView("step2");
    } else if (currentView === "review") {
      setCurrentView("step2");
    } else if (currentView === "published") {
      navigate("/brand/campaigns");
    }
  };

  // -------------------------------------------------------------
  // RENDER: Screen 08 · Campaign Live
  // -------------------------------------------------------------
  if (currentView === "published") {
    const inReview = !publishedStatus || /review|pending|submitted/.test(publishedStatus);
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left pb-8">
        <div className="flex-1 px-5 pt-12 pb-6 flex flex-col">
          {/* Green checkmark circle */}
          <div className="w-[72px] h-[72px] rounded-[24px] bg-[#E9F9F1] border border-[#C3EBD7] flex items-center justify-center shrink-0">
            <Check size={34} className="text-[#047857] stroke-[2.4]" />
          </div>

          {/* Session 43 (Ravi): no made-up "142 creators reached" — the real state of the brief. */}
          <h2 className="mt-6 text-[26px] font-semibold leading-[1.25] tracking-[-0.9px] text-[#0A0A0A]">
            {inReview ? "Your brief is in review." : "Your brief is live."}
          </h2>
          <p className="mt-3 text-[14px] leading-[1.6] text-[#6B7280]">
            {inReview
              ? "Our team checks every brief before creators see it — usually within 2–3 hours. We'll notify you when it's live."
              : "Matching creators can see it in their feed now."}{" "}
            Applications land in your inbox — chat, negotiate and fund the payment from there.
          </p>

          {/* Published summary card */}
          <div className="mt-7 p-4 rounded-[16px] bg-white border border-[#E5E5EA] flex items-center gap-3">
            <BrandLogo src={brandProfile?.logo || user?.logo || user?.picture} name={brandName} size={42} radius={13} />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-[14px] text-[#0A0A0A] truncate">{campaignTitle}</div>
              <div className="mt-1 text-[11.5px] font-medium text-[#6B7280]">
                {previewPayoutDisplay} · {selectedPlatforms.join(", ")} · closes {formattedDeadlineDate}
              </div>
            </div>
            <div className={`px-2.5 py-1 rounded-[7px] border text-[9.5px] font-bold uppercase tracking-[0.5px] shrink-0 ${inReview ? "bg-[#FFFBEB] border-[#FDE68A] text-[#B45309]" : "bg-[#E9F9F1] border-[#C3EBD7] text-[#047857]"}`}>
              {inReview ? "In review" : "Live"}
            </div>
          </div>

          {/* Stats grid */}
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="text-[22px] font-semibold tracking-[-0.5px] text-[#0A0A0A]">0</div>
              <div className="mt-1 text-[11.5px] font-medium text-[#6B7280]">Applications</div>
            </div>
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className={`text-[16px] font-semibold tracking-[-0.3px] ${inReview ? "text-[#B45309]" : "text-[#047857]"}`}>{inReview ? "In review" : "Live"}</div>
              <div className="mt-1 text-[11.5px] font-medium text-[#6B7280]">{inReview ? "Goes live in ~2–3 hours" : "Visible to creators"}</div>
            </div>
          </div>

          {/* Bottom Action buttons */}
          <div className="mt-auto pt-8 flex flex-col gap-2.5">
            <button
              onClick={() => navigate("/creators")}
              className="h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer"
            >
              Invite creators to apply
            </button>
            <button
              onClick={() => navigate("/brand/campaigns")}
              className="h-[46px] rounded-[14px] bg-white border border-[#E5E5EA] text-[#3F3F46] font-semibold text-[14px] flex items-center justify-center transition-colors cursor-pointer"
            >
              Back to campaigns
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 04 · Advanced Targeting Expanded
  // -------------------------------------------------------------
  if (currentView === "advanced") {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
        {/* Sticky Header */}
        <div className="bg-white shrink-0 border-b border-[#ECECF0] pb-4 sticky top-0 z-20">
          <div className="h-[52px] px-5 flex items-center justify-between">
            <button
              onClick={() => setCurrentView("step2")}
              className="w-[34px] h-[34px] rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
            </button>
            <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">
              Advanced targeting
            </div>
            <button
              onClick={handleResetAdvanced}
              className="text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer"
            >
              Reset
            </button>
          </div>
          <div className="px-5 flex gap-1.5">
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 px-5 pt-4.5 pb-28 flex flex-col gap-4.5">
          {/* Creator Gender */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Creator gender</div>
            <div className="mt-2.5 h-[42px] rounded-[12px] bg-[#E9E9EF] p-[3px] flex gap-1">
              {["Any", "Female", "Male"].map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setGender(opt)}
                  className={`flex-1 rounded-[9px] text-[13px] flex items-center justify-center transition-all cursor-pointer ${
                    gender === opt
                      ? "bg-white font-semibold text-[#0A0A0A] shadow-[0_1px_3px_rgba(12,12,18,0.08)]"
                      : "font-medium text-[#6B7280]"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          {/* Content Languages */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Content languages
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {INDIAN_LANGUAGES.slice(0, 6).map((lang) => {
                const isSelected = selectedLanguages.includes(lang);
                return (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => handleLanguageToggle(lang)}
                    className={`px-3 py-2 rounded-[10px] text-[12px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F1E8FF] border border-[#DCC9FB] font-semibold text-[#6D28D9]"
                        : "bg-white border border-[#E5E5EA] font-medium text-[#3F3F46]"
                    }`}
                  >
                    {lang}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setShowLanguageSheet(true)}
                className="px-3 py-2 rounded-[10px] bg-white border border-[#E5E5EA] font-medium text-[12px] text-[#6B7280] cursor-pointer"
              >
                +{INDIAN_LANGUAGES.length - 6} more
              </button>
            </div>
          </div>

          {/* Cities */}
          <div>
            <div className="flex items-baseline justify-between">
              <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Cities</div>
              <div className="text-[10.5px] font-medium text-[#9CA3AF]">Empty = Pan India</div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {selectedLocations.map((city) => (
                <div
                  key={city}
                  className="px-3 py-2 rounded-[11px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9]"
                >
                  {city}
                  <button
                    type="button"
                    onClick={() => handleCityToggle(city)}
                    className="p-0.5 hover:opacity-75 cursor-pointer"
                  >
                    <X size={11} className="stroke-[2.6]" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setShowCitySheet(true)}
                className="px-3 py-2 rounded-[11px] bg-white border border-dashed border-[#D6D6DC] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B7280] cursor-pointer"
              >
                <Plus size={12} className="stroke-[2.2]" /> Add city
              </button>
            </div>
          </div>

          {/* Creators Needed */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Creators needed
            </div>
            <div className="mt-2.5 grid grid-cols-4 gap-2">
              {["<5", "5–15", "15–25", "Custom"].map((tier) => {
                const isSelected = creatorsNeeded === tier;
                return (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => setCreatorsNeeded(tier)}
                    className={`h-[42px] rounded-[12px] flex items-center justify-center text-[12.5px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F1E8FF] border-[1.5px] border-[#7C3AED] font-semibold text-[#6D28D9]"
                        : "bg-white border border-[#E5E5EA] font-medium text-[#3F3F46]"
                    }`}
                  >
                    {tier}
                  </button>
                );
              })}
            </div>
            {creatorsNeeded === "Custom" && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={customCreatorsNeeded}
                  onChange={(e) => setCustomCreatorsNeeded(e.target.value)}
                  placeholder="Number of creators (e.g. 20)"
                  className="h-[44px] flex-1 rounded-[12px] bg-white border border-[#E5E5EA] px-3 text-[14px] text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
                />
                <span className="text-[12px] text-[#6B7280]">creators</span>
              </div>
            )}
          </div>

          {/* Applications Close Date */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Applications close
            </div>
            <button
              type="button"
              onClick={() => {
                if (deadline) {
                  const parts = deadline.split("-");
                  if (parts.length === 3) {
                    setCalendarViewMonth(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
                  }
                }
                setShowDatePickerSheet(true);
              }}
              className="mt-2.5 w-full h-[52px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center gap-2.5 px-4 text-left cursor-pointer hover:border-[#7C3AED]/40 transition-colors"
            >
              <Calendar size={18} className="text-[#7C3AED] stroke-[1.9] shrink-0" />
              <div className="flex-1 text-[14px] font-semibold text-[#0A0A0A]">{formattedDeadlineDate}</div>
              <div className="text-[11.5px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                {deadlineDaysLeft}
              </div>
            </button>
          </div>
        </div>

        {/* Bottom Pinned Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#ECECF0] z-20">
          <button
            onClick={() => setCurrentView("step2")}
            className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer"
          >
            Apply targeting
          </button>
        </div>

        {/* City Sheet */}
        {renderCitySheet()}
        {/* Language Sheet */}
        {renderLanguageSheet()}
        {/* Date Picker Calendar Sheet */}
        {renderDatePickerSheet()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 05 & 06 · Review & Launch
  // -------------------------------------------------------------
  if (currentView === "review") {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
        {/* Header */}
        <div className="bg-white shrink-0 border-b border-[#ECECF0] pb-3.5 sticky top-0 z-20">
          <div className="h-[52px] px-5 flex items-center justify-between">
            <button
              onClick={() => setCurrentView("step2")}
              className="w-[34px] h-[34px] rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
            </button>
            <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">Review & launch</div>
            <button
              onClick={() => setCurrentView("step1")}
              className="text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer"
            >
              Edit
            </button>
          </div>

          {/* Segmented Switch: Feed card vs Full brief */}
          <div className="mx-5 h-[38px] rounded-[11px] bg-[#E9E9EF] p-[3px] flex gap-1">
            <button
              type="button"
              onClick={() => setReviewTab("card")}
              className={`flex-1 rounded-[8px] text-[12.5px] flex items-center justify-center transition-all cursor-pointer ${
                reviewTab === "card"
                  ? "bg-white font-semibold text-[#0A0A0A] shadow-[0_1px_3px_rgba(12,12,18,0.08)]"
                  : "font-medium text-[#6B7280]"
              }`}
            >
              Feed card
            </button>
            <button
              type="button"
              onClick={() => setReviewTab("full")}
              className={`flex-1 rounded-[8px] text-[12.5px] flex items-center justify-center transition-all cursor-pointer ${
                reviewTab === "full"
                  ? "bg-white font-semibold text-[#0A0A0A] shadow-[0_1px_3px_rgba(12,12,18,0.08)]"
                  : "font-medium text-[#6B7280]"
              }`}
            >
              Full brief
            </button>
          </div>
        </div>

        {/* Tab 1: Screen 05 Feed Card */}
        {reviewTab === "card" && (
          <div className="flex-1 px-5 pt-4 pb-28 flex flex-col gap-3">
            {/* Feed card preview */}
            <div className="p-4 rounded-[18px] bg-white border border-[#E5E5EA]">
              <div className="flex items-start gap-2.5">
                <BrandLogo src={brandProfile?.logo || user?.logo || user?.picture} name={brandName} size={44} radius={14} />
                <div className="flex-1 min-w-0">
                  <div className="text-[15px] font-semibold leading-[1.25] text-[#0A0A0A] truncate">{campaignTitle}</div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className="text-[11.5px] font-medium text-[#6B7280]">by {brandName}</span>
                    <CheckCircle2 size={12} className="text-[#059669] stroke-[2.4]" />
                  </div>
                </div>
                <div className="px-2 py-1 rounded-[7px] bg-[#FFF7E8] border border-[#F5E0B8] text-[9.5px] font-semibold uppercase tracking-[0.5px] text-[#B45309] shrink-0">
                  Draft
                </div>
              </div>

              <div className="mt-3.5 text-[10px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                Looking for
              </div>
              <div className="mt-1.5 text-[12.5px] leading-[1.55] text-[#3F3F46]">{previewRequirementsString}</div>

              {/* 4 stats grid */}
              <div className="mt-3.5 grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0]">
                  <div className="text-[9px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Payout</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">{previewPayoutDisplay}</div>
                </div>
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0]">
                  <div className="text-[9px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Platform</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">
                    {selectedPlatforms.join(", ")}
                  </div>
                </div>
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0]">
                  <div className="text-[9px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Location</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">
                    {selectedLocations.length > 0 ? selectedLocations.join(", ") : "Pan India"}
                  </div>
                </div>
                <div className="p-2.5 rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0]">
                  <div className="text-[9px] font-semibold tracking-[0.6px] uppercase text-[#6B7280]">Deliverables</div>
                  <div className="mt-1 text-[13px] font-semibold text-[#0A0A0A] truncate">{deliverablesText}</div>
                </div>
              </div>

              {/* Match box */}
              <div className="mt-3 p-3 rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0]">
                <div className="text-[12px] font-semibold text-[#0A0A0A]">Creators, it's a match</div>
                <div className="mt-1 text-[12px] leading-[1.5] text-[#6B7280] line-clamp-2">{requirementsText}</div>
              </div>

              {/* Footer */}
              <div className="mt-3.5 pt-3 border-t border-[#ECECF0] flex items-center justify-between">
                <div className="text-[11px] font-medium text-[#6B7280]">Applications close {formattedDeadlineDate}</div>
                <div className="text-[11px] font-semibold text-[#7C3AED]">{creatorsNeeded} creators</div>
              </div>
            </div>

            {/* Match Banner — Session 43: real matching creators (count + faces), never a made-up number */}
            <CreatorMatchStrip categories={selectedCategories} platforms={selectedPlatforms} />
          </div>
        )}

        {/* Tab 2: Screen 06 Full Brief */}
        {reviewTab === "full" && (
          <div className="flex-1 px-5 pt-4 pb-28 flex flex-col gap-3.5">
            {/* Actively reviewing status badge */}
            <div className="px-3 py-1.5 rounded-[9px] bg-[#E9F9F1] border border-[#C3EBD7] flex items-center gap-1.5 self-start">
              <CheckCircle2 size={12} className="text-[#047857] stroke-[2.4]" />
              <span className="text-[11.5px] font-semibold text-[#047857]">Actively reviewing</span>
            </div>

            <h2 className="text-[22px] font-semibold leading-[1.28] tracking-[-0.6px] text-[#0A0A0A]">
              {campaignTitle}
            </h2>
            <div className="text-[12.5px] font-medium text-[#6B7280]">Marketing Manager · {brandName}</div>

            {/* The brief */}
            <div>
              <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">The brief</div>
              <div className="mt-2 p-3.5 rounded-[14px] bg-white border border-[#E5E5EA] text-[13px] leading-[1.6] text-[#3F3F46]">
                {requirementsText}
              </div>
            </div>

            {/* Specs rows */}
            <div className="flex flex-col gap-2">
              <div className="p-3 px-3.5 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[#6B7280]">Deliverables</span>
                <span className="text-[13px] font-semibold text-[#0A0A0A]">{deliverablesText}</span>
              </div>
              <div className="p-3 px-3.5 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[#6B7280]">Reach tiers</span>
                <span className="text-[13px] font-semibold text-[#0A0A0A]">{selectedFollowerRanges.join(", ")}</span>
              </div>
              <div className="p-3 px-3.5 rounded-[13px] bg-white border border-[#E5E5EA] flex items-center justify-between">
                <span className="text-[12.5px] font-medium text-[#6B7280]">Languages</span>
                <span className="text-[13px] font-semibold text-[#0A0A0A]">{selectedLanguages.join(", ")}</span>
              </div>
            </div>

            {/* Budget shown to creators card */}
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="flex items-baseline justify-between pb-2.5 border-b border-[#ECECF0]">
                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                  Budget shown to creators
                </div>
                <div className="text-[15px] font-semibold text-[#7C3AED]">{previewPayoutDisplay}</div>
              </div>
              <div className="mt-2.5 flex items-center justify-between">
                <div className="text-[12.5px] font-medium text-[#6B7280]">Publishing this brief</div>
                <div className="px-2 py-0.5 rounded-[7px] bg-[#E9F9F1] border border-[#C3EBD7] text-[11px] font-semibold text-[#047857]">
                  Free · ₹0
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <div className="text-[12.5px] font-medium text-[#6B7280]">Secure payment hold funded</div>
                <div className="text-[12.5px] font-semibold text-[#0A0A0A]">Only on hiring</div>
              </div>
            </div>
          </div>
        )}

        {/* Pinned Bottom Actions */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#ECECF0] z-20 flex flex-col gap-2">
          <button
            onClick={() => handleSaveCampaign(false)}
            disabled={submitting}
            className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Publishing brief...
              </span>
            ) : (
              "Publish campaign"
            )}
          </button>
          {reviewTab === "card" && (
            <button
              onClick={() => handleSaveCampaign(true)}
              disabled={submitting}
              className="w-full h-[46px] rounded-[14px] bg-white border border-[#E5E5EA] text-[#3F3F46] font-semibold text-[14px] flex items-center justify-center transition-colors cursor-pointer"
            >
              Save as draft
            </button>
          )}
        </div>

        {/* Screen 07: KYC Blocks Publish Modal */}
        {renderKycModal()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 03 · Step 2 · Who & How Much
  // -------------------------------------------------------------
  if (currentView === "step2") {
    return (
      <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
        {/* Sticky Header */}
        <div className="bg-white shrink-0 border-b border-[#ECECF0] pb-4 sticky top-0 z-20">
          <div className="h-[52px] px-5 flex items-center justify-between">
            <button
              onClick={handleHeaderBack}
              className="w-[34px] h-[34px] rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
            >
              <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
            </button>
            <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">
              New campaign · 2 of 2
            </div>
            <button
              onClick={() => handleSaveCampaign(true)}
              className="text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer"
            >
              Save draft
            </button>
          </div>
          <div className="px-5 flex gap-1.5">
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
            <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
          </div>
        </div>

        {/* Form Body */}
        <div className="flex-1 px-5 pt-4 pb-28 flex flex-col gap-4">
          {/* Platforms */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Platforms</div>
            <div className="mt-2.5 grid grid-cols-2 gap-2.5">
              {/* Instagram card */}
              <button
                type="button"
                onClick={() => handlePlatformToggle("Instagram")}
                className={`p-3 rounded-[14px] bg-white text-left transition-all cursor-pointer ${
                  selectedPlatforms.includes("Instagram")
                    ? "border-[1.5px] border-[#7C3AED]"
                    : "border border-[#E5E5EA]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-[24px] h-[20px] flex items-center justify-start shrink-0">
                    <img
                      src="/assets/instagram.svg"
                      alt="Instagram"
                      className="w-[20px] h-[20px] object-contain block shrink-0"
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                  <div
                    className={`w-[17px] h-[17px] rounded-full flex items-center justify-center ${
                      selectedPlatforms.includes("Instagram")
                        ? "bg-[#7C3AED] text-white"
                        : "border-[1.5px] border-[#D6D6DC]"
                    }`}
                  >
                    {selectedPlatforms.includes("Instagram") && <Check size={10} className="stroke-[3.4]" />}
                  </div>
                </div>
                <div className="mt-2.5 text-[13.5px] font-semibold text-[#0A0A0A]">Instagram</div>
                <div className="mt-0.5 text-[11px] text-[#6B7280]">Reels, posts, stories</div>
              </button>

              {/* YouTube card */}
              <button
                type="button"
                onClick={() => handlePlatformToggle("YouTube")}
                className={`p-3 rounded-[14px] bg-white text-left transition-all cursor-pointer ${
                  selectedPlatforms.includes("YouTube")
                    ? "border-[1.5px] border-[#7C3AED]"
                    : "border border-[#E5E5EA]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="w-[24px] h-[20px] flex items-center justify-start shrink-0">
                    <img
                      src="/assets/youtube.svg"
                      alt="YouTube"
                      className={`w-[24px] h-[17px] object-contain block shrink-0 ${
                        !selectedPlatforms.includes("YouTube") ? "grayscale opacity-60" : ""
                      }`}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  </div>
                  <div
                    className={`w-[17px] h-[17px] rounded-full flex items-center justify-center ${
                      selectedPlatforms.includes("YouTube")
                        ? "bg-[#7C3AED] text-white"
                        : "border-[1.5px] border-[#D6D6DC]"
                    }`}
                  >
                    {selectedPlatforms.includes("YouTube") && <Check size={10} className="stroke-[3.4]" />}
                  </div>
                </div>
                <div className="mt-2.5 text-[13.5px] font-semibold text-[#0A0A0A]">YouTube</div>
                <div className="mt-0.5 text-[11px] text-[#6B7280]">Shorts, long reviews</div>
              </button>
            </div>
          </div>

          {/* Creator Reach */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Creator reach</div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {["Nano", "Micro", "Macro", "Mega", "Celebrities"].map((tierKey) => {
                const isSelected = selectedFollowerRanges.includes(tierKey);
                const item = followerRangesMap[tierKey];
                return (
                  <button
                    key={tierKey}
                    type="button"
                    onClick={() => handleReachToggle(tierKey)}
                    className={`px-3 py-2 rounded-[11px] text-[12.5px] transition-all cursor-pointer ${
                      isSelected
                        ? "bg-[#F1E8FF] border border-[#DCC9FB] font-semibold text-[#6D28D9]"
                        : "bg-white border border-[#E5E5EA] font-medium text-[#3F3F46]"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Paid / Barter Toggle — hidden until Barter ships (Phase 2) */}
          {draftWasBarter && (
            <div className="p-3 rounded-[12px] bg-[#FFFBEB] border border-[#FDE68A] text-[12px] leading-[1.4] font-medium text-[#92400E]">
              Barter campaigns are coming later. This draft is now a paid campaign — please set a budget.
            </div>
          )}
          {BARTER_OPEN && <div className="h-[40px] rounded-[12px] bg-[#E9E9EF] p-[3px] flex gap-1">
            <button
              type="button"
              onClick={() => setCollabMode("Paid")}
              className={`flex-1 rounded-[9px] text-[13px] flex items-center justify-center transition-all cursor-pointer ${
                collabMode === "Paid" ? "bg-[#7C3AED] font-semibold text-white" : "font-semibold text-[#6B7280]"
              }`}
            >
              Paid
            </button>
            <button
              type="button"
              onClick={() => setCollabMode("Barter")}
              className={`flex-1 rounded-[9px] text-[13px] flex items-center justify-center transition-all cursor-pointer ${
                collabMode === "Barter" ? "bg-[#7C3AED] font-semibold text-white" : "font-semibold text-[#6B7280]"
              }`}
            >
              Barter
            </button>
          </div>}

          {/* Payout Per Creator (if Paid) */}
          {collabMode === "Paid" ? (
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="flex items-center justify-between">
                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                  Payout per creator
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11.5px] font-medium text-[#6B7280]">Range</span>
                  <button
                    type="button"
                    onClick={() => setIsBudgetRange((prev) => !prev)}
                    className={`w-[34px] h-[20px] rounded-[10px] p-[2px] transition-colors flex cursor-pointer ${
                      isBudgetRange ? "bg-[#7C3AED] justify-end" : "bg-[#D6D6DC] justify-start"
                    }`}
                  >
                    <div className="w-[16px] h-[16px] rounded-full bg-white shadow-xs" />
                  </button>
                </div>
              </div>

              {isBudgetRange ? (
                <div className="mt-3 flex items-center gap-2.5">
                  <div className="flex-1 h-[48px] rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0] flex items-center gap-1.5 px-3">
                    <span className="text-[14px] font-medium text-[#9CA3AF]">₹</span>
                    <input
                      type="number"
                      value={budgetMin}
                      onChange={(e) => setBudgetMin(e.target.value)}
                      placeholder="8,000"
                      className="w-full bg-transparent text-[15px] font-semibold text-[#0A0A0A] outline-none"
                    />
                  </div>
                  <span className="text-[13px] font-medium text-[#9CA3AF]">to</span>
                  <div className="flex-1 h-[48px] rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0] flex items-center gap-1.5 px-3">
                    <span className="text-[14px] font-medium text-[#9CA3AF]">₹</span>
                    <input
                      type="number"
                      value={budgetMax}
                      onChange={(e) => setBudgetMax(e.target.value)}
                      placeholder="18,000"
                      className="w-full bg-transparent text-[15px] font-semibold text-[#0A0A0A] outline-none"
                    />
                  </div>
                </div>
              ) : (
                <div className="mt-3 h-[48px] rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0] flex items-center gap-1.5 px-3">
                  <span className="text-[14px] font-medium text-[#9CA3AF]">₹</span>
                  <input
                    type="number"
                    value={budget}
                    onChange={(e) => setBudget(e.target.value)}
                    placeholder="8,000"
                    className="w-full bg-transparent text-[15px] font-semibold text-[#0A0A0A] outline-none"
                  />
                </div>
              )}

              <div className="mt-2.5 text-[11.5px] leading-[1.4] text-[#6B7280]">
                You fund the payment only when you hire.
              </div>
            </div>
          ) : (
            <div className="p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
              <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                Barter product / service description
              </div>
              <textarea
                rows={2}
                value={barterDescription}
                onChange={(e) => setBarterDescription(e.target.value)}
                placeholder="Describe product worth, delivery timeframe, or gift box..."
                className="mt-2 w-full rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0] p-3 text-[13px] text-[#0A0A0A] outline-none focus:border-[#7C3AED]"
              />
            </div>
          )}

          {/* Deliverables */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Deliverables</div>
            <div className="mt-2.5 h-[48px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center px-4">
              <input
                type="text"
                value={deliverablesText}
                onChange={(e) => setDeliverablesText(e.target.value)}
                placeholder="e.g. 1 Reel (30s+) + 1 Story with link"
                className="w-full bg-transparent text-[14px] font-medium text-[#0A0A0A] outline-none"
              />
            </div>
          </div>

          {/* Applications Close Date */}
          <div>
            <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
              Applications close
            </div>
            <button
              type="button"
              onClick={() => {
                if (deadline) {
                  const parts = deadline.split("-");
                  if (parts.length === 3) {
                    setCalendarViewMonth(new Date(Number(parts[0]), Number(parts[1]) - 1, 1));
                  }
                }
                setShowDatePickerSheet(true);
              }}
              className="mt-2.5 w-full h-[52px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center gap-2.5 px-4 text-left cursor-pointer hover:border-[#7C3AED]/40 transition-colors"
            >
              <Calendar size={18} className="text-[#7C3AED] stroke-[1.9] shrink-0" />
              <div className="flex-1 text-[14px] font-semibold text-[#0A0A0A]">{formattedDeadlineDate}</div>
              <div className="text-[11.5px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                {deadlineDaysLeft}
              </div>
            </button>
          </div>

          {/* Advanced Targeting Trigger Row */}
          <button
            type="button"
            onClick={() => setCurrentView("advanced")}
            className="h-[54px] rounded-[14px] bg-white border border-[#E5E5EA] flex items-center gap-3 px-4 text-left transition-colors cursor-pointer hover:border-[#7C3AED]/40"
          >
            <SlidersHorizontal size={17} className="text-[#7C3AED] stroke-[1.9] shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold text-[#0A0A0A]">Advanced targeting</div>
              <div className="mt-0.5 text-[11px] text-[#6B7280] truncate">
                {gender} gender · {selectedLanguages.slice(0, 2).join(", ")} ·{" "}
                {selectedLocations.length > 0 ? selectedLocations.slice(0, 2).join(", ") : "Pan India"} ·{" "}
                {creatorsNeeded}
              </div>
            </div>
            <ChevronLeft size={15} className="text-[#9CA3AF] stroke-[2.2] rotate-180 shrink-0" />
          </button>
        </div>

        {/* Pinned Bottom Button */}
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#ECECF0] z-20">
          <button
            onClick={handleContinueStep2}
            className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Preview brief</span>
            <ArrowRight size={15} className="stroke-[2.2]" />
          </button>
        </div>

        {/* Date Picker Calendar Sheet */}
        {renderDatePickerSheet()}
      </div>
    );
  }

  // -------------------------------------------------------------
  // RENDER: Screen 01 · Step 1 · Brief + KYC Banner
  // -------------------------------------------------------------
  return (
    <div className="w-full min-h-screen bg-[#F2F2F7] flex flex-col font-['DM_Sans',sans-serif] text-left">
      {/* Sticky Header */}
      <div className="bg-white shrink-0 border-b border-[#ECECF0] pb-4 sticky top-0 z-20">
        <div className="h-[52px] px-5 flex items-center justify-between">
          <button
            onClick={handleHeaderBack}
            className="w-[34px] h-[34px] rounded-[11px] bg-white border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronLeft size={17} className="text-[#0A0A0A] stroke-[2.2]" />
          </button>
          <div className="text-[10.5px] font-semibold tracking-[0.9px] uppercase text-[#6B7280]">
            New campaign · 1 of 2
          </div>
          <button
            onClick={() => handleSaveCampaign(true)}
            className="text-[12.5px] font-medium text-[#7C3AED] hover:text-[#6D28D9] cursor-pointer"
          >
            Save draft
          </button>
        </div>
        <div className="px-5 flex gap-1.5">
          <div className="flex-1 h-[3px] rounded-[2px] bg-[#7C3AED]" />
          <div className="flex-1 h-[3px] rounded-[2px] bg-[#E5E5EA]" />
        </div>
      </div>

      {/* Form Content */}
      <div className="flex-1 px-5 pt-4 pb-28 flex flex-col">
        {/* KYC Pending Banner */}
        {!isKycApproved && (
          <div className="p-3 rounded-[12px] bg-[#FFF7E8] border border-[#F5E0B8] flex gap-3 items-start">
            <Shield size={17} className="text-[#B45309] stroke-[1.9] shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold leading-[1.3] text-[#7C2D12]">Business KYC pending</div>
              <div className="mt-1 text-[11.5px] leading-[1.45] text-[#92400E]">
                Write and save drafts freely. You'll need KYC only to publish.
              </div>
              <button
                type="button"
                onClick={() => setShowKycModal(true)}
                className="mt-2 text-[11.5px] font-semibold text-[#B45309] underline hover:opacity-80 cursor-pointer block"
              >
                Verify business KYC
              </button>
            </div>
          </div>
        )}

        <h2 className="mt-5 text-[23px] font-semibold leading-[1.28] tracking-[-0.7px] text-[#0A0A0A]">
          What are you hiring creators for?
        </h2>

        {/* Campaign Title */}
        <div className="mt-5.5 text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
          Campaign title
        </div>
        <div className="mt-2.5 h-[52px] rounded-[14px] bg-white border-[1.5px] border-[#7C3AED] flex items-center px-4">
          <input
            type="text"
            value={campaignTitle}
            onChange={(e) => setCampaignTitle(e.target.value)}
            placeholder="Monsoon serum reel push"
            className="w-full bg-transparent text-[15px] font-medium text-[#0A0A0A] outline-none placeholder:text-[#9CA3AF]"
          />
        </div>

        {/* Creative Brief */}
        <div className="mt-4.5 flex items-baseline justify-between">
          <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Creative brief</div>
          <div className="text-[10.5px] font-medium text-[#9CA3AF]">{requirementsText.length} / 800</div>
        </div>
        <div className="mt-2.5 p-3.5 rounded-[14px] bg-white border border-[#E5E5EA]">
          <textarea
            rows={4}
            maxLength={800}
            value={requirementsText}
            onChange={(e) => setRequirementsText(e.target.value)}
            placeholder="Launching a niacinamide serum for humid weather. Need a morning-routine reel showing texture and the no-stickiness claim, ending with the discount code."
            className="w-full bg-transparent text-[13px] leading-[1.55] text-[#3F3F46] outline-none resize-none placeholder:text-[#9CA3AF]"
          />
        </div>

        {/* Niche */}
        <div className="mt-4.5 flex items-baseline justify-between">
          <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">Niche</div>
          <div className="text-[10.5px] font-medium text-[#9CA3AF]">{selectedCategories.length} of 3</div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-2">
          {selectedCategories.map((cat) => (
            <div
              key={cat}
              className="px-3 py-2 rounded-[11px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9]"
            >
              {cat}
              <button
                type="button"
                onClick={() => handleNicheToggle(cat)}
                className="p-0.5 hover:opacity-75 cursor-pointer"
              >
                <X size={11} className="stroke-[2.6]" />
              </button>
            </div>
          ))}
          {selectedCategories.length < 3 && (
            <button
              type="button"
              onClick={() => setShowNicheSheet(true)}
              className="px-3 py-2 rounded-[11px] bg-white border border-dashed border-[#D6D6DC] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6B7280] cursor-pointer"
            >
              <Plus size={12} className="stroke-[2.2]" /> Add niche
            </button>
          )}
        </div>
      </div>

      {/* Pinned Bottom Button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-[#ECECF0] z-20">
        <button
          onClick={handleContinueStep1}
          className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <span>Continue</span>
          <ArrowRight size={15} className="stroke-[2.2]" />
        </button>
      </div>

      {/* Screen 02: Niche Picker Sheet */}
      {renderNicheSheet()}

      {/* Screen 07: KYC Blocks Publish Modal */}
      {renderKycModal()}
    </div>
  );

  // -------------------------------------------------------------
  // HELPER MODALS & BOTTOM SHEETS
  // -------------------------------------------------------------

  // Screen 02: Niche Picker Sheet (Bottom Sheet - Single-Word Categories)
  function renderNicheSheet() {
    return (
      <AnimatePresence>
        {showNicheSheet && (
          <div className="fixed inset-0 z-50 flex items-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNicheSheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[85vh] bg-white rounded-t-[26px] p-5 pb-7 flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              {/* Drag Handle */}
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-4" />

              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">Pick your niche</div>
                  <div className="text-[11.5px] font-medium text-[#6B7280]">Select up to 3 core categories</div>
                </div>
                <div className="text-[12px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                  {selectedCategories.length} / 3
                </div>
              </div>

              {/* Search Bar */}
              <div className="mt-3.5 h-[52px] min-h-[52px] rounded-[16px] bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3 px-4 focus-within:border-[#7C3AED] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#7C3AED]/10 transition-all shadow-xs">
                <Search size={18} className="text-[#7C3AED] stroke-[2.2] shrink-0" />
                <input
                  type="text"
                  value={nicheSearch}
                  onChange={(e) => setNicheSearch(e.target.value)}
                  placeholder="Search category (e.g. Fashion, Self-care, Tech)..."
                  className="w-full bg-transparent text-[15px] font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                />
                {isCategorySearching && <Loader2 size={16} className="animate-spin text-[#7C3AED] shrink-0" />}
                {nicheSearch && !isCategorySearching && (
                  <button
                    type="button"
                    onClick={() => setNicheSearch("")}
                    className="w-[24px] h-[24px] rounded-full bg-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] shrink-0 cursor-pointer transition-colors"
                  >
                    <X size={13} className="stroke-[2.5]" />
                  </button>
                )}
              </div>

              {/* Selected Niches */}
              {selectedCategories.length > 0 && (
                <div className="mt-3.5">
                  <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                    Selected ({selectedCategories.length}/3)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedCategories.map((cat) => (
                      <div
                        key={cat}
                        className="px-3 py-1.5 rounded-[10px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9] shadow-xs"
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => handleNicheToggle(cat)}
                          className="p-0.5 hover:opacity-75 cursor-pointer"
                        >
                          <X size={11} className="stroke-[2.6]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Matching Niches */}
              <div className="mt-3.5 flex-1 overflow-y-auto min-h-0 pr-1">
                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280] mb-2">
                  {nicheSearch.trim() ? "Search results" : "Popular categories"}
                </div>
                <div className="flex flex-col gap-2">
                  {filteredNiches.map((item) => {
                    const isSelected = selectedCategories.includes(item.name);
                    return (
                      <button
                        key={item.name}
                        type="button"
                        onClick={() => handleNicheToggle(item.name)}
                        className={`h-[48px] rounded-[13px] border px-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#F1E8FF] border-[#7C3AED] shadow-xs"
                            : "bg-[#F9F9FB] border-[#ECECF0] hover:bg-slate-100"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`text-[14px] ${
                              isSelected ? "font-bold text-[#6D28D9]" : "font-medium text-[#0A0A0A]"
                            }`}
                          >
                            {item.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11.5px] font-medium text-[#6B7280]">
                            {item.count.toLocaleString()} creators
                          </span>
                          <div
                            className={`w-[18px] h-[18px] rounded-full flex items-center justify-center ${
                              isSelected ? "bg-[#7C3AED] text-white" : "border border-[#D1D5DB]"
                            }`}
                          >
                            {isSelected && <Check size={11} className="stroke-[3]" />}
                          </div>
                        </div>
                      </button>
                    );
                  })}

                  {/* Create custom niche option if search typed */}
                  {nicheSearch.trim() &&
                    !selectedCategories.map((c) => c.toLowerCase()).includes(nicheSearch.trim().toLowerCase()) && (
                      <button
                        type="button"
                        onClick={() => handleCreateCustomNiche(nicheSearch)}
                        className="h-[48px] rounded-[13px] bg-[#F9F9FB] border border-dashed border-[#7C3AED]/50 flex items-center gap-2 px-3.5 cursor-pointer hover:bg-[#F1E8FF]/40 transition-colors"
                      >
                        <Plus size={14} className="text-[#7C3AED] stroke-[2.2]" />
                        <span className="text-[13.5px] font-semibold text-[#7C3AED]">
                          Add "{nicheSearch.trim().split(/[\s\-_]+/)[0]}" as category
                        </span>
                      </button>
                    )}
                </div>
              </div>

              {/* Done Button */}
              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNicheSheet(false)}
                  className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-[#7C3AED]/20"
                >
                  Done · {selectedCategories.length} selected
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // City Picker Bottom Sheet (Roomy, Airy & Connected to Real Search API)
  function renderCitySheet() {
    return (
      <AnimatePresence>
        {showCitySheet && (
          <div className="fixed inset-0 z-50 flex items-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCitySheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[85vh] bg-white rounded-t-[26px] p-5 pb-7 flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              {/* Drag Handle */}
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-4" />

              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">Target locations</div>
                  <div className="text-[11.5px] font-medium text-[#6B7280]">
                    Select specific cities or keep empty for Pan India
                  </div>
                </div>
                <div className="text-[12px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[8px]">
                  {selectedLocations.length > 0 ? `${selectedLocations.length}/5` : "Pan India"}
                </div>
              </div>

              {/* Search Bar */}
              <div className="mt-3.5 h-[52px] min-h-[52px] rounded-[16px] bg-[#F8FAFC] border border-[#E2E8F0] flex items-center gap-3 px-4 focus-within:border-[#7C3AED] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#7C3AED]/10 transition-all shadow-xs">
                <Search size={18} className="text-[#7C3AED] stroke-[2.2] shrink-0" />
                <input
                  type="text"
                  value={citySearch}
                  onChange={(e) => setCitySearch(e.target.value)}
                  placeholder="Search city or state (e.g. Mumbai, Bangalore, Delhi)..."
                  className="w-full bg-transparent text-[15px] font-medium text-[#0F172A] outline-none placeholder:text-[#94A3B8]"
                />
                {isCitySearching && <Loader2 size={16} className="animate-spin text-[#7C3AED] shrink-0" />}
                {citySearch && !isCitySearching && (
                  <button
                    type="button"
                    onClick={() => setCitySearch("")}
                    className="w-[24px] h-[24px] rounded-full bg-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#0F172A] shrink-0 cursor-pointer transition-colors"
                  >
                    <X size={13} className="stroke-[2.5]" />
                  </button>
                )}
              </div>

              {/* Selected Cities */}
              {selectedLocations.length > 0 && (
                <div className="mt-3.5">
                  <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280]">
                    Selected cities ({selectedLocations.length}/5)
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedLocations.map((loc) => (
                      <div
                        key={loc}
                        className="px-3 py-1.5 rounded-[10px] bg-[#F1E8FF] border border-[#DCC9FB] flex items-center gap-1.5 text-[12.5px] font-semibold text-[#6D28D9] shadow-xs"
                      >
                        <MapPin size={11} className="stroke-[2.4]" />
                        <span>{loc}</span>
                        <button
                          type="button"
                          onClick={() => handleCityToggle(loc)}
                          className="p-0.5 hover:opacity-75 cursor-pointer ml-0.5"
                        >
                          <X size={11} className="stroke-[2.6]" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* City List (Spacious / Open layout) */}
              <div className="mt-3.5 flex-1 overflow-y-auto min-h-0 pr-1">
                {/* Pan India Fast Option */}
                {!citySearch.trim() && (
                  <button
                    type="button"
                    onClick={() => setSelectedLocations([])}
                    className={`w-full min-h-[58px] rounded-[16px] p-3.5 mb-2.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                      selectedLocations.length === 0
                        ? "bg-[#F5F0FF] border-[1.5px] border-[#7C3AED] shadow-xs"
                        : "bg-[#F9F9FB] border border-[#E5E5EA] hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0 ${
                          selectedLocations.length === 0
                            ? "bg-[#7C3AED] text-white"
                            : "bg-white text-[#7C3AED] border border-[#E5E5EA]"
                        }`}
                      >
                        <Lightbulb size={17} strokeWidth={2.2} />
                      </div>
                      <div>
                        <div
                          className={`text-[14.5px] ${
                            selectedLocations.length === 0
                              ? "font-bold text-[#6D28D9]"
                              : "font-semibold text-[#0A0A0A]"
                          }`}
                        >
                          Pan India (All Cities)
                        </div>
                        <div className="text-[11.5px] text-[#6B7280]">
                          Creators from all across India can apply
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ml-2 ${
                        selectedLocations.length === 0
                          ? "bg-[#7C3AED] text-white"
                          : "border-[1.5px] border-[#D6D6DC]"
                      }`}
                    >
                      {selectedLocations.length === 0 && <Check size={13} className="stroke-[3]" />}
                    </div>
                  </button>
                )}

                <div className="text-[10.5px] font-semibold tracking-[0.7px] uppercase text-[#6B7280] mb-2">
                  {citySearch.trim() ? "Matching locations" : "Popular Indian cities"}
                </div>

                <div className="flex flex-col gap-2.5">
                  {citySuggestions.map((item, idx) => {
                    const isSelected = selectedLocations.includes(item.name);
                    return (
                      <button
                        key={`${item.name}-${idx}`}
                        type="button"
                        onClick={() => handleCityToggle(item.name)}
                        className={`w-full min-h-[58px] rounded-[16px] p-3.5 flex items-center justify-between text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-[#F5F0FF] border-[1.5px] border-[#7C3AED] shadow-xs"
                            : "bg-[#F9F9FB] border border-[#E5E5EA] hover:bg-slate-100 hover:border-[#D6D6DC]"
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-[38px] h-[38px] rounded-[12px] flex items-center justify-center shrink-0 ${
                              isSelected
                                ? "bg-[#7C3AED] text-white"
                                : "bg-white text-[#7C3AED] border border-[#E5E5EA]"
                            }`}
                          >
                            <MapPin size={17} strokeWidth={2.2} />
                          </div>
                          <div className="min-w-0">
                            <div
                              className={`text-[14.5px] ${
                                isSelected ? "font-bold text-[#6D28D9]" : "font-semibold text-[#0A0A0A]"
                              } truncate`}
                            >
                              {item.name}
                            </div>
                            <div className="text-[11.5px] text-[#6B7280] truncate mt-0.5">
                              {item.state ? `${item.state}, India` : item.country || "India"}
                            </div>
                          </div>
                        </div>
                        <div
                          className={`w-[22px] h-[22px] rounded-full flex items-center justify-center shrink-0 ml-2 ${
                            isSelected ? "bg-[#7C3AED] text-white" : "border-[1.5px] border-[#D6D6DC]"
                          }`}
                        >
                          {isSelected && <Check size={13} className="stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Done Button */}
              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCitySheet(false)}
                  className="w-full h-[52px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-[#7C3AED]/20"
                >
                  {selectedLocations.length > 0
                    ? `Done · ${selectedLocations.length} selected`
                    : "Done · Pan India selected"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Applications Close Date: Desktop-like Calendar Bottom Sheet
  function renderDatePickerSheet() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const year = calendarViewMonth.getFullYear();
    const month = calendarViewMonth.getMonth();

    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const currentMonthLabel = `${monthNames[month]} ${year}`;

    // Days in current month
    const totalDays = new Date(year, month + 1, 0).getDate();
    // Starting day of week (0: Sun, 1: Mon, etc.)
    const firstDayIndex = new Date(year, month, 1).getDay();

    const isPrevDisabled =
      year < today.getFullYear() || (year === today.getFullYear() && month <= today.getMonth());

    const handlePrevMonth = () => {
      if (isPrevDisabled) return;
      setCalendarViewMonth(new Date(year, month - 1, 1));
    };

    const handleNextMonth = () => {
      setCalendarViewMonth(new Date(year, month + 1, 1));
    };

    const handleSelectDay = (day) => {
      const targetDate = new Date(year, month, day);
      if (targetDate < today) return;
      const yStr = targetDate.getFullYear();
      const mStr = String(targetDate.getMonth() + 1).padStart(2, "0");
      const dStr = String(targetDate.getDate()).padStart(2, "0");
      setDeadline(`${yStr}-${mStr}-${dStr}`);
    };

    const handlePreset = (daysToAdd) => {
      const target = new Date();
      target.setDate(target.getDate() + daysToAdd);
      const yStr = target.getFullYear();
      const mStr = String(target.getMonth() + 1).padStart(2, "0");
      const dStr = String(target.getDate()).padStart(2, "0");
      setDeadline(`${yStr}-${mStr}-${dStr}`);
      setCalendarViewMonth(new Date(yStr, target.getMonth(), 1));
    };

    // Parse current deadline
    let selectedYear = null;
    let selectedMonth = null;
    let selectedDay = null;
    if (deadline) {
      const parts = deadline.split("-");
      if (parts.length === 3) {
        selectedYear = Number(parts[0]);
        selectedMonth = Number(parts[1]) - 1;
        selectedDay = Number(parts[2]);
      }
    }

    return (
      <AnimatePresence>
        {showDatePickerSheet && (
          <div className="fixed inset-0 z-50 flex items-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDatePickerSheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[90vh] bg-white rounded-t-[26px] p-5 pb-8 flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              {/* Drag Handle */}
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-3.5" />

              <div className="flex items-center justify-between pb-3 border-b border-[#ECECF0]">
                <div>
                  <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">
                    Applications close date
                  </div>
                  <div className="text-[12px] font-medium text-[#6B7280]">
                    Select the deadline for creators to apply
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowDatePickerSheet(false)}
                  className="w-[32px] h-[32px] rounded-full bg-[#F2F2F7] flex items-center justify-center text-[#6B7280] hover:text-[#0A0A0A] cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="mt-3.5 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {[
                  { label: "1 Week", days: 7 },
                  { label: "2 Weeks", days: 14 },
                  { label: "3 Weeks", days: 21 },
                  { label: "1 Month", days: 30 },
                  { label: "45 Days", days: 45 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => handlePreset(preset.days)}
                    className="px-3 py-1.5 rounded-[10px] bg-[#F2F2F7] hover:bg-[#E9E9EF] text-[12px] font-semibold text-[#3F3F46] shrink-0 cursor-pointer active:scale-95 transition-all"
                  >
                    +{preset.label}
                  </button>
                ))}
              </div>

              {/* Month Navigation */}
              <div className="mt-3.5 flex items-center justify-between px-1">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  disabled={isPrevDisabled}
                  className="w-[36px] h-[36px] rounded-[11px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                >
                  <ChevronLeft size={18} className="text-[#0A0A0A]" />
                </button>
                <div className="text-[15px] font-bold text-[#0A0A0A]">{currentMonthLabel}</div>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="w-[36px] h-[36px] rounded-[11px] bg-[#F9F9FB] border border-[#E5E5EA] flex items-center justify-center cursor-pointer transition-colors"
                >
                  <ChevronRight size={18} className="text-[#0A0A0A]" />
                </button>
              </div>

              {/* Weekdays Header */}
              <div className="mt-3 grid grid-cols-7 gap-1 text-center">
                {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((dayName) => (
                  <div key={dayName} className="text-[11px] font-bold text-[#9CA3AF] uppercase py-1">
                    {dayName}
                  </div>
                ))}
              </div>

              {/* Day Grid */}
              <div className="mt-1 grid grid-cols-7 gap-1 text-center">
                {Array.from({ length: firstDayIndex }).map((_, i) => (
                  <div key={`empty-${i}`} className="h-[40px]" />
                ))}

                {Array.from({ length: totalDays }).map((_, i) => {
                  const day = i + 1;
                  const dateObj = new Date(year, month, day);
                  const isPast = dateObj < today;
                  const isToday =
                    dateObj.getFullYear() === today.getFullYear() &&
                    dateObj.getMonth() === today.getMonth() &&
                    dateObj.getDate() === today.getDate();
                  const isSelected =
                    selectedYear === year && selectedMonth === month && selectedDay === day;

                  return (
                    <button
                      key={`day-${day}`}
                      type="button"
                      disabled={isPast}
                      onClick={() => handleSelectDay(day)}
                      className={`h-[40px] rounded-[12px] text-[13.5px] flex items-center justify-center transition-all cursor-pointer ${
                        isSelected
                          ? "bg-[#7C3AED] text-white font-bold shadow-md shadow-[#7C3AED]/30 scale-105"
                          : isToday
                          ? "border border-[#7C3AED] text-[#7C3AED] font-bold bg-[#F5F0FF]"
                          : isPast
                          ? "text-[#D1D5DB] cursor-not-allowed"
                          : "text-[#0A0A0A] font-medium hover:bg-[#F2F2F7] active:scale-95"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              {/* Selected date preview */}
              <div className="mt-4 p-3 rounded-[13px] bg-[#F9F9FB] border border-[#ECECF0] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={16} className="text-[#7C3AED]" />
                  <span className="text-[13px] font-semibold text-[#0A0A0A]">
                    {formattedDeadlineDate}
                  </span>
                </div>
                <span className="text-[11.5px] font-semibold text-[#7C3AED] bg-[#F1E8FF] px-2.5 py-1 rounded-[7px]">
                  {deadlineDaysLeft}
                </span>
              </div>

              {/* Confirm Button */}
              <div className="mt-4">
                <button
                  type="button"
                  onClick={() => setShowDatePickerSheet(false)}
                  className="w-full h-[50px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer shadow-md shadow-[#7C3AED]/20"
                >
                  Set close date
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Language Sheet
  function renderLanguageSheet() {
    return (
      <AnimatePresence>
        {showLanguageSheet && (
          <div className="fixed inset-0 z-50 flex items-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLanguageSheet(false)}
              className="fixed inset-0 bg-[#0C0C12]/40 backdrop-blur-xs"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 320 }}
              className="relative w-full max-h-[75vh] bg-white rounded-t-[26px] p-5 pb-7 flex flex-col z-10 shadow-[0_-18px_44px_-24px_rgba(12,12,18,0.4)] text-left"
            >
              <div className="w-[38px] h-[4px] rounded-[2px] bg-[#E0E0E6] mx-auto mb-4" />
              <div className="text-[17px] font-semibold tracking-[-0.3px] text-[#0A0A0A]">Select content languages</div>

              <div className="mt-4 flex-1 overflow-y-auto min-h-0 pr-1 flex flex-col gap-2">
                {INDIAN_LANGUAGES.map((lang) => {
                  const isSelected = selectedLanguages.includes(lang);
                  return (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => handleLanguageToggle(lang)}
                      className={`h-[44px] rounded-[12px] border px-3.5 flex items-center justify-between text-left transition-colors cursor-pointer ${
                        isSelected ? "bg-[#F1E8FF] border-[#DCC9FB]" : "bg-[#F9F9FB] border-[#ECECF0]"
                      }`}
                    >
                      <span
                        className={`text-[14px] ${isSelected ? "font-semibold text-[#6D28D9]" : "font-medium text-[#0A0A0A]"}`}
                      >
                        {lang}
                      </span>
                      {isSelected && <Check size={14} className="text-[#6D28D9] stroke-[2.5]" />}
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLanguageSheet(false)}
                  className="w-full h-[50px] rounded-[14px] bg-[#7C3AED] text-white font-semibold text-[15px] flex items-center justify-center cursor-pointer"
                >
                  Done · {selectedLanguages.length} selected
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }

  // Screen 07: KYC Blocks Publish Modal
  function renderKycModal() {
    return (
      <AnimatePresence>
        {showKycModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-5">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowKycModal(false)}
              className="fixed inset-0 bg-[#0C0C12]/45 backdrop-blur-xs"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-sm bg-white rounded-[22px] p-6 z-10 shadow-[0_26px_60px_-28px_rgba(12,12,18,0.55)] text-left"
            >
              {/* Shield Icon in amber box */}
              <div className="w-[52px] h-[52px] rounded-[17px] bg-[#FFF7E8] border border-[#F5E0B8] flex items-center justify-center">
                <Shield size={24} className="text-[#B45309] stroke-[1.9]" />
              </div>

              <h3 className="mt-4 text-[20px] font-semibold leading-[1.3] tracking-[-0.5px] text-[#0A0A0A]">
                Verify your business to publish
              </h3>
              <p className="mt-2 text-[13px] leading-[1.6] text-[#6B7280]">
                Creators only see briefs from KYC-verified brands — that's what keeps secure payment hold and payouts safe.
                Verification usually clears within a day.
              </p>

              {/* Requirement Checklist */}
              <div className="mt-4 p-3 rounded-[12px] bg-[#F9F9FB] border border-[#ECECF0] flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5">
                  <Check size={14} className="text-[#047857] stroke-[2.6]" />
                  <span className="text-[12.5px] font-medium text-[#3F3F46]">GST or company PAN</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check size={14} className="text-[#047857] stroke-[2.6]" />
                  <span className="text-[12.5px] font-medium text-[#3F3F46]">Bank account for secure payment hold</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Check size={14} className="text-[#047857] stroke-[2.6]" />
                  <span className="text-[12.5px] font-medium text-[#3F3F46]">Signatory ID proof</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex flex-col gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setShowKycModal(false);
                    navigate("/brand/kyc");
                  }}
                  className="h-[50px] rounded-[14px] bg-[#7C3AED] hover:bg-[#6D28D9] text-white font-semibold text-[15px] flex items-center justify-center transition-colors cursor-pointer"
                >
                  Start KYC · 3 min
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setShowKycModal(false);
                    await handleSaveCampaign(true);
                  }}
                  className="h-[46px] rounded-[14px] bg-[#F2F2F7] text-[#3F3F46] font-semibold text-[14px] flex items-center justify-center transition-colors cursor-pointer hover:bg-slate-200"
                >
                  Save draft instead
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    );
  }
}
