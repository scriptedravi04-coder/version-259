import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { Lightbulb, Send, MessageSquare, CheckCircle2, Clock, XCircle, AlertCircle, ExternalLink, Mail, Phone, Search, Filter, UserCheck, UserX, ChevronRight, RefreshCw, ShieldCheck, FileText, DollarSign, Calendar, Layers, ArrowRight } from 'lucide-react';

import { Presence, PopupBackdrop, PopupPanel } from "../common/Popup";
export default function AdminPitchLeads() {
  const [pitches, setPitches] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    new_count: 0,
    in_negotiation_count: 0,
    accepted_count: 0,
    declined_count: 0,
    unregistered_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [selectedPitch, setSelectedPitch] = useState(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [creatorTypeFilter, setCreatorTypeFilter] = useState('all'); // all | unregistered | registered

  // Chat conversation in right panel
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Email Outreach Modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailModalPitch, setEmailModalPitch] = useState(null);
  const [emailTarget, setEmailTarget] = useState('');
  const [emailCustomNote, setEmailCustomNote] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Status update
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const messagesEndRef = useRef(null);

  const fetchPitches = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/pitch-leads', {
        params: {
          status: statusFilter,
          filter: creatorTypeFilter,
          q: searchQuery,
        },
        useCache: false,
      });

      const list = res.data?.pitches || [];
      setPitches(list);
      if (res.data?.stats) {
        setStats(res.data.stats);
      }

      // If a pitch is already selected, keep it updated
      if (selectedPitch) {
        const updated = list.find((p) => p.id === selectedPitch.id);
        if (updated) {
          setSelectedPitch(updated);
        }
      } else if (list.length > 0) {
        setSelectedPitch(list[0]);
      }
    } catch (err) {
      console.error('Failed to load pitch leads:', err);
      toast.error('Failed to load campaign pitch leads.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPitches();
  }, [statusFilter, creatorTypeFilter]);

  // Load chat messages when selected pitch changes
  useEffect(() => {
    if (!selectedPitch?.thread_id) {
      setMessages([]);
      return;
    }

    const fetchMessages = async () => {
      try {
        setLoadingMessages(true);
        const res = await api.get(`/admin/pitch-leads/${selectedPitch.thread_id}/messages`, {
          useCache: false,
        });
        setMessages(res.data?.messages || []);
      } catch (err) {
        console.error('Failed to fetch pitch messages:', err);
      } finally {
        setLoadingMessages(false);
      }
    };

    fetchMessages();
  }, [selectedPitch?.thread_id, selectedPitch?.id]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchPitches();
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSendReplyAsCreator = async (e) => {
    e?.preventDefault();
    if (!replyText.trim() || !selectedPitch?.thread_id) return;

    setSendingReply(true);
    try {
      const res = await api.post(`/admin/pitch-leads/${selectedPitch.thread_id}/reply-as-creator`, {
        text: replyText.trim(),
      });

      if (res.data?.success) {
        toast.success(`Message dispatched as ${selectedPitch.creator.name} to ${selectedPitch.brand.name}!`);
        setMessages((prev) => [...prev, res.data.message]);
        setReplyText('');
        // Refresh pitch list to reflect state updates
        fetchPitches();
      }
    } catch (err) {
      console.error('Failed to broker reply:', err);
      toast.error(err?.response?.data?.error || 'Failed to dispatch message.');
    } finally {
      setSendingReply(false);
    }
  };

  const handleUpdateStatus = async (newStatus) => {
    if (!selectedPitch) return;
    setUpdatingStatus(true);
    try {
      const res = await api.patch(`/admin/pitch-leads/${selectedPitch.id}/status`, {
        status: newStatus,
      });
      if (res.data?.success) {
        toast.success(`Pitch status marked as ${newStatus}`);
        setSelectedPitch((prev) => ({ ...prev, status: newStatus }));
        fetchPitches();
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update status.');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleOpenEmailModal = (pitch) => {
    setEmailModalPitch(pitch);
    setEmailTarget(pitch.creator.email || '');
    setEmailCustomNote('');
    setShowEmailModal(true);
  };

  const handleSendOutreachEmail = async (e) => {
    e.preventDefault();
    if (!emailModalPitch || !emailTarget.trim()) {
      toast.error('Please specify a valid email address.');
      return;
    }

    setSendingEmail(true);
    try {
      const res = await api.post(`/admin/pitch-leads/${emailModalPitch.id}/send-creator-email`, {
        target_email: emailTarget.trim(),
        custom_note: emailCustomNote.trim(),
      });
      if (res.data?.success) {
        toast.success(res.data.message || 'Outreach email sent successfully!');
        setShowEmailModal(false);
        fetchPitches();
      }
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send outreach email.');
    } finally {
      setSendingEmail(false);
    }
  };

  const getStatusBadge = (status) => {
    switch ((status || 'NEW').toUpperCase()) {
      case 'NEW':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock size={12} /> New Pitch
          </span>
        );
      case 'IN_NEGOTIATION':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <MessageSquare size={12} /> In Negotiation
          </span>
        );
      case 'ACCEPTED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 size={12} /> Accepted
          </span>
        );
      case 'DECLINED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle size={12} /> Declined
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-700 border border-gray-200">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 text-xs font-semibold rounded-md bg-purple-100 text-purple-800">
              Admin Concierge
            </span>
            <span className="text-xs text-gray-500 font-medium">Deal Pipeline & Inbound Pitches</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-1 tracking-tight">Pitch Leads</h1>
          <p className="text-sm text-gray-600 mt-0.5 max-w-2xl">
            Monitor and broker campaign briefs sent by brands to creators. For unregistered creators, manage communications directly so brands enjoy an authentic, high-trust collaboration experience.
          </p>
        </div>

        <button
          onClick={fetchPitches}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl transition shadow-xs self-start md:self-auto"
        >
          <RefreshCw size={15} className={loading ? 'animate-spin text-purple-600' : 'text-gray-500'} />
          Refresh Pipeline
        </button>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Pitches</span>
            <Layers size={16} className="text-gray-400" />
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.total}</p>
          <span className="text-[11px] text-gray-500 mt-0.5 block">All incoming briefs</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-800">Action Needed (New)</span>
            <Clock size={16} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-amber-700 mt-2">{stats.new_count}</p>
          <span className="text-[11px] text-amber-600 mt-0.5 block">Pending first reply</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-purple-200 bg-purple-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-800">Unregistered Creators</span>
            <UserX size={16} className="text-purple-600" />
          </div>
          <p className="text-2xl font-bold text-purple-700 mt-2">{stats.unregistered_count}</p>
          <span className="text-[11px] text-purple-600 mt-0.5 block">Concierge managed</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-blue-200 bg-blue-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-800">In Negotiation</span>
            <MessageSquare size={16} className="text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-blue-700 mt-2">{stats.in_negotiation_count}</p>
          <span className="text-[11px] text-blue-600 mt-0.5 block">Active discussions</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-800">Accepted & Closed</span>
            <CheckCircle2 size={16} className="text-emerald-500" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 mt-2">{stats.accepted_count}</p>
          <span className="text-[11px] text-emerald-600 mt-0.5 block">Ready for contract/escrow</span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search creator, brand, campaign..."
            className="w-full pl-9 pr-3.5 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Creator Type Filter */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 text-xs font-medium">
            <button
              onClick={() => setCreatorTypeFilter('all')}
              className={`px-3 py-1 rounded-md transition ${
                creatorTypeFilter === 'all'
                  ? 'bg-white text-gray-900 shadow-xs font-semibold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              All Creators
            </button>
            <button
              onClick={() => setCreatorTypeFilter('unregistered')}
              className={`px-3 py-1 rounded-md transition flex items-center gap-1 ${
                creatorTypeFilter === 'unregistered'
                  ? 'bg-purple-600 text-white shadow-xs font-semibold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <UserX size={12} /> Unregistered ({stats.unregistered_count})
            </button>
            <button
              onClick={() => setCreatorTypeFilter('registered')}
              className={`px-3 py-1 rounded-md transition flex items-center gap-1 ${
                creatorTypeFilter === 'registered'
                  ? 'bg-white text-gray-900 shadow-xs font-semibold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <UserCheck size={12} /> Claimed
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="NEW">New Pitches</option>
            <option value="IN_NEGOTIATION">In Negotiation</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DECLINED">Declined</option>
          </select>
        </div>
      </div>

      {/* Main Split Interface */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Pitch Cards List (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-sm font-bold text-gray-800">
              Pitches ({pitches.length})
            </h2>
            <span className="text-xs text-gray-500">Sorted by newest</span>
          </div>

          {loading ? (
            <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
              <RefreshCw size={24} className="animate-spin text-purple-600 mx-auto mb-2" />
              <p className="text-sm text-gray-500">Loading pitch pipeline...</p>
            </div>
          ) : pitches.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-gray-200 text-center">
              <Lightbulb size={28} className="text-gray-400 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-800">No pitch leads found</p>
              <p className="text-xs text-gray-500 mt-1">
                {searchQuery || statusFilter !== 'ALL' || creatorTypeFilter !== 'all'
                  ? 'Try clearing your filters to see all pitch leads.'
                  : 'Campaign briefs and invites sent by brands will appear here.'}
              </p>
            </div>
          ) : (
            pitches.map((p) => {
              const isSelected = selectedPitch?.id === p.id;
              const isUnregistered = !p.creator.is_claimed;

              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPitch(p)}
                  className={`p-4 rounded-xl border transition cursor-pointer text-left ${
                    isSelected
                      ? 'bg-purple-50/40 border-purple-400 shadow-sm ring-1 ring-purple-300'
                      : 'bg-white border-gray-200 hover:border-purple-200 hover:bg-gray-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <img
                          src={
                            p.creator.avatar ||
                            `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(p.creator.name)}`
                          }
                          alt={p.creator.name}
                          className="w-10 h-10 rounded-full object-cover border border-gray-200"
                        />
                        {isUnregistered && (
                          <span
                            title="Unregistered Creator - Admin Concierge Active"
                            className="absolute -bottom-1 -right-1 w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full flex items-center justify-center text-[8px] text-white font-bold"
                          >
                            !
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="text-sm font-bold text-gray-900 leading-tight">
                            {p.creator.name}
                          </h3>
                          {isUnregistered ? (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                              Unregistered
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                              Claimed
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                          {p.creator.handle && (
                            <a
                              href={`https://instagram.com/${p.creator.handle.replace('@', '')}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-purple-600 flex items-center gap-0.5"
                            >
                              @{p.creator.handle.replace('@', '')}
                              <ExternalLink size={10} />
                            </a>
                          )}
                          {p.creator.followers > 0 && (
                            <span>• {Number(p.creator.followers).toLocaleString()} followers</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>{getStatusBadge(p.status)}</div>
                  </div>

                  {/* Brand and Campaign Info */}
                  <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600 font-medium">
                        Brand: <strong className="text-gray-900">{p.brand.name}</strong>
                      </span>
                      <span className="font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                        {p.budget_range || 'Negotiable'}
                      </span>
                    </div>

                    <div className="text-xs font-semibold text-gray-800 truncate">
                      {p.campaign_title || 'Campaign Collaboration'}
                    </div>

                    {/* Brief message snippet */}
                    {p.message && (
                      <p className="text-xs text-gray-500 line-clamp-2 italic bg-gray-50 p-2 rounded-lg">
                        "{p.message}"
                      </p>
                    )}

                    {/* Last message in thread */}
                    {p.last_message && (
                      <div className="flex items-center gap-1 text-[11px] text-gray-400 mt-1">
                        <MessageSquare size={11} />
                        <span className="truncate">
                          <strong>{p.last_message.from_name}:</strong> {p.last_message.text}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quick Action Footer */}
                  <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-xs">
                    <span className="text-[11px] text-gray-400">
                      {new Date(p.created_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>

                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      {p.creator.phone && (
                        <a
                          href={`https://wa.me/${p.creator.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(
                            `Hi ${p.creator.name}! ${p.brand.name} wants to collaborate with you for ${p.campaign_title || 'a paid campaign'} on YBEX (Budget: ${p.budget_range}). Would love to connect!`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium text-[11px]"
                          title="Contact creator on WhatsApp"
                        >
                          <Phone size={11} /> WhatsApp
                        </a>
                      )}

                      <button
                        onClick={() => handleOpenEmailModal(p)}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-purple-50 text-purple-700 hover:bg-purple-100 font-medium text-[11px]"
                        title="Send outreach email"
                      >
                        <Mail size={11} /> Email
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: Concierge Chat & Negotiation Studio (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[640px]">
          {selectedPitch ? (
            <>
              {/* Studio Header */}
              <div className="p-4 border-b border-gray-200 bg-gray-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={
                        selectedPitch.creator.avatar ||
                        `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
                          selectedPitch.creator.name
                        )}`
                      }
                      alt={selectedPitch.creator.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-purple-200"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold text-gray-900">
                          {selectedPitch.creator.name}
                        </h2>
                        {getStatusBadge(selectedPitch.status)}
                      </div>
                      <p className="text-xs text-gray-500">
                        Discussing with <strong className="text-gray-800">{selectedPitch.brand.name}</strong>
                      </p>
                    </div>
                  </div>

                  {/* Status Dropdown */}
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-500">Status:</label>
                    <select
                      value={selectedPitch.status || 'NEW'}
                      disabled={updatingStatus}
                      onChange={(e) => handleUpdateStatus(e.target.value)}
                      className="text-xs font-medium bg-white border border-gray-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-purple-500"
                    >
                      <option value="NEW">New</option>
                      <option value="IN_NEGOTIATION">In Negotiation</option>
                      <option value="ACCEPTED">Accepted / Ready</option>
                      <option value="DECLINED">Declined</option>
                    </select>
                  </div>
                </div>

                {/* Campaign Offer Details Ribbon */}
                <div className="mt-3 p-3 bg-white rounded-xl border border-gray-200 text-xs grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Campaign</span>
                    <span className="font-semibold text-gray-800 truncate block">
                      {selectedPitch.campaign_title || 'Collaboration'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Budget</span>
                    <span className="font-bold text-purple-700 block">
                      {selectedPitch.budget_range || 'Negotiable'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Deliverables</span>
                    <span className="font-medium text-gray-700 truncate block">
                      {selectedPitch.deliverables || 'As discussed'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400 block text-[10px] uppercase font-bold">Timeline</span>
                    <span className="font-medium text-gray-700 truncate block">
                      {selectedPitch.timeline || 'Flexible'}
                    </span>
                  </div>
                </div>

                {/* Concierge Mode Warning/Guidance Banner */}
                <div className="mt-3 p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900 flex items-start gap-2.5">
                  <ShieldCheck size={18} className="text-purple-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="font-semibold">Direct Concierge Mode Active:</strong>
                    <p className="text-purple-700 text-[11px] mt-0.5 leading-relaxed">
                      Replies sent below appear in <strong>{selectedPitch.brand.name}</strong>'s chat room directly as <strong>{selectedPitch.creator.name}</strong>. The brand interacts naturally without third-party disruption or distrust.
                    </p>
                  </div>
                </div>
              </div>

              {/* Chat Messages Stream */}
              <div className="flex-1 p-4 overflow-y-auto max-h-[380px] space-y-3 bg-[#FBFBFC]">
                {loadingMessages ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    <RefreshCw size={18} className="animate-spin text-purple-600 mx-auto mb-1.5" />
                    Loading conversation messages...
                  </div>
                ) : messages.length === 0 ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    <MessageSquare size={24} className="text-gray-300 mx-auto mb-1.5" />
                    No messages in this chat thread yet.
                  </div>
                ) : (
                  messages.map((m, idx) => {
                    const isFromCreator =
                      m.sender_role === 'creator' ||
                      m.sender_user_id === selectedPitch.creator_id ||
                      m.sender_id === selectedPitch.creator_id;

                    return (
                      <div
                        key={m.id || m.message_id || idx}
                        className={`flex flex-col ${isFromCreator ? 'items-end' : 'items-start'}`}
                      >
                        <div className="flex items-center gap-1.5 mb-1 px-1">
                          <span className="text-[10px] font-bold text-gray-600">
                            {isFromCreator ? selectedPitch.creator.name : selectedPitch.brand.name}
                          </span>
                          {m.is_admin_brokered && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.2 rounded-full bg-purple-100 text-purple-700 border border-purple-200">
                              Brokered by Admin
                            </span>
                          )}
                          <span className="text-[9px] text-gray-400">
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>

                        <div
                          className={`p-3 rounded-2xl text-xs max-w-[85%] whitespace-pre-wrap leading-relaxed ${
                            isFromCreator
                              ? 'bg-purple-600 text-white rounded-tr-none shadow-xs'
                              : 'bg-white text-gray-900 border border-gray-200 rounded-tl-none shadow-xs'
                          }`}
                        >
                          {m.text || m.content}
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Composer */}
              <div className="p-3 border-t border-gray-200 bg-white">
                <form onSubmit={handleSendReplyAsCreator} className="flex items-end gap-2">
                  <div className="flex-1">
                    <textarea
                      rows={2}
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReplyAsCreator();
                        }
                      }}
                      placeholder={`Reply as ${selectedPitch.creator.name} to ${selectedPitch.brand.name}... (Press Enter to send)`}
                      className="w-full text-xs p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={sendingReply || !replyText.trim()}
                    className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition shadow-xs shrink-0"
                  >
                    <Send size={13} className={sendingReply ? 'animate-spin' : ''} />
                    <span>Send as {selectedPitch.creator.name.split(' ')[0]}</span>
                  </button>
                </form>

                <div className="flex items-center justify-between text-[11px] text-gray-400 mt-2 px-1">
                  <span>Press Shift+Enter for new line</span>
                  <span>Brand will receive live push & socket notification</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center text-gray-400">
              <MessageSquare size={36} className="text-gray-300 mb-2" />
              <p className="text-sm font-semibold text-gray-700">Select a pitch from the list</p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                Click on any campaign brief on the left to view the conversation, inspect creator details, and reply directly as the creator.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Outreach Email Modal */}
      <Presence>{showEmailModal && emailModalPitch && (
        <PopupBackdrop className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <PopupPanel kind="modal" className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 relative">
            <h3 className="text-base font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Mail size={16} className="text-purple-600" /> Send Outreach Email to Creator
            </h3>
            <p className="text-xs text-gray-500 mb-4">
              Invite <strong>{emailModalPitch.creator.name}</strong> to review the paid campaign pitch from{' '}
              <strong>{emailModalPitch.brand.name}</strong>.
            </p>

            <form onSubmit={handleSendOutreachEmail} className="space-y-4 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Target Email
                </label>
                <input
                  type="email"
                  required
                  value={emailTarget}
                  onChange={(e) => setEmailTarget(e.target.value)}
                  placeholder="creator@example.com"
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-700 uppercase mb-1">
                  Custom Admin Note (Optional)
                </label>
                <textarea
                  rows={3}
                  value={emailCustomNote}
                  onChange={(e) => setEmailCustomNote(e.target.value)}
                  placeholder="e.g. We love your recent reels and have secured this budget for you..."
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:border-purple-500 text-xs"
                />
              </div>

              <div className="bg-purple-50 p-3 rounded-lg border border-purple-100 text-[11px] text-purple-900 space-y-1">
                <p>
                  <strong>Campaign:</strong> {emailModalPitch.campaign_title || 'Collaboration'}
                </p>
                <p>
                  <strong>Budget:</strong> {emailModalPitch.budget_range || 'Negotiable'}
                </p>
                <p>
                  The email includes a branded call to action button linking directly to the pitch!
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition flex items-center gap-1.5"
                >
                  <Send size={12} className={sendingEmail ? 'animate-spin' : ''} />
                  {sendingEmail ? 'Sending...' : 'Send Outreach Email'}
                </button>
              </div>
            </form>
          </PopupPanel>
        </PopupBackdrop>
      )}</Presence>
    </div>
  );
}
