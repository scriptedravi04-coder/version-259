import React from "react";
import { ShortlistCongratsCard, CreatorApplicationOfferCard, InviteThanksCard } from "./ShortlistCards";
import { motion } from "framer-motion";
import { Building2 } from "lucide-react";
import SystemMessage from "./SystemMessage";
import OfferCard from "./OfferCard";
import ContentProofNotice from "./ContentProofNotice";

export default function MessageBubble({ message, isMine, isUserBrand, threadId, thread, campaignTitle, onActionComplete, onViewContract, onNegotiate, onSelectUploadTab, onViewInvoice, onTriggerReview, onDownloadInvoice, partnerPic, partnerName, allMessages }) {
  const msgType = message.message_type || message.type || message.metadata?.action || '';
  const msgContent = message.content || message.text || '';
  
  const isPaymentApprovedMsg = 
    msgType === 'payment_trigger' || 
    msgType === 'payment_released' || 
    msgType === 'payout_released' || 
    msgType === 'live_links_approved' || 
    message.metadata?.action === 'live_links_approved' || 
    message.metadata?.action === 'payment_released' || 
    message.metadata?.action === 'payout_released' || 
    message.metadata?.action === 'PAYOUT_RELEASED' || 
    msgContent.includes("Deliverables Approved & Payment Released") || 
    msgContent.includes("payout is being processed via Escrow") || 
    msgContent.includes("Payment Released & Approved") || 
    msgContent.includes("Payout Released") || 
    msgContent.includes("Payout Disbursed") || 
    msgContent.includes("Invoice generated and payment has been processed");

  const isSystem = 
    isPaymentApprovedMsg ||
    msgType === 'system' || 
    msgType === 'creator_signed' || 
    msgType === 'brand_signed' || 
    msgType === 'agreement_executed' || 
    msgType === 'payment_secured' || 
    msgType === 'contract_signing' || 
    msgType === 'payment_funded' || 
    msgType === 'live_links_submitted' || 
    msgType === 'live_links_resubmit_request' || 
    msgType === 'live_links_resubmit_declined' || 
    msgType === 'chat_closed' || 
    msgType === 'order_cancelled' || 
    msgType === 'content_approved' ||
    message.sender_role === 'system';
  const isOffer = message.message_type === 'offer' || message.message_type === 'negotiation_offer';
  const isContentProof = message.message_type === 'content_proof_submitted' || message.message_type === 'CHANGES_REQUESTED' || message.message_type === 'revision_requested' || message.message_type === 'revision_declined';

  // Shortlist and Direct Invitation cards. Checked before isSystem, which would otherwise swallow them.
  //
  // Alignment comes from isMine, exactly like a normal message: the brand sees its own
  // congratulations/invitation on the right and the creator's offer on the left, and the creator sees
  // the mirror of that. Pinning either card to a fixed side would be wrong for one of them.
  const isShortlistOrInviteCard =
    msgType === 'campaign_approved' ||
    msgType === 'creator_application_offer' ||
    msgType === 'brand_invitation_card' ||
    msgType === 'creator_invitation_acceptance' ||
    msgType === 'brand_invitation_offer' ||
    msgType === 'pitch_invite';

  // Direct invitation: the creator's automatic thank-you is a card too (session 27).
  const inviteMeta = typeof message?.metadata === 'string' ? (() => { try { return JSON.parse(message.metadata); } catch { return {}; } })() : (message?.metadata || {});
  if (inviteMeta?.action === 'invite_greeting') {
    return (
      <div className={`flex ${isMine ? "justify-end" : "justify-start"} my-4 px-2`}>
        <InviteThanksCard message={{ ...message, metadata: inviteMeta }} campaignTitle={campaignTitle} />
      </div>
    );
  }

  if (isShortlistOrInviteCard) {
    const isBrandCard = msgType === 'campaign_approved' || msgType === 'brand_invitation_card' || msgType === 'pitch_invite';
    const justifyClass = isMine ? "justify-end" : "justify-start";
    return (
      <div className={`flex ${justifyClass} my-4 px-2`}>
        {isBrandCard ? (
          <ShortlistCongratsCard message={message} campaignTitle={campaignTitle} />
        ) : (
          <CreatorApplicationOfferCard
            message={message}
            isUserBrand={isUserBrand}
            campaignTitle={campaignTitle}
            onNegotiate={onNegotiate}
            onAccept={() => {
              if (onViewContract) {
                const m = message?.metadata || {};
                const amount = Number(m.proposed_fee ?? m.amount ?? 0);
                onViewContract({
                  amount: amount,
                  campaign_title: m.campaign_title || campaignTitle,
                  deliverable: m.deliverable,
                  timeline: m.timeline
                });
              } else if (onNegotiate) {
                onNegotiate();
              }
            }}
            allMessages={allMessages}
            thread={thread}
          />
        )}
      </div>
    );
  }

  if (isSystem) {
    return (
      <SystemMessage 
        message={message} 
        isUserBrand={isUserBrand} 
        threadId={threadId} 
        campaignTitle={campaignTitle} 
        onActionComplete={onActionComplete} 
        thread={thread}
        isMine={isMine} 
        onViewContract={onViewContract}
        onNegotiate={onNegotiate}
        onSelectUploadTab={onSelectUploadTab}
        onViewInvoice={onViewInvoice}
        onTriggerReview={onTriggerReview}
        onDownloadInvoice={onDownloadInvoice}
        allMessages={allMessages}
      />
    );
  }

  if (isOffer) {
    return (
      <OfferCard 
        message={message} 
        threadId={threadId} 
        thread={thread}
        campaignTitle={campaignTitle} 
        onActionComplete={onActionComplete} 
        isMine={isMine} 
        isUserBrand={isUserBrand}
        onViewContract={onViewContract}
        onNegotiate={onNegotiate}
        allMessages={allMessages}
      />
    );
  }

  if (isContentProof) {
    const justifyClass = isMine ? "justify-end" : "justify-start";
    return (
      <motion.div 
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className={`flex ${justifyClass} my-4 px-2`}
      >
        {!isMine && (
          <div className="w-8 h-8 rounded-full overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center mr-3 flex-shrink-0 mt-auto mb-1 border border-[var(--border-default)] shadow-sm">
            {partnerPic ? (
              <img src={partnerPic} alt={partnerName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">
                {(partnerName || "U").charAt(0)}
              </span>
            )}
          </div>
        )}
        
        <ContentProofNotice 
          message={message} 
          isUserBrand={isUserBrand} 
          threadId={threadId} 
          thread={thread}
          allMessages={allMessages}
          onActionComplete={onActionComplete} 
        />
      </motion.div>
    );
  }

  const isBrandSender = message.sender_role === 'brand';
  const justifyClass = isMine ? "justify-end" : "justify-start";
  const roundedCorners = isMine ? "rounded-3xl rounded-br-sm" : "rounded-3xl rounded-bl-sm";
  
  const bubbleBg = isMine
    ? "bg-[var(--violet)] text-white font-semibold"
    : "bg-white dark:bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-default)] shadow-sm";
     
  const timeTextClass = "text-inherit opacity-60 text-right mt-1";

  return (
    <motion.div 
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.15 }}
      className={`flex ${justifyClass} my-1 md:my-3`}
    >
      {!isMine && (
        <div className="w-6 h-6 md:w-8 md:h-8 rounded-full overflow-hidden bg-[var(--bg-elevated)] flex items-center justify-center mr-1.5 md:mr-3 flex-shrink-0 mt-auto mb-0.5 border border-[var(--border-default)] shadow-xs">
          {partnerPic ? (
            <img src={partnerPic} alt={partnerName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] md:text-xs font-bold text-[var(--text-secondary)] uppercase">
              {(partnerName || "U").charAt(0)}
            </span>
          )}
        </div>
      )}
      <div className={`max-w-[85%] md:max-w-[75%] px-2.5 py-2 md:px-5 md:py-3.5 text-[13px] md:text-sm leading-relaxed whitespace-pre-wrap shadow-sm md:shadow-lg ${bubbleBg} ${roundedCorners}`}>
        {message.content || message.text}
        <div className={`text-[9px] md:text-[10px] mt-0.5 tracking-wider ${timeTextClass}`}>
          {new Date(message.created_at).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"})}
        </div>
      </div>
    </motion.div>
  );
}
