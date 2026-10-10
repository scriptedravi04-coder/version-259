import React, { useState, useEffect, useRef } from 'react';
import DeleteAccountPanel from "./DeleteAccountPanel";
import { formatAmount, safeLower } from "../../utils/safeFormat";
import { AlertTriangle, Ban, AlertOctagon, RotateCcw, ArrowLeft, Send, Check, User, Shield, Activity, FileText, CheckCircle2, XCircle, LogIn, Briefcase, Handshake, ShieldAlert, Clock, Copy, KeyRound, CreditCard, QrCode, Building2, ExternalLink, Eye, EyeOff, Download, ShieldCheck, DollarSign, Wallet, RefreshCw, AlertCircle, ChevronRight, X, Home, Lightbulb, Trash2, Sparkles } from 'lucide-react';
import LiveGroundedAuditCard from './LiveGroundedAuditCard';
import QuickAuditModal from './QuickAuditModal';
import { api } from '../../lib/api';
import { mediaHref } from '../../lib/mediaUrl';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
export const SUB_ADMIN_MODULES = [
  { key: 'manage_users', label: 'Users', desc: 'Creators, brands, agencies, and unclaimed directory management' },
  { key: 'manage_waitlist', label: 'Waitlist', desc: 'Waitlist review, applications, and user invite queue' },
  { key: 'manage_kyc', label: 'KYC Checks', desc: 'Identity verification & user KYC document approvals' },
  { key: 'manage_campaigns', label: 'Approve Campaigns', desc: 'Review, approve, and manage brand campaigns' },
  { key: 'manage_chat', label: 'Chat Moderation', desc: 'Live chat monitoring and conversation moderation' },
  { key: 'manage_disputes', label: 'System Reports', desc: 'Disputes, report logs, fraud flags, and violations' },
  { key: 'manage_escrow', label: 'Escrowable Payments', desc: 'Wallet secure payment hold ledgers, balance holds, and payouts' },
  { key: 'manage_ugc', label: 'UGC Orders', desc: 'Track and oversee live UGC orders and deliverables' },
  { key: 'manage_logs', label: 'Active Logs', desc: 'System activity logs and administrative audit trail' },
  { key: 'manage_blog', label: 'Blogs and Content', desc: 'Create, publish, and edit blog posts & articles' },
  { key: 'manage_helpdesk', label: 'Help Desks', desc: 'Manage support tickets and customer help desk' },
  { key: 'manage_settings', label: 'Platform Settings', desc: 'Platform configuration, banners, and tool controls' },
];

