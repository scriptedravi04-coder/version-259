import React, { useEffect, useRef, useState } from "react";
import { safeArray } from "../../utils/safeFormat";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

// No hardcoded brand logos (Ravi, session 27): the grid shows only the brands the admin adds in
// Landing Content (/landing-brands). With none, the tiles stay empty.

// Moved to component


export default function BrandGridSection() {
  const [dynamicLogos, setDynamicLogos] = useState([]);

  useEffect(() => {
    api.get("/landing-brands").then((res) => {
      if (res.data && res.data.length > 0) {
        const mapped = res.data.map(b => ({
          name: b.name,
          svg: <img src={b.logo_url} alt={b.name} className="w-8 h-8 sm:w-10 sm:h-10 object-contain" />
        }));
        setDynamicLogos(mapped);
      }
    }).catch(console.error);
  }, []);

  const effectiveLogos = dynamicLogos.length > 0 ? dynamicLogos : [{ name: "", svg: null }];

  // Fill grid (5 columns, approx 4 items each = 20 items)
  const gridItems = [];
  for (let i = 0; i < 20; i++) {
    gridItems.push(effectiveLogos[i % effectiveLogos.length]);
  }

  const cols = [
    { items: gridItems.slice(0, 4), offset: 'mt-12 sm:mt-16' },
    { items: gridItems.slice(4, 8), offset: 'mt-0' },
    { items: gridItems.slice(8, 12), offset: 'mt-8 sm:mt-10' },
    { items: gridItems.slice(12, 16), offset: 'mt-2 sm:mt-4' },
    { items: gridItems.slice(16, 20), offset: 'mt-16 sm:mt-24' }
  ];

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden bg-white border-t border-gray-100">
      <div className="max-w-none px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* 2-Column Grid: Text Left, Float Grid Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">
          
          {/* LEFT COLUMN: Text Content */}
          <div className="lg:col-span-5 text-center lg:text-left flex flex-col items-center lg:items-start justify-center relative z-20">
            <motion.h2
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-display text-3xl sm:text-4xl lg:text-[42px] font-extrabold text-[#0A0A0A] leading-[1.25] tracking-tight max-w-xl"
            >
              Building <span className="bg-gradient-to-r from-[#7C3AED] via-[#9333EA] to-[#6366F1] bg-clip-text text-transparent">Meaningful Collaborations</span> with Brands, Businesses, and Partners Across Industries.
            </motion.h2>
          </div>

          {/* RIGHT COLUMN: Float Grid */}
          <div className="lg:col-span-7 flex items-center justify-center relative min-h-[400px] sm:min-h-[500px] lg:min-h-[600px] w-full">
            
            {/* Fade Mask Container */}
            <div
              className="absolute inset-0 flex justify-center gap-4 sm:gap-6 lg:gap-8 scale-90 sm:scale-100 lg:scale-110"
              style={{
                maskImage: 'radial-gradient(circle at center, black 40%, transparent 85%)',
                WebkitMaskImage: 'radial-gradient(circle at center, black 40%, transparent 85%)'
              }}
            >
              {cols.map((col, colIdx) => (
                <div
                  key={colIdx}
                  className={`flex flex-col gap-4 sm:gap-6 lg:gap-8 ${col.offset}`}
                >
                  { safeArray(col.items).map((brand, itemIdx) => (
                    <motion.div
                      key={itemIdx}
                      animate={{ y: [0, -12, 0] }}
                      transition={{
                        duration: 5 + (colIdx % 3),
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: (colIdx * 0.3) + (itemIdx * 0.2)
                      }}
                      className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 bg-white rounded-xl sm:rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.04)] flex items-center justify-center p-1.5 sm:p-2 border border-gray-50/50 hover:scale-105 transition-transform cursor-default"
                    >
                      <div className="w-full h-full flex items-center justify-center [&>svg]:max-w-full [&>svg]:max-h-full [&>img]:max-w-full [&>img]:max-h-full object-contain">
                        {brand.svg}
                      </div>
                    </motion.div>
                  ))}
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
