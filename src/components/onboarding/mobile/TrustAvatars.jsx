import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../../lib/api";

// Session 39 (Ravi, M41): small round photos that keep rotating next to "Build trust with a clear
// photo…". Only the real creators the admin picked ("Show on creator home"); none → nothing shown.
export default function TrustAvatars({ size = 38 }) {
  const [photos, setPhotos] = useState([]);
  const [start, setStart] = useState(0);

  useEffect(() => {
    let alive = true;
    api.get("creators/home-picks")
      .then((r) => {
        const list = (r?.data?.picks || []).map((p) => p.picture).filter((u) => u && !String(u).includes("dicebear"));
        if (alive) setPhotos(list.slice(0, 4));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (photos.length < 2) return undefined;
    const t = setInterval(() => setStart((s) => (s + 1) % photos.length), 2200);
    return () => clearInterval(t);
  }, [photos.length]);

  if (photos.length === 0) return null;
  const shown = photos.map((_, i) => photos[(start + i) % photos.length]).slice(0, Math.min(4, photos.length));
  return (
    <div className="flex items-center" data-testid="trust-avatars" aria-hidden="true">
      <AnimatePresence initial={false} mode="popLayout">
        {shown.map((src, i) => (
          <motion.img
            key={src}
            layout
            src={src}
            alt=""
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.35 }}
            style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -8, zIndex: 10 - i }}
            className="rounded-full object-cover border-2 border-white bg-[#F2F2F7]"
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