export default function UserEnforcementPanel({ user: initialUser, onBack, onUserUpdate, homePicks, toggleHomePick, homePickBusy }) {
  const { user: currentUser, refreshUser } = useAuth();
  const isFullAdmin = currentUser?.role === 'admin' && currentUser?.team_role !== 'sub_admin';
  
  // Navigation tabs: 'profile' | 'kyc' | 'payouts' | 'enforcement' | 'message' | 'permissions'
  const [activeTab, setActiveTab] = useState('profile');
  const [activeEnforcementStage, setActiveEnforcementStage] = useState('warning');
  
  const [warningTemplate, setWarningTemplate] = useState('');
  const [warningNote, setWarningNote] = useState('');
  const [warningTemplates, setWarningTemplates] = useState([]);
  const [suspendDuration, setSuspendDuration] = useState('7');
  const [suspendReason, setSuspendReason] = useState('');
  const [banConfirmText, setBanConfirmText] = useState('');
  const [deleteOtp, setDeleteOtp] = useState('');
  
  const [violations, setViolations] = useState([]);
  const [fullData, setFullData] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);

  // Hidden 5-click Password Reveal States
  const [revealedPassword, setRevealedPassword] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const secretClickCountRef = useRef(0);
  const secretClickTimerRef = useRef(null);

  // Document Viewer & KYC Quick Actions
  const [previewDoc, setPreviewDoc] = useState(null);
  const [showBankAcc, setShowBankAcc] = useState(false);
  const [copiedField, setCopiedField] = useState(null);
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [submittingKycAction, setSubmittingKycAction] = useState(false);

  const handleResetPassword = async () => {
    if (!isFullAdmin) return;
    // Session 24: strong random temporary password (was 6 chars from Math.random). Shown to the
    // admin once, here, right after the reset — the server never stores or returns passwords.
    const bytes = (window.crypto || window.msCrypto).getRandomValues(new window.Uint8Array(12));
    const newPassword = `Ybex@${Array.from(bytes, (b) => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[b % 56]).join("")}`;
    if (!window.confirm(`Are you sure you want to reset this admin's password?`)) return;
    try {
      const res = await api.post(`/admin/users/${user.user_id || user.id}/set-password`, { password: newPassword });
      toast.success("Password reset successfully!");
      setRevealedPassword(true);
      
      const updatedUser = { ...user, plain_password: newPassword };
      setFullData(prev => ({
        ...prev,
        user: updatedUser
      }));
    } catch (e) {
      toast.error(e?.response?.data?.detail || e?.response?.data?.error || "Failed to reset password");
    }
  };

  const handleSecretPasswordTrigger = () => {
    if (!isFullAdmin) return;
    secretClickCountRef.current += 1;
    
    if (secretClickCountRef.current >= 5) {
      secretClickCountRef.current = 0;
      setRevealedPassword(true);
      const targetPass = user.plain_password || null; // only a password you just reset
      if (targetPass) {
        toast.success(`Password: ${targetPass}`, {
          duration: 8000,
          action: {
            label: 'Copy',
            onClick: () => {
              navigator.clipboard.writeText(targetPass);
              toast.success("Password copied!");
            }
          }
        });
      } else if (user.password_hash) {
        toast.info("Password is encrypted with Bcrypt", { duration: 5000 });
      } else {
        toast.info("No password set for this user", { duration: 5000 });
      }
      return;
    }

    if (secretClickTimerRef.current) clearTimeout(secretClickTimerRef.current);
    secretClickTimerRef.current = setTimeout(() => {
      secretClickCountRef.current = 0;
    }, 2500);
  };

  const handleCopy = (textToCopy, fieldName) => {
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopiedField(fieldName);
    toast.success(`${fieldName} copied to clipboard!`);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Custom Message tab states
  const [customMsg, setCustomMsg] = useState('');
  const [selectedChannels, setSelectedChannels] = useState({
     in_app: true,
     whatsapp: false,
     sms: false,
     email: false
  });
  const [sendingMsg, setSendingMsg] = useState(false);

  const handleSendCustomMessage = async () => {
     if (!customMsg.trim()) {
        toast.error("Please enter a message to send");
        return;
     }
     
     const activeChannels = Object.keys(selectedChannels).filter(k => selectedChannels[k]);
     if (activeChannels.length === 0) {
        toast.error("Please select at least one delivery channel");
        return;
     }

     setSendingMsg(true);
     try {
        await api.post("/admin/notifications/send", {
           subtype: "general",
           message: customMsg,
           target_type: "user",
           target_user_id: user.user_id,
           channels: activeChannels
        });
        
        toast.success("Notification successfully dispatched!");
        setCustomMsg("");
     } catch (e) {
        console.error(e);
        toast.error(e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Failed to send message");
     } finally {
        setSendingMsg(false);
     }
  };

  // For Permissions
  const [teamRole, setTeamRole] = useState('');
  const [permissions, setPermissions] = useState({
    manage_users: false,
    manage_waitlist: false,
    manage_kyc: false,
    manage_campaigns: false,
    manage_chat: false,
    manage_disputes: false,
    manage_escrow: false,
    manage_ugc: false,
    manage_logs: false,
    manage_blog: false,
    manage_helpdesk: false,
    manage_settings: false,
    view_analytics: false
  });
  
  const user = fullData?.user || initialUser;
  const [showQuickAudit, setShowQuickAudit] = useState(false);
  const [localHomePickBusy, setLocalHomePickBusy] = useState(false);
  const [localHomePick, setLocalHomePick] = useState(undefined);

  const targetUid = user.user_id || user.id;
  const isOnCreatorHome = localHomePick !== undefined
    ? localHomePick
    : (homePicks && homePicks[targetUid] !== undefined
        ? homePicks[targetUid]
        : Boolean(fullData?.profile?.show_on_creator_home || user?.creator_profile?.show_on_creator_home));

  const handleToggleHome = async () => {
    const nextVal = !isOnCreatorHome;
    setLocalHomePickBusy(true);
    try {
      if (toggleHomePick) {
        await toggleHomePick(targetUid, nextVal);
      } else {
        await api.post(`admin/creators/${targetUid}/home-pick`, { on: nextVal });
        toast.success(nextVal ? "Shown on the creator home" : "Removed from the creator home");
      }
      setLocalHomePick(nextVal);
      if (onUserUpdate) onUserUpdate();
    } catch (e) {
      toast.error(e?.response?.data?.error || "Could not save home pick");
    } finally {
      setLocalHomePickBusy(false);
    }
  };

  useEffect(() => {
    fetchViolations();
    fetchFullProfile();
    fetchTimeline();
  }, [initialUser.user_id]);

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await api.get("/admin/templates?subtype=warning");
        setWarningTemplates(res.data || []);
      } catch (err) {
        console.error("Failed to load warning templates:", err);
      }
    };
    fetchTemplates();
  }, []);

  const handleSendWarning = async () => {
    if (!warningTemplate && !warningNote.trim()) {
       toast.error("Please select a template or enter a custom note");
       return;
    }
    try {
       await api.post("/admin/enforcement/warning", {
          target_user_id: user.user_id,
          template_id: warningTemplate || undefined,
          custom_note: warningNote || undefined,
          channels: ["in_app", "email"]
       });
       toast.success("Action applied successfully");
       setWarningTemplate('');
       setWarningNote('');
       fetchViolations();
       fetchFullProfile();
       if (onUserUpdate) onUserUpdate();
    } catch (e) {
       console.error(e);
       toast.error(e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Failed to apply action");
    }
  };

  const fetchTimeline = async () => {
    try {
      const res = await api.get(`/admin/users/${initialUser.user_id}/timeline`);
      setTimeline(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchViolations = async () => {
    try {
      const res = await api.get(`/admin/users/${initialUser.user_id}/violations`);
      setViolations(res.data);
    } catch (e) { console.error(e); }
  };

  const fetchFullProfile = async () => {
    try {
      const res = await api.get(`/admin/users/${initialUser.user_id}/full_profile`);
      setFullData(res.data);
      
      const loadedUser = res.data.user || initialUser;
      setTeamRole(loadedUser.team_role || (loadedUser.role === 'admin' ? 'admin' : ''));
      
      if (loadedUser.permissions && loadedUser.permissions.length > 0) {
         const pMap = {...permissions};
         loadedUser.permissions.forEach(p => {
           if (typeof p === 'string') {
             pMap[p] = true;
           } else if (p && typeof p === 'object') {
             const key = p.permission_key || p.key;
             if (key) {
               pMap[key] = p.allowed === true || p.allowed === 1 || p.allowed === 'true';
             }
           }
         });
         setPermissions(pMap);
      }
    } catch (e) {
      console.error(e);
      toast.error(e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Could not load full profile");
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (endpoint, payload) => {
     try {
        await api.post(`/admin/users/${user.user_id}/${endpoint}`, payload);
        toast.success(`Action applied successfully`);
        fetchViolations();
        fetchFullProfile();
        if (onUserUpdate) onUserUpdate();
     } catch (e) {
        toast.error(e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Failed to apply action");
     }
  };

  const handleKycDecision = async (decision, reason = '') => {
    setSubmittingKycAction(true);
    try {
      await api.post(`/admin/users/${user.user_id}/kyc-action`, {
        decision,
        reason: reason || undefined
      });
      toast.success(`KYC status successfully updated to ${decision}!`);
      setRejectModalOpen(false);
      setRejectReason('');
      await fetchFullProfile();
      if (onUserUpdate) onUserUpdate();
    } catch (err) {
      console.error("KYC action error:", err);
      toast.error(err?.response?.data?.error || err?.response?.data?.detail || "Failed to update KYC status");
    } finally {
      setSubmittingKycAction(false);
    }
  };

  const savePermissions = async () => {
     try {
       await api.post(`/admin/users/${user.user_id}/team_role`, { team_role: teamRole });
       if (teamRole === 'sub_admin') {
         const pArray = Object.keys(permissions).map(k => ({ permission_key: k, allowed: permissions[k] }));
         await api.post(`/admin/users/${user.user_id}/permissions`, { permissions: pArray });
       }
       toast.success(teamRole === 'admin' ? "Saved — now a Super Admin" : teamRole === 'sub_admin' ? "Saved — now a Sub-Admin" : "Saved — admin access removed");
       // Session 40: read the saved role back so the dropdown shows what the server stored.
       try { await fetchFullProfile(); } catch (e) { /* the list refresh below still runs */ }
       if (user.user_id === currentUser?.user_id && refreshUser) {
         await refreshUser();
       }
       if (onUserUpdate) onUserUpdate();
     } catch (e) {
       toast.error(e?.response?.data?.error || e?.response?.data?.detail || e?.message || "Failed to save permissions");
     }
  };

  // Helper to normalize KYC status check
  const isTargetAdmin = user.role === 'admin' || user.team_role === 'sub_admin' || user.team_role === 'admin' || user.role === 'sub_admin';
  const kyc = fullData?.kyc;
  const paymentDetails = fullData?.payment_details;
  const paymentSummary = fullData?.payment_summary || { total_earned: 0, total_paid_out: 0, pending_payout: 0, completed_deals_count: 0 };
  const escrowTransactions = fullData?.escrow_transactions || [];
  
  const rawKycStatus = (kyc?.status || (user.kyc_verified || user.verified ? 'APPROVED' : 'NOT_SUBMITTED')).toUpperCase();
  const isKycApproved = rawKycStatus === 'APPROVED' || user.kyc_verified === true || user.verified === true;
  const isKycPending = rawKycStatus === 'PENDING' && !isKycApproved;
  const isKycRejected = rawKycStatus === 'REJECTED';

  // Session 40: these four lines used to read themselves (`const panDocUrl = panDocUrl || …`),
  // which throws as soon as the panel renders. Server-signed links come first; every KYC file opens
  // through /api/media so an old 7-day upload link can't leave the preview blank.
  const docLink = (u) => (u ? mediaHref(u) : null);
  const panDocUrl = docLink(kyc?.pan_card_url || kyc?.pan_photo_url || kyc?.documents?.pan_photo_url || kyc?.documents?.pan_card_url || kyc?.documents?.brand_pan_url || kyc?.documents?.uploaded_files?.[0] || kyc?.doc_url || null);
  const aadhaarFrontUrl = docLink(kyc?.aadhaar_front_url || kyc?.documents?.aadhaar_front_url || kyc?.documents?.uploaded_files?.[1] || null);
  const aadhaarBackUrl = docLink(kyc?.aadhaar_back_url || kyc?.documents?.aadhaar_back_url || kyc?.documents?.uploaded_files?.[2] || null);
  const upiQrCodeUrl = docLink(kyc?.upi_qr_code_url || kyc?.documents?.upi_qr_code_url || kyc?.documents?.uploaded_files?.[3] || paymentDetails?.upi_qr_code_url || null);
  const gstDocUrl = docLink(kyc?.gst_certificate_url || kyc?.gst_doc_url || kyc?.documents?.gst_cert_url || kyc?.documents?.gst_certificate_url || null);
  const incDocUrl = docLink(kyc?.incorporation_doc_url || kyc?.business_proof_document_url || kyc?.documents?.business_proof_document_url || kyc?.documents?.incorporation_proof || kyc?.documents?.incorporation_doc_url || kyc?.doc_url || null);
  const effectivePanNumber = kyc?.pan_number || kyc?.documents?.creator_pan || kyc?.documents?.identity_num || kyc?.documents?.brand_pan || kyc?.documents?.pan_number || '';

  const profile = fullData?.profile || {};
  const isCreatorRole = user.role === 'creator' || Boolean(profile?.instagram_handle || profile?.followers);
  const auditTarget = {
    target_type: isCreatorRole ? 'creator' : 'brand',
    id: user.user_id || user.id,
    user_id: user.user_id || user.id,
    name: user.name || kyc?.full_name || profile?.company_name || kyc?.company_name || 'User',
    handle: profile?.instagram_handle || profile?.handle || profile?.social_handle || profile?.website || user.website || '',
    company_name: profile?.company_name || kyc?.company_name || (!isCreatorRole ? user.name : ''),
    website: profile?.website || user.website || kyc?.website || '',
    pan_name: kyc?.full_name || user.name,
    pan_number: effectivePanNumber || kyc?.pan_number || '',
    aadhaar_number: kyc?.aadhaar_number || '',
    bank_acc: paymentDetails?.bank_account_no || kyc?.bank_account_number || '',
    bank_ifsc: paymentDetails?.ifsc_code || kyc?.ifsc_code || '',
    gstin: kyc?.gst_number || kyc?.gstin || profile?.gstin || '',
    cin: profile?.cin || kyc?.cin || '',
    platform: profile?.platform || profile?.primary_platform || 'Instagram',
    category: profile?.category || profile?.primary_niche || profile?.niche || profile?.industry || '',
    follower_count: profile?.followers_instagram || profile?.followers || user.followers || '',
    avg_reach: profile?.avg_reach || profile?.avg_views || '',
    state: profile?.state || profile?.city || user.state || user.location || ''
  };

  // 1. Overview Tab
  const renderProfile = () => {
    if (!fullData) return null;
    const { profile, applications, deals } = fullData;
    
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Basic Details Card */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
               <User size={18} className="text-[#A855F7]" /> Basic Account Information
             </h3>
             <div className="flex items-center gap-2">
               {isTargetAdmin && isFullAdmin && (
                 <button 
                   onClick={handleResetPassword}
                   className="px-3 py-1.5 mr-2 bg-white text-gray-700 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                 >
                   Reset Password
                 </button>
               )}
               {isTargetAdmin ? (
                 <span className="px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-xs">
                   <Shield size={13} className="text-purple-600" /> {user.team_role === 'sub_admin' ? 'Sub-Admin (Staff)' : 'Super Admin (Full Access)'}
                 </span>
               ) : isKycApproved ? (
                 <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-xs">
                   <CheckCircle2 size={13} className="text-emerald-600" /> KYC Verified
                 </span>
               ) : isKycPending ? (
                 <span className="px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-extrabold flex items-center gap-1.5 shadow-xs">
                   <Clock size={13} className="text-amber-600" /> KYC Pending
                 </span>
               ) : (
                 <span className="px-3 py-1 bg-gray-100 text-gray-600 border border-gray-200 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-xs">
                   <FileText size={13} className="text-gray-400" /> No KYC
                 </span>
               )}
             </div>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <div>
                 <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Email Address</div>
                 <div className="font-semibold text-gray-900">{user.email || profile?.email || profile?.contact_email || '—'}</div>
              </div>
              <div>
                 <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Joined Date</div>
                 <div className="font-semibold text-gray-900">{user.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
              </div>
              <div>
                 <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Account Role</div>
                 <div className="font-semibold text-gray-900 capitalize flex items-center gap-2">
                   {user.role}
                   {(user.is_agency || profile?.is_agency) && (
                     <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-300 font-extrabold uppercase tracking-wider">
                       Agency
                     </span>
                   )}
                 </div>
              </div>

              {profile && profile.company_name ? (
                 <div onClick={handleSecretPasswordTrigger} className="cursor-pointer select-none">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Company / Agency Name</div>
                    <div className="font-semibold text-gray-900">{profile.company_name}</div>
                 </div>
              ) : (
                 <div onClick={handleSecretPasswordTrigger} className="cursor-pointer select-none">
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Full Legal Name</div>
                    <div className="font-semibold text-gray-900">{user.name || '—'}</div>
                 </div>
              )}

              {user.phone && (
                 <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Contact Mobile</div>
                    <div className="font-semibold text-gray-900">{user.phone}</div>
                 </div>
              )}

              {profile && profile.city && (
                 <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Location</div>
                    <div className="font-semibold text-gray-900">{profile.city}{profile.state ? `, ${profile.state}` : ''}</div>
                 </div>
              )}

              {(() => {
                const rawIg = profile.instagram_handle || profile.instagram || '';
                const rawYt = profile.youtube || profile.youtube_url || '';
                const links = [];

                const addLink = (urlOrHandle, defaultType) => {
                  if (!urlOrHandle || typeof urlOrHandle !== 'string') return;
                  const clean = urlOrHandle.trim();
                  if (!clean) return;
                  const lower = clean.toLowerCase();
                  const isYt = lower.includes('youtube.com') || lower.includes('youtu.be');
                  const isIg = lower.includes('instagram.com') || lower.includes('instagr.am');
                  const type = isYt ? 'youtube' : (isIg ? 'instagram' : defaultType);
                  
                  let href = clean;
                  let display = clean;
                  if (type === 'instagram') {
                    const handleOnly = clean.replace(/^(https?:\/\/)?(www\.)?instagram\.com\//i, '').replace(/@/g, '').replace(/\/.*$/, '');
                    href = `https://instagram.com/${handleOnly}`;
                    display = `@${handleOnly}`;
                  } else if (type === 'youtube') {
                    href = clean.startsWith('http') ? clean : `https://${clean}`;
                    display = clean.replace(/^(https?:\/\/)?(www\.)?youtube\.com\//i, '');
                  }

                  if (!links.some(l => l.href === href || l.display === display)) {
                    links.push({ type, href, display });
                  }
                };

                addLink(rawIg, 'instagram');
                addLink(rawYt, 'youtube');

                return links.map((l, i) => (
                  <div key={i}>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                      {l.type === 'youtube' ? 'YouTube Channel' : 'Instagram Profile'}
                    </div>
                    <a 
                      href={l.href} 
                      target="_blank" 
                      rel="noreferrer" 
                      className={`font-semibold hover:underline flex items-center gap-1 ${l.type === 'youtube' ? 'text-red-600' : 'text-[#A855F7]'}`}
                    >
                      {l.display}
                      {l.type === 'instagram' && (
                        <span className="text-gray-500 text-xs no-underline font-normal">
                          ({Number(profile.followers_instagram || profile.followers || profile.follower_count || 0).toLocaleString()} fans)
                        </span>
                      )}
                    </a>
                  </div>
                ));
              })()}



              {profile && profile.primary_niche && (
                 <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Primary Niche</div>
                    <div className="font-semibold text-gray-900">{profile.primary_niche}</div>
                 </div>
              )}

              {revealedPassword && (
                <div className="col-span-full bg-purple-50 border border-purple-200/80 rounded-2xl p-3.5 flex items-center justify-between animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold text-purple-900 uppercase tracking-wider">Password:</span>
                    <span className="font-mono text-xs font-bold text-gray-900 bg-white px-2.5 py-1 rounded-lg border border-purple-100 select-all">
                      {user.plain_password || '•••••••• (encrypted — reset to set a new one)'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {user.plain_password && (
                      <button
                        type="button"
                        onClick={() => handleCopy(user.plain_password, 'Password')}
                        className="p-1.5 hover:bg-purple-100 rounded-lg text-purple-700 transition-colors cursor-pointer"
                        title="Copy password"
                      >
                        {copiedPass ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setRevealedPassword(false)}
                      className="text-xs font-extrabold text-purple-600 hover:text-purple-900 px-2 py-1 rounded-lg hover:bg-purple-100 transition-colors cursor-pointer"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
           </div>
        </div>

        {!isTargetAdmin && (
          <>
            {/* KYC Status & Highlights Card */}
            <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
               <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                    <FileText size={18} className="text-[#A855F7]" /> KYC & Identity Verification
                  </h3>
                  <button 
                    onClick={() => setActiveTab('kyc')}
                    className="text-xs font-extrabold text-[#A855F7] hover:text-[#9333EA] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    View Documents & Details <ChevronRight size={14} />
                  </button>
               </div>
           
           {kyc ? (
             <div className="space-y-4">
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
                  <div>
                     <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Status</div>
                     <div className="font-extrabold">
                       {isKycApproved ? (
                         <span className="text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={15}/> Verified (Approved)</span>
                       ) : isKycRejected ? (
                         <span className="text-red-600 flex items-center gap-1.5"><XCircle size={15}/> Rejected</span>
                       ) : (
                         <span className="text-amber-600 flex items-center gap-1.5"><Clock size={15}/> Pending Verification</span>
                       )}
                     </div>
                  </div>
                  <div>
                     <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Verified Name</div>
                     <div className="font-semibold text-gray-900 truncate">{kyc.full_name || kyc.company_name || user.name || '—'}</div>
                  </div>
                  <div>
                     <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">PAN Number</div>
                     <div className="font-mono font-semibold text-gray-900">{kyc.pan_number || '—'}</div>
                  </div>
                  <div>
                     <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">{user.role === 'brand' ? 'GSTIN' : 'Aadhaar / Tax ID'}</div>
                     <div className="font-mono font-semibold text-gray-900">{kyc.gst_number || kyc.aadhaar_number || '—'}</div>
                  </div>
               </div>

               {/* Quick KYC documents bar */}
               <div className="flex flex-wrap items-center gap-3 pt-1">
                 {panDocUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'PAN Card Document', url: panDocUrl })}
                     className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 text-purple-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> PAN Card Document
                   </button>
                 )}
                 {aadhaarFrontUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'Aadhaar Card (Front)', url: aadhaarFrontUrl })}
                     className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> Aadhaar Front
                   </button>
                 )}
                 {aadhaarBackUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'Aadhaar Card (Back)', url: aadhaarBackUrl })}
                     className="px-3.5 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> Aadhaar Back
                   </button>
                 )}
                 {upiQrCodeUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                     className="px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <QrCode size={14} /> UPI QR Code
                   </button>
                 )}
                 {gstDocUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'GST Certificate', url: gstDocUrl })}
                     className="px-3.5 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <FileText size={14} /> GST Certificate
                   </button>
                 )}
                 {incDocUrl && (
                   <button 
                     onClick={() => setPreviewDoc({ title: 'Business Proof', url: incDocUrl })}
                     className="px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer"
                   >
                     <Building2 size={14} /> Business Proof
                   </button>
                 )}
               </div>
             </div>
           ) : (
             <div className="p-4 rounded-2xl bg-gray-50 border border-gray-100 text-gray-500 text-sm font-medium flex items-center justify-between">
               <span>No official KYC documents have been submitted yet.</span>
               <button onClick={() => setActiveTab('kyc')} className="text-xs font-bold text-[#A855F7] hover:underline">
                 Open KYC Tab
               </button>
             </div>
           )}
        </div>

        {/* Linked Payout & Financial Highlights Card */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
                <Wallet size={18} className="text-[#A855F7]" /> Linked Payment & Escrow Payouts
              </h3>
              <button 
                onClick={() => setActiveTab('payouts')}
                className="text-xs font-extrabold text-[#A855F7] hover:text-[#9333EA] hover:underline flex items-center gap-1 cursor-pointer"
              >
                View Payout Ledger ({escrowTransactions.length}) <ChevronRight size={14} />
              </button>
           </div>

           <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-100">
                 <div className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider">Total Volume / Earned</div>
                 <div className="text-2xl font-black text-gray-900 mt-1">₹{Number(paymentSummary.total_earned || 0).toLocaleString()}</div>
                 <div className="text-[11px] font-semibold text-gray-500 mt-0.5">{paymentSummary.completed_deals_count || 0} completed orders</div>
              </div>
              <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
                 <div className="text-[11px] font-extrabold text-emerald-700 uppercase tracking-wider">Total Paid Out</div>
                 <div className="text-2xl font-black text-emerald-700 mt-1">₹{Number(paymentSummary.total_paid_out || 0).toLocaleString()}</div>
                 <div className="text-[11px] font-semibold text-emerald-600 mt-0.5">Direct to Bank / UPI</div>
              </div>
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100">
                 <div className="text-[11px] font-extrabold text-amber-700 uppercase tracking-wider">In Escrow / Pending</div>
                 <div className="text-2xl font-black text-amber-700 mt-1">₹{Number(paymentSummary.pending_payout || 0).toLocaleString()}</div>
                 <div className="text-[11px] font-semibold text-amber-600 mt-0.5">Awaiting release</div>
              </div>
           </div>

           {paymentDetails?.upi_id || paymentDetails?.bank_account_no ? (
             <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-2xl bg-gray-50 border border-gray-100">
               {paymentDetails.upi_id && (
                 <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200/80">
                   <div>
                     <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">UPI ID</div>
                     <div className="font-mono text-sm font-bold text-gray-900">{paymentDetails.upi_id}</div>
                   </div>
                   <button 
                     onClick={() => handleCopy(paymentDetails.upi_id, 'UPI ID')} 
                     className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                     title="Copy UPI ID"
                   >
                     {copiedField === 'UPI ID' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                   </button>
                 </div>
               )}

               {paymentDetails.bank_account_no && (
                 <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200/80">
                   <div>
                     <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Bank Account ({paymentDetails.bank_ifsc || 'IFSC'})</div>
                     <div className="font-mono text-sm font-bold text-gray-900">
                       {showBankAcc ? paymentDetails.bank_account_no : `••••••••${paymentDetails.bank_account_no.slice(-4)}`}
                     </div>
                   </div>
                   <div className="flex items-center gap-1">
                     <button 
                       onClick={() => setShowBankAcc(!showBankAcc)} 
                       className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                       title={showBankAcc ? "Hide account number" : "Show account number"}
                     >
                       {showBankAcc ? <EyeOff size={16} /> : <Eye size={16} />}
                     </button>
                     <button 
                       onClick={() => handleCopy(paymentDetails.bank_account_no, 'Bank Account')} 
                       className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                       title="Copy Account Number"
                     >
                       {copiedField === 'Bank Account' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                     </button>
                   </div>
                 </div>
               )}
             </div>
           ) : (
             <div className="p-3 text-xs font-semibold text-gray-400 italic">No payout account linked yet.</div>
           )}
        </div>

        {/* Deals & Collabs */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2">
             <Briefcase size={18} className="text-[#A855F7]" /> Deals & Collaborations
           </h3>
           
           {deals && deals.length > 0 ? (
              <div className="space-y-2">
                 {deals.map(d => (
                    <div key={d.id || d.deal_id || Math.random()} className="flex justify-between items-center text-sm p-3.5 bg-gray-50 rounded-2xl border border-gray-100">
                       <div>
                         <span className="font-bold text-gray-900">{d.campaigns?.title || d.title || 'Brand Deal'}</span>
                         {d.total_amount && <span className="text-xs text-gray-500 font-bold ml-2">₹{Number(d.total_amount).toLocaleString()}</span>}
                       </div>
                       <span className={`text-[11px] font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                         d.status === 'completed' || d.status === 'delivered' ? 'bg-green-100 text-green-700' :
                         d.status === 'active' || d.status === 'in_progress' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                       }`}>
                         {d.status}
                       </span>
                    </div>
                 ))}
              </div>
           ) : <div className="text-xs text-gray-400 font-semibold italic p-2">No active deals found.</div>}
        </div>
          </>
        )}

        {/* Activity Timeline */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2"><Clock size={18} className="text-[#A855F7]" /> Visual Activity Timeline</h3>
           
           <div className="space-y-0 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 before:to-transparent">
              {timeline && timeline.length > 0 ? timeline.map((evt, idx) => {
                 let Icon = LogIn;
                 let iconBg = 'bg-gray-100';
                 let iconColor = 'text-gray-500';
                 let label = 'Logged In';
                 let desc = '';
                 
                 if (evt.event_type === 'campaign_applied') {
                    Icon = Briefcase;
                    iconBg = 'bg-purple-100';
                    iconColor = 'text-purple-600';
                    label = 'Applied to Campaign';
                    desc = evt.detail || '';
                 } else if (evt.event_type === 'deal_created') {
                    Icon = Handshake;
                    if (evt.detail && safeLower(evt.detail).includes('completed')) {
                        iconBg = 'bg-green-100';
                        iconColor = 'text-green-600';
                    } else {
                        iconBg = 'bg-indigo-100';
                        iconColor = 'text-indigo-600';
                    }
                    label = 'Deal Created';
                    desc = evt.detail || '';
                 } else if (evt.event_type === 'blocked_contact_attempt') {
                    Icon = ShieldAlert;
                    iconBg = 'bg-red-100';
                    iconColor = 'text-red-600';
                    label = 'Blocked Contact Attempt';
                    desc = evt.detail || '';
                 }

                 return (
                    <div key={idx} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active py-3">
                       <div className={`flex items-center justify-center w-10 h-10 rounded-full border-4 border-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm z-10 ${iconBg} ${iconColor}`}>
                          <Icon size={16} />
                       </div>
                       <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
                          <div className="flex items-center justify-between space-x-2 mb-1">
                             <div className="font-extrabold text-sm text-gray-900">{label}</div>
                             <div className="text-xs font-bold text-gray-400 group-hover:text-[#A855F7] transition-colors" title={new Date(evt.event_at).toLocaleString()}>
                                {formatDistanceToNow(new Date(evt.event_at), { addSuffix: true })}
                             </div>
                          </div>
                          {desc && <div className="text-xs font-medium text-gray-600 mt-1">{desc}</div>}
                       </div>
                    </div>
                 );
              }) : (
                 <div className="text-sm font-semibold text-gray-400 italic text-center py-4">No timeline activity found.</div>
              )}
           </div>
        </div>
      </div>
    );
  };

  // 2. KYC & Verification Tab
  const renderKycTab = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* KYC Status Header Card */}
        <div className={`border rounded-3xl p-6 shadow-sm ${
          isKycApproved ? 'bg-emerald-50/50 border-emerald-200' :
          isKycRejected ? 'bg-red-50/50 border-red-200' :
          isKycPending ? 'bg-amber-50/50 border-amber-200' : 'bg-gray-50 border-gray-200'
        }`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div className={`p-3 rounded-2xl ${
                isKycApproved ? 'bg-emerald-500 text-white' :
                isKycRejected ? 'bg-red-500 text-white' :
                isKycPending ? 'bg-amber-500 text-white' : 'bg-gray-300 text-gray-700'
              }`}>
                {isKycApproved ? <ShieldCheck size={24} /> : isKycRejected ? <XCircle size={24} /> : <Clock size={24} />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-extrabold text-gray-900">
                    KYC Status: {isKycApproved ? 'VERIFIED & APPROVED' : isKycRejected ? 'REJECTED' : isKycPending ? 'PENDING ADMIN APPROVAL' : 'NOT SUBMITTED'}
                  </h3>
                </div>
                <p className="text-xs font-semibold text-gray-600 mt-1">
                  {isKycApproved && "This user's official identity and tax documents are fully verified in the database."}
                  {isKycPending && "User has submitted KYC documents. Please review the documents below to approve or request changes."}
                  {isKycRejected && `Verification was rejected: ${kyc?.rejection_reason || kyc?.admin_note || 'Incorrect or unreadable documents'}`}
                  {!isKycApproved && !isKycPending && !isKycRejected && "No KYC records found for this user in the database."}
                </p>
                {kyc?.admin_reviewed_at && (
                  <div className="text-[11px] font-bold text-gray-500 mt-2">
                    Last reviewed on {new Date(kyc.admin_reviewed_at).toLocaleString()} {kyc.admin_reviewed_by ? `by ${kyc.admin_reviewed_by}` : ''}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Actions (Strict Left Dismiss / Right Action rule) */}
            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => setRejectModalOpen(true)}
                disabled={submittingKycAction}
                className="px-4 py-2.5 bg-white hover:bg-red-50 text-red-600 border border-red-200 font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <XCircle size={15} /> Reject with Reason
              </button>
              <button
                onClick={() => handleKycDecision('APPROVED')}
                disabled={submittingKycAction || isKycApproved}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
              >
                <CheckCircle2 size={15} /> {isKycApproved ? "Already Approved" : "Approve KYC"}
              </button>
            </div>
          </div>
        </div>

        {/* Live Google Search & KYC Multi-Factor Audit Card */}
        <LiveGroundedAuditCard 
          target={auditTarget} 
          title="Live Web Footprint & Grounded KYC Audit" 
        />

        {/* Legal & KYC Information Grid */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h4 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} className="text-[#A855F7]" /> Submitted Legal & Tax Information
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">
                {user.role === 'brand' ? 'Registered Business Name' : 'Legal Full Name'}
              </div>
              <div className="font-bold text-gray-900 text-sm">{kyc?.full_name || kyc?.company_name || user.name || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">PAN Card Number</div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-extrabold text-gray-900 text-sm">{kyc?.pan_number || '—'}</span>
                {kyc?.pan_number && (
                  <button onClick={() => handleCopy(kyc.pan_number, 'PAN Number')} className="text-gray-400 hover:text-gray-600">
                    <Copy size={13} />
                  </button>
                )}
              </div>
            </div>

            {user.role === 'brand' ? (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">GSTIN Number</div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-extrabold text-gray-900 text-sm">{kyc?.gst_number || kyc?.gstin || '—'}</span>
                  {kyc?.gst_number && (
                    <button onClick={() => handleCopy(kyc.gst_number, 'GSTIN')} className="text-gray-400 hover:text-gray-600">
                      <Copy size={13} />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div>
                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Aadhaar Number / ID</div>
                <div className="font-mono font-bold text-gray-900 text-sm">{kyc?.aadhaar_number || '—'}</div>
              </div>
            )}

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Date of Birth / Registration</div>
              <div className="font-semibold text-gray-900 text-sm">{kyc?.dob || kyc?.date_of_birth || kyc?.rate_card?.dob || kyc?.rate_card?.date_of_birth || user?.dob || user?.date_of_birth || user?.profile?.dob || user?.profile?.rate_card?.dob || user?.profile?.date_of_birth || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Registered Phone</div>
              <div className="font-semibold text-gray-900 text-sm">{kyc?.phone || kyc?.mobile || user.phone || '—'}</div>
            </div>

            <div>
              <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Registered Address</div>
              <div className="font-semibold text-gray-900 text-sm">{kyc?.address || (kyc?.city ? `${kyc.city}, ${kyc.state || ''}` : '—')}</div>
            </div>

            {kyc?.ocr_extracted_name && (
              <div className="col-span-full p-4 rounded-2xl bg-purple-50/50 border border-purple-100 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-extrabold text-purple-700 uppercase tracking-wider">AI OCR Document Extraction</div>
                  <div className="text-xs font-semibold text-gray-800 mt-0.5">
                    Extracted Name: <span className="font-bold">{kyc.ocr_extracted_name}</span> | Extracted PAN: <span className="font-mono font-bold">{kyc.ocr_extracted_pan || kyc.pan_number}</span>
                  </div>
                </div>
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-extrabold uppercase">
                  OCR Verified
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Uploaded Documents Grid */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h4 className="text-base font-extrabold text-gray-900 mb-4 flex items-center gap-2">
            <FileText size={18} className="text-[#A855F7]" /> Submitted Document Files & Proofs
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* PAN Card */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">PAN Card Document</span>
                  {panDocUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Official government permanent account number proof</p>
              </div>

              {panDocUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'PAN Card', url: panDocUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={panDocUrl} alt="PAN Card" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'PAN Card', url: panDocUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={panDocUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 font-semibold">
                  No document uploaded
                </div>
              )}
            </div>

            {/* Aadhaar Front */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Aadhaar Card (Front)</span>
                  {aadhaarFrontUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Front side of Aadhaar / National Identity</p>
              </div>

              {aadhaarFrontUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'Aadhaar (Front)', url: aadhaarFrontUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={aadhaarFrontUrl} alt="Aadhaar Front" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'Aadhaar (Front)', url: aadhaarFrontUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={aadhaarFrontUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 font-semibold">
                  No document uploaded
                </div>
              )}
            </div>

            {/* Aadhaar Back */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">Aadhaar Card (Back)</span>
                  {aadhaarBackUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">Back side of Aadhaar showing registered address</p>
              </div>

              {aadhaarBackUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'Aadhaar (Back)', url: aadhaarBackUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={aadhaarBackUrl} alt="Aadhaar Back" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'Aadhaar (Back)', url: aadhaarBackUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={aadhaarBackUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 font-semibold">
                  No document uploaded
                </div>
              )}
            </div>

            {/* UPI QR Code */}
            <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">UPI QR Code</span>
                  {upiQrCodeUrl ? (
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 bg-gray-200 text-gray-500 font-bold rounded">Missing</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500">QR code for instant direct UPI payouts</p>
              </div>

              {upiQrCodeUrl ? (
                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-white p-1"
                  >
                    <img src={upiQrCodeUrl} alt="UPI QR Code" className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={upiQrCodeUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="h-24 rounded-xl border border-dashed border-gray-300 flex items-center justify-center text-xs text-gray-400 font-semibold">
                  No QR code uploaded
                </div>
              )}
            </div>

            {/* GST / Business Proof (If Brand or applicable) */}
            {(gstDocUrl || incDocUrl) && (
              <div className="p-4 rounded-2xl bg-gray-50 border border-gray-200 flex flex-col justify-between h-56">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-extrabold text-gray-800 uppercase tracking-wider">GST / Incorporation Proof</span>
                    <span className="text-[10px] px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded">Attached</span>
                  </div>
                  <p className="text-[11px] text-gray-500">Official business registration certificate</p>
                </div>

                <div className="space-y-2">
                  <div 
                    onClick={() => setPreviewDoc({ title: 'Business Certificate', url: gstDocUrl || incDocUrl })}
                    className="h-24 rounded-xl overflow-hidden border border-gray-200 relative group cursor-pointer bg-black/5"
                  >
                    <img src={gstDocUrl || incDocUrl} alt="Certificate" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                      <Eye size={14} /> Click to View
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setPreviewDoc({ title: 'Business Certificate', url: gstDocUrl || incDocUrl })}
                      className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex items-center justify-center gap-1"
                    >
                      <Eye size={12} /> Preview
                    </button>
                    <a 
                      href={gstDocUrl || incDocUrl} 
                      target="_blank" 
                      rel="noreferrer"
                      className="p-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-gray-700"
                      title="Open in new tab"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  // 3. Payment & Payouts Tab
  const renderPayoutsTab = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        {/* Financial KPI Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-purple-700">Total Volume</span>
              <DollarSign size={18} className="text-purple-600" />
            </div>
            <div className="text-2xl font-black text-gray-900">₹{Number(paymentSummary.total_earned || 0).toLocaleString()}</div>
            <div className="text-xs text-gray-400 font-medium mt-1">Platform gross activity</div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-emerald-700">Total Paid Out</span>
              <CheckCircle2 size={18} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-700">₹{Number(paymentSummary.total_paid_out || 0).toLocaleString()}</div>
            <div className="text-xs text-emerald-600 font-medium mt-1">Successfully transferred</div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-700">Pending Escrow</span>
              <Clock size={18} className="text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-700">₹{Number(paymentSummary.pending_payout || 0).toLocaleString()}</div>
            <div className="text-xs text-amber-600 font-medium mt-1">Held in escrow safety</div>
          </div>

          <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-sm">
            <div className="flex items-center justify-between text-gray-500 mb-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-blue-700">Completed Deals</span>
              <Briefcase size={18} className="text-blue-600" />
            </div>
            <div className="text-2xl font-black text-gray-900">{paymentSummary.completed_deals_count || 0}</div>
            <div className="text-xs text-gray-400 font-medium mt-1">Successful collaborations</div>
          </div>
        </div>

        {/* Payout Methods Card */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <CreditCard size={18} className="text-[#A855F7]" /> Registered Payout Accounts
            </h4>
            {isKycApproved ? (
              <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1">
                <CheckCircle2 size={13} /> Verified for Direct Payouts
              </span>
            ) : (
              <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold flex items-center gap-1">
                <Clock size={13} /> Pending Verification
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* UPI Option */}
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs">
                      UPI
                    </div>
                    <span className="text-sm font-bold text-gray-900">Virtual Payment Address (VPA)</span>
                  </div>
                  {paymentDetails?.upi_id && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">Active</span>
                  )}
                </div>

                {paymentDetails?.upi_id ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                      <span className="font-mono text-sm font-bold text-gray-900 select-all">{paymentDetails.upi_id}</span>
                      <button 
                        onClick={() => handleCopy(paymentDetails.upi_id, 'UPI ID')} 
                        className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"
                      >
                        {copiedField === 'UPI ID' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 font-semibold italic p-3 bg-white rounded-xl border border-dashed border-gray-200">
                    No UPI address linked
                  </div>
                )}
              </div>

              {upiQrCodeUrl && (
                <div className="mt-4 pt-3 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600">Attached UPI QR Code</span>
                  <button 
                    onClick={() => setPreviewDoc({ title: 'UPI QR Code', url: upiQrCodeUrl })}
                    className="text-xs font-bold text-[#A855F7] hover:underline flex items-center gap-1"
                  >
                    <Eye size={13} /> View QR Image
                  </button>
                </div>
              )}
            </div>

            {/* Bank Account Option */}
            <div className="p-5 rounded-2xl bg-gray-50 border border-gray-200/80 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-black text-xs">
                      <Building2 size={16} />
                    </div>
                    <span className="text-sm font-bold text-gray-900">Direct Bank Account (NEFT / IMPS)</span>
                  </div>
                  {paymentDetails?.bank_account_no && (
                    <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded">Active</span>
                  )}
                </div>

                {paymentDetails?.bank_account_no ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-gray-200">
                      <div>
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Account Number</div>
                        <div className="font-mono text-sm font-bold text-gray-900">
                          {showBankAcc ? paymentDetails.bank_account_no : `••••••••${paymentDetails.bank_account_no.slice(-4)}`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button 
                          onClick={() => setShowBankAcc(!showBankAcc)} 
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                          {showBankAcc ? <EyeOff size={15} /> : <Eye size={15} />}
                        </button>
                        <button 
                          onClick={() => handleCopy(paymentDetails.bank_account_no, 'Bank Account Number')} 
                          className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                        >
                          {copiedField === 'Bank Account Number' ? <Check size={15} className="text-green-600" /> : <Copy size={15} />}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="p-2.5 bg-white rounded-xl border border-gray-200">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">IFSC Code</div>
                        <div className="font-mono font-bold text-gray-900">{paymentDetails.bank_ifsc || '—'}</div>
                      </div>
                      <div className="p-2.5 bg-white rounded-xl border border-gray-200">
                        <div className="text-[10px] font-bold text-gray-400 uppercase">Beneficiary Name</div>
                        <div className="font-bold text-gray-900 truncate">{paymentDetails.bank_holder_name || user.name || '—'}</div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-gray-400 font-semibold italic p-3 bg-white rounded-xl border border-dashed border-gray-200">
                    No bank account linked
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Escrow Transactions & Payouts Ledger */}
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Activity size={18} className="text-[#A855F7]" /> Escrow Transactions & Payout History
            </h4>
            <span className="text-xs font-bold text-gray-400">{escrowTransactions.length} recorded transactions</span>
          </div>

          {escrowTransactions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-extrabold text-[10px]">
                    <th className="pb-3 px-3">Transaction / Order</th>
                    <th className="pb-3 px-3">Gross Amount</th>
                    <th className="pb-3 px-3">Platform Fee</th>
                    <th className="pb-3 px-3">Net Payout</th>
                    <th className="pb-3 px-3">Payout Status</th>
                    <th className="pb-3 px-3">UTR / Reference</th>
                    <th className="pb-3 px-3 text-right">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {escrowTransactions.map((tx) => {
                    const isPaid = tx.payout_status === 'PAID';
                    const isPending = tx.payout_status === 'PENDING' || tx.payout_status === 'PROCESSING';

                    return (
                      <tr key={tx.id || Math.random()} className="hover:bg-gray-50/50 transition-colors">
                        <td className="py-3 px-3 font-semibold text-gray-900">
                          <div>{tx.ugc_order_id ? `UGC Order #${tx.ugc_order_id.slice(0, 8)}` : (tx.deal_id ? `Deal #${tx.deal_id.slice(0, 8)}` : `Tx #${tx.id?.slice(0, 8)}`)}</div>
                          {tx.zaakpay_order_id && <div className="text-[10px] text-gray-400 font-mono">{tx.zaakpay_order_id}</div>}
                        </td>
                        <td className="py-3 px-3 font-bold text-gray-700">₹{formatAmount(tx.gross_amount)}</td>
                        <td className="py-3 px-3 text-gray-500 font-medium">₹{formatAmount(tx.platform_fee_amount)}</td>
                        <td className="py-3 px-3 font-extrabold text-emerald-700">₹{formatAmount(tx.creator_net_amount)}</td>
                        <td className="py-3 px-3">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider inline-flex items-center gap-1 ${
                            isPaid ? 'bg-emerald-100 text-emerald-800' :
                            isPending ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {isPaid ? <CheckCircle2 size={11} /> : <Clock size={11} />}
                            {tx.payout_status || 'PENDING'}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-gray-600">
                          {tx.payout_reference ? (
                            <span className="font-bold text-gray-900 bg-gray-100 px-1.5 py-0.5 rounded text-[11px]">{tx.payout_reference}</span>
                          ) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right text-gray-500 font-medium">
                          {tx.created_at ? new Date(tx.created_at).toLocaleDateString() : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm font-semibold italic bg-gray-50 rounded-2xl">
              No escrow transactions or payout requests recorded for this account.
            </div>
          )}
        </div>
      </div>
    );
  };

  // 4. Permissions Tab
  const renderPermissions = () => {
    const handleToggleAllPermissions = (enable) => {
      const updated = { ...permissions };
      SUB_ADMIN_MODULES.forEach(m => {
        updated[m.key] = enable;
      });
      updated.view_analytics = enable;
      setPermissions(updated);
    };

    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
           <div className="flex items-center justify-between mb-4">
             <h3 className="text-lg font-extrabold text-gray-900 flex items-center gap-2">
               <Shield size={18} className="text-[#A855F7]" /> Administrative Roles & Access
             </h3>
             {teamRole === 'sub_admin' && (
               <div className="flex items-center gap-2">
                 <button
                   type="button"
                   onClick={() => handleToggleAllPermissions(true)}
                   className="text-xs font-bold text-purple-600 hover:text-purple-800 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                 >
                   Grant All Access (12)
                 </button>
                 <button
                   type="button"
                   onClick={() => handleToggleAllPermissions(false)}
                   className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors cursor-pointer"
                 >
                   Deselect All
                 </button>
               </div>
             )}
           </div>
           
           <div className="mb-6">
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Assigned Role</label>
              <select 
                 value={teamRole} 
                 onChange={e => setTeamRole(e.target.value)}
                 className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC]"
              >
                 <option value="admin">Super Admin (Full Platform Access)</option>
                 <option value="sub_admin">Sub-Admin (Configurable Module Access)</option>
                 <option value="">Standard User (No Admin Access)</option>
              </select>
           </div>

           {teamRole === 'sub_admin' && (
              <div className="space-y-3">
                 <div className="flex items-center justify-between">
                   <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">
                     Sub-Admin Accessible Modules ({Object.values(permissions).filter(Boolean).length}/12 Enabled)
                   </label>
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {SUB_ADMIN_MODULES.map(mod => (
                       <label key={mod.key} className={`flex items-start gap-3 p-3.5 border rounded-2xl cursor-pointer transition-all ${permissions[mod.key] ? 'border-purple-200 bg-purple-50/40' : 'border-gray-100 bg-white hover:bg-gray-50'}`}>
                          <input 
                            type="checkbox" 
                            checked={!!permissions[mod.key]} 
                            onChange={e => setPermissions({...permissions, [mod.key]: e.target.checked})}
                            className="w-4 h-4 mt-0.5 text-[#A855F7] rounded border-gray-300 focus:ring-[#A855F7]"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-bold text-gray-900">{mod.label}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{mod.desc}</div>
                          </div>
                       </label>
                    ))}
                 </div>
              </div>
           )}

           <div className="mt-6 pt-4 border-t border-gray-100">
              <button 
                 onClick={savePermissions}
                 className="px-6 py-2.5 bg-[#111827] hover:bg-[#374151] text-white font-bold rounded-xl text-sm transition-colors cursor-pointer"
              >
                 Save Role & Permissions
              </button>
           </div>
        </div>
      </div>
    );
  };

  // 5. Enforcement Tab
  const renderEnforcement = () => (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Relocated Quick Actions: Show on home, Grounded Audit (Bulb), and Delete Account */}
      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h4 className="text-base font-extrabold text-gray-900 flex items-center gap-2">
              <Sparkles size={18} className="text-[#7C3AED]" /> Quick Actions &amp; Profile Curation
            </h4>
            <p className="text-xs text-gray-500 font-medium mt-1">
              Manage homepage discovery, run live authenticity audit, or configure account deletion.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Show on Creator Home */}
            {user.role === 'creator' && !user.is_deleted && (
              <button
                type="button"
                onClick={handleToggleHome}
                disabled={localHomePickBusy || homePickBusy === targetUid}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 ${
                  isOnCreatorHome
                    ? 'bg-[#7C3AED] text-white shadow-sm hover:bg-[#6D28D9]'
                    : 'bg-purple-50 text-[#7C3AED] hover:bg-purple-100 border border-purple-200'
                }`}
                title="Show on creator home (max 4)"
              >
                <Home size={15} />
                <span>{isOnCreatorHome ? 'On Creator Home' : 'Show on Home'}</span>
              </button>
            )}

            {/* Run Live Grounded KYC & Authenticity Audit (Lightbulb) */}
            {user.role !== 'admin' && (
              <button
                type="button"
                onClick={() => setShowQuickAudit(true)}
                className="px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition-colors cursor-pointer"
                title="Run Live Grounded KYC & Authenticity Audit"
              >
                <Lightbulb size={15} className="text-indigo-600" />
                <span>KYC &amp; Authenticity Audit</span>
              </button>
            )}

            {/* Delete Account Shortcut */}
            {user.role !== 'admin' && (
              <button
                type="button"
                onClick={() => setActiveEnforcementStage('ban')}
                className={`px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                  activeEnforcementStage === 'ban'
                    ? 'bg-red-600 text-white border-red-600 shadow-sm'
                    : 'bg-red-50 text-red-600 hover:bg-red-100 border-red-200'
                }`}
                title="Delete or Wipe Account"
              >
                <Trash2 size={15} />
                <span>Delete Account</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
        <h3 className="text-lg font-extrabold text-gray-900 mb-4 flex items-center gap-2"><AlertTriangle size={18} className="text-red-500" /> Enforcement Action</h3>
        
        <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-2xl w-max">
           <button onClick={()=>setActiveEnforcementStage('warning')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeEnforcementStage==='warning' ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:text-gray-900'}`}>Warning</button>
           <button onClick={()=>setActiveEnforcementStage('suspend')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeEnforcementStage==='suspend' ? 'bg-orange-100 text-orange-700' : 'text-gray-500 hover:text-gray-900'}`}>Suspend</button>
           <button onClick={()=>setActiveEnforcementStage('ban')} className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${activeEnforcementStage==='ban' ? 'bg-red-100 text-red-700' : 'text-gray-500 hover:text-gray-900'}`}>Delete Account</button>
        </div>

        {activeEnforcementStage === 'warning' && (
           <div className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Template</label>
                 <select 
                    value={warningTemplate} 
                    onChange={e => setWarningTemplate(e.target.value)} 
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                 >
                    <option value="">Select template...</option>
                    {warningTemplates.map(t => (
                       <option key={t.template_id || t.id || t.name} value={t.template_id}>{t.name}</option>
                    ))}
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Custom Note</label>
                 <textarea value={warningNote} onChange={e => setWarningNote(e.target.value)} className="w-full h-24 bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 resize-none"></textarea>
              </div>
              <button 
                 onClick={handleSendWarning}
                 className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm cursor-pointer"
              >
                 <Send size={16} /> Send Warning
              </button>
           </div>
        )}

        {activeEnforcementStage === 'suspend' && (
           <div className="space-y-4">
              <div>
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Duration</label>
                 <select value={suspendDuration} onChange={e=>setSuspendDuration(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400">
                    <option value="3">3 Days</option>
                    <option value="7">7 Days</option>
                    <option value="30">30 Days</option>
                    <option value="indefinite">Indefinite (Requires Admin review)</option>
                 </select>
              </div>
              <div>
                 <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1 block">Reason</label>
                 <select value={suspendReason} onChange={e=>setSuspendReason(e.target.value)} className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400">
                    <option value="">Select reason...</option>
                    <option value="Repeated off-platform contact">Repeated off-platform contact</option>
                    <option value="Fraudulent activity">Fraudulent activity</option>
                    <option value="Failure to deliver">Failure to deliver</option>
                 </select>
              </div>
              <button 
                 onClick={() => handleAction('suspend', { duration: suspendDuration, reason: suspendReason })}
                 disabled={!suspendReason}
                 className="w-full py-3 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer">
                 <AlertOctagon size={16} /> Suspend Account
              </button>
           </div>
        )}

        {activeEnforcementStage === 'ban' && (
           <DeleteAccountPanel
             user={user}
             onDone={(mode) => {
               if (mode === 'wipe') { if (onBack) onBack(); if (onUserUpdate) onUserUpdate(); return; }
               fetchViolations(); fetchFullProfile(); if (onUserUpdate) onUserUpdate();
             }}
           />
        )}
      </div>

      <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
         <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-extrabold text-gray-900">Violation History</h4>
            {violations.length > 0 && (
              <button 
                onClick={() => handleAction('unrestrict', {})}
                className="text-xs font-extrabold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-xl transition-colors flex items-center gap-1 cursor-pointer"
                title="Clear all violations and restore chat access"
              >
                <RotateCcw size={13} /> Clear All Violations & Unrestrict
              </button>
            )}
         </div>
         {violations.length > 0 ? (
            <div className="space-y-4">
               {violations.map(v => (
                  <div key={v.id || v.type + v.date || Math.random()} className="flex gap-3 text-sm p-4 bg-gray-50 rounded-xl border border-gray-100">
                     <div className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0"></div>
                     <div>
                        <div className="font-extrabold text-gray-900">{v.type} <span className="text-xs text-gray-400 font-bold ml-2">{v.date}</span></div>
                        <div className="text-gray-600 font-medium mt-1">{v.reason}</div>
                     </div>
                  </div>
               ))}
            </div>
         ) : (
            <p className="text-sm text-gray-400 font-semibold italic">No past violations recorded.</p>
         )}
      </div>
      
      {(user.banned || user.is_deleted || user.suspended || user.is_suspended || user.is_restricted) && (
         <div className="bg-green-50 border border-green-200 rounded-3xl p-6 text-center shadow-sm">
            <h4 className="font-extrabold text-green-700 mb-2 text-lg">
               Account is {user.is_deleted ? 'Deleted (In Bin)' : user.banned ? 'Banned' : user.suspended || user.is_suspended ? 'Suspended' : 'Restricted from Chat'}
            </h4>
            <p className="text-xs text-green-600 font-medium mb-4">
               You can restore the account to normal standing, which unlocks all features and clears violations.
            </p>
            <div className="flex items-center justify-center gap-3">
               <button 
                   onClick={() => handleAction('reinstate', {})}
                  className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm cursor-pointer">
                  <RotateCcw size={16} /> Restore & Reinstate Full Account
               </button>
               <button 
                   onClick={() => handleAction('unrestrict', {})}
                  className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold rounded-xl flex items-center justify-center gap-2 transition-colors shadow-sm text-sm cursor-pointer">
                  <Shield size={16} /> Unrestrict Chat Only
               </button>
            </div>
         </div>
      )}
    </div>
  );

  // 6. Direct Message Tab
  const renderMessage = () => {
    return (
      <div className="space-y-6 animate-in fade-in duration-200">
        <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
          <h3 className="text-lg font-extrabold text-gray-900 mb-2 flex items-center gap-2">
            <Send size={18} className="text-[#A855F7]" /> Direct Custom Notification Panel
          </h3>
          <p className="text-xs text-gray-500 font-medium mb-6">
            Send a customized notification or official system message directly to {user.name}. It will pop up instantly on their dashboard when they log in.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5 block">Message Content</label>
              <textarea 
                value={customMsg} 
                onChange={e => setCustomMsg(e.target.value)} 
                placeholder={`Type the notification message here... (e.g. "Dear ${user.name}, please verify your payout details.")`}
                className="w-full h-32 bg-gray-50 border border-gray-200 rounded-2xl p-4 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#E9D5FF] focus:border-[#C084FC] resize-none"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2.5 block">Select Dispatch Channels</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: 'in_app', label: 'In-App Pop-up', desc: 'Alert modal on dashboard' },
                  { id: 'whatsapp', label: 'WhatsApp', desc: 'Direct message alert' },
                  { id: 'sms', label: 'SMS Carrier', desc: 'Mobile text alert' },
                  { id: 'email', label: 'Email', desc: 'Official email notice' }
                ].map(ch => (
                  <label key={ch.id} className={`p-4 border rounded-2xl cursor-pointer transition-all flex flex-col justify-between h-24 ${
                    selectedChannels[ch.id] 
                      ? 'bg-purple-50/50 border-[#C084FC] text-[#7E22CE] ring-1 ring-[#C084FC]/30' 
                      : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-extrabold uppercase tracking-wide">{ch.label}</span>
                      <input 
                        type="checkbox" 
                        checked={selectedChannels[ch.id]}
                        onChange={e => setSelectedChannels({...selectedChannels, [ch.id]: e.target.checked})}
                        className="w-4 h-4 text-[#A855F7] rounded border-gray-300 focus:ring-[#A855F7]"
                      />
                    </div>
                    <span className="text-[10px] text-gray-400 font-medium leading-none block">{ch.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="pt-4 flex items-center justify-end gap-3 border-t border-gray-100">
               <button 
                  onClick={handleSendCustomMessage}
                  disabled={sendingMsg}
                  className="px-6 py-3 bg-[#111827] hover:bg-[#374151] text-white font-extrabold rounded-xl text-sm flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
               >
                  {sendingMsg ? "Dispatching..." : "Send Notification"} <Send size={14} />
               </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="animate-in slide-in-from-right-4 duration-200 font-sans">
       <button onClick={onBack} className="flex items-center gap-2 text-sm font-bold text-gray-500 hover:text-gray-900 mb-6 transition-colors group cursor-pointer">
          <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> Back to users list
       </button>
       
       <div className="flex items-center justify-between gap-4 mb-8">
          <div className="flex items-center gap-4">
            {user.picture ? (
              <img src={user.picture} alt="" className="w-16 h-16 rounded-full object-cover shadow-sm border border-gray-100"/>
            ) : (
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#D8B4FE] to-[#A855F7] flex items-center justify-center text-xl font-extrabold text-white">
                {(user.name || "?").charAt(0)}
              </div>
            )}
            <div onClick={handleSecretPasswordTrigger} className="cursor-pointer select-none">
               <div className="flex items-center gap-2.5">
                 <h2 className="text-2xl font-extrabold text-gray-900">{user.name}</h2>
                 {isTargetAdmin ? (
                   <span className="px-2.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                     <Shield size={11} className="text-purple-600" /> {user.team_role === 'sub_admin' ? 'Sub-Admin Staff' : 'Super Admin'}
                   </span>
                 ) : isKycApproved ? (
                   <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                     <CheckCircle2 size={11} /> KYC Verified
                   </span>
                 ) : isKycPending ? (
                   <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                     <Clock size={11} /> KYC Pending
                   </span>
                 ) : (
                   <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold">
                     No KYC
                   </span>
                 )}
               </div>
               <div className="text-sm font-bold text-gray-500 mt-1">{user.email || fullData?.profile?.email || '—'}</div>
            </div>
            {user.is_deleted && <div className="ml-2 px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-extrabold uppercase tracking-widest shadow-sm">Deleted</div>}
            {user.banned && !user.is_deleted && <div className="ml-2 px-3 py-1 bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-extrabold uppercase tracking-widest shadow-sm">Banned</div>}
            {user.suspended && !user.is_deleted && <div className="ml-2 px-3 py-1 bg-orange-100 text-orange-700 border border-orange-200 rounded-lg text-xs font-extrabold uppercase tracking-widest shadow-sm">Suspended</div>}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchFullProfile()}
              className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl transition-colors cursor-pointer"
              title="Refresh profile details"
            >
              <RefreshCw size={15} />
            </button>
          </div>
       </div>

       {/* Sub-navigation tabs */}
       <div className="flex gap-6 mb-8 border-b border-gray-200 overflow-x-auto scrollbar-hidden">
          <button 
             onClick={() => setActiveTab('profile')} 
             className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'profile' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
          >
             Overview & Activity
          </button>
          {!isTargetAdmin && (
            <button 
               onClick={() => setActiveTab('kyc')} 
               className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTab === 'kyc' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
            >
               <FileText size={15} /> KYC & Documents
               {isKycApproved && <span className="w-2 h-2 rounded-full bg-emerald-500"></span>}
               {isKycPending && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
            </button>
          )}
          {!isTargetAdmin && (
            <>
              <button 
                 onClick={() => setActiveTab('payouts')} 
                 className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${activeTab === 'payouts' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
              >
                 <Wallet size={15} /> Payment & Payouts ({escrowTransactions.length})
              </button>
              <button 
                 onClick={() => setActiveTab('enforcement')} 
                 className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'enforcement' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
              >
                 Enforcement
              </button>
              <button 
                 onClick={() => setActiveTab('message')} 
                 className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'message' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
              >
                 Direct Message
              </button>
            </>
          )}
          {isFullAdmin && isTargetAdmin && (
            <button 
               onClick={() => setActiveTab('permissions')} 
               className={`pb-3 px-2 text-sm font-extrabold transition-colors border-b-2 whitespace-nowrap cursor-pointer ${activeTab === 'permissions' ? 'border-[#A855F7] text-[#A855F7]' : 'border-transparent text-gray-400 hover:text-gray-700'}`}
            >
               Roles & Permissions
            </button>
          )}
       </div>

       {loading ? (
          <div className="p-12 text-center text-gray-500 font-bold flex flex-col items-center justify-center gap-3">
             <RefreshCw size={24} className="animate-spin text-[#A855F7]" />
             Loading user and account details...
          </div>
       ) : (
          <div className="grid grid-cols-1 gap-6">
             {activeTab === 'profile' && renderProfile()}
             {activeTab === 'kyc' && !isTargetAdmin && renderKycTab()}
             {activeTab === 'payouts' && renderPayoutsTab()}
             {activeTab === 'enforcement' && renderEnforcement()}
             {activeTab === 'permissions' && renderPermissions()}
             {activeTab === 'message' && renderMessage()}
          </div>
       )}

       {/* High-Resolution Document Preview Modal */}
       <Presence>{previewDoc && (
         <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
           <PopupPanel kind="modal" className="bg-white rounded-3xl p-6 w-full max-w-2xl shadow-2xl relative flex flex-col max-h-[90vh]">
             <div className="flex items-center justify-between pb-4 border-b border-gray-100">
               <div>
                 <h3 className="text-lg font-black text-gray-900">{previewDoc.title}</h3>
                 <span className="text-xs text-gray-500 font-semibold">{user.name} ({user.role})</span>
               </div>
               <div className="flex items-center gap-2">
                 <a 
                   href={previewDoc.url} 
                   target="_blank" 
                   rel="noreferrer"
                   className="p-2 hover:bg-gray-100 rounded-xl text-gray-600 transition-colors"
                   title="Open in new window"
                 >
                   <ExternalLink size={18} />
                 </a>
                 <button 
                   onClick={() => setPreviewDoc(null)} 
                   className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 hover:text-gray-900 transition-colors cursor-pointer"
                 >
                   <X size={20} />
                 </button>
               </div>
             </div>

             <div className="py-4 flex-1 overflow-auto flex items-center justify-center bg-gray-50 rounded-2xl my-4">
               <img 
                 src={previewDoc.url} 
                 alt={previewDoc.title} 
                 className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-sm" 
               />
             </div>

             <div className="flex items-center justify-end gap-3 pt-2">
               <button 
                 onClick={() => setPreviewDoc(null)}
                 className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-extrabold rounded-xl text-xs transition-colors cursor-pointer"
               >
                 Close Preview
               </button>
             </div>
           </PopupPanel>
         </PopupBackdrop>
       )}</Presence>

       {/* KYC Rejection Modal */}
       <Presence>{rejectModalOpen && (
         <PopupBackdrop className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
           <PopupPanel kind="modal" className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative">
             <button 
               onClick={() => setRejectModalOpen(false)} 
               className="absolute top-4 right-4 text-gray-400 hover:text-gray-900 transition-colors"
             >
               <X size={20} />
             </button>

             <h3 className="text-lg font-black text-gray-900 mb-1 flex items-center gap-2">
               <AlertCircle className="text-red-500" size={20} /> Reject KYC Submission
             </h3>
             <p className="text-xs font-semibold text-gray-500 mb-4">
               Please specify the reason for rejecting {user.name}'s KYC submission. The user will be notified to re-upload correct documents.
             </p>

             <div className="space-y-3 mb-6">
               <label className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Rejection Reason</label>
               <textarea 
                 value={rejectReason}
                 onChange={e => setRejectReason(e.target.value)}
                 placeholder="e.g. Document image is blurry, name mismatch with PAN card, expired proof..."
                 className="w-full h-28 bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 resize-none"
               />
             </div>

             <div className="flex items-center justify-end gap-2">
               <button 
                 onClick={() => setRejectModalOpen(false)}
                 className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs"
               >
                 Cancel
               </button>
               <button 
                 onClick={() => handleKycDecision('REJECTED', rejectReason)}
                 disabled={submittingKycAction}
                 className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-extrabold rounded-xl text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
               >
                 <XCircle size={14} /> Confirm Rejection
               </button>
             </div>
           </PopupPanel>
         </PopupBackdrop>
       )}</Presence>

        {/* Quick Live Grounded KYC & Authenticity Audit Modal */}
        <QuickAuditModal 
          target={auditTarget} 
          isOpen={showQuickAudit} 
          onClose={() => setShowQuickAudit(false)} 
        />
    </div>
  );
}
