import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";

// No hardcoded brand logos (Ravi, session 27): only brands the admin adds in Landing Content.
// With none, the globe shows empty nodes. (This section is not on the landing page today.)

// Moved to component

export default function BrandGlobeSection() {
  const [dynamicLogos, setDynamicLogos] = useState([]);

  useEffect(() => {
    api.get("/landing-brands").then((res) => {
      if (res.data && res.data.length > 0) {
        const mapped = res.data.map(b => ({
          name: b.name,
          svg: <img src={b.logo_url} alt={b.name} className="w-8 h-8 object-contain" />
        }));
        setDynamicLogos(mapped);
      }
    }).catch(console.error);
  }, []);

  const effectiveLogos = dynamicLogos.length > 0 ? dynamicLogos : Array.from({ length: 12 }, () => ({ name: "", svg: null }));

  const TOTAL_NODES = effectiveLogos.length;
  const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;

  const SPHERE_NODES = effectiveLogos.map((brand, i) => {
    const y = TOTAL_NODES > 1 ? 1 - (i / (TOTAL_NODES - 1)) * 2 : 0; // y from +1 to -1
    const radius = Math.sqrt(1 - y * y); // radius at y
    const theta = (2 * Math.PI * i) / GOLDEN_RATIO;

    return {
      x: Math.cos(theta) * radius,
      y: y,
      z: Math.sin(theta) * radius,
      brand
    };
  });


  const [rotationY, setRotationY] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastMouseX = useRef(0);

  // Continuous ultra-slow spin
  useEffect(() => {
    let animationFrameId;

    const animate = () => {
      if (!isHovered && !isDragging) {
        setRotationY((prev) => (prev + 0.002) % (Math.PI * 2));
      }
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHovered, isDragging]);

  // Drag interaction to manually rotate the globe
  const handleMouseDown = (e) => {
    setIsDragging(true);
    lastMouseX.current = e.clientX;
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const deltaX = e.clientX - lastMouseX.current;
    lastMouseX.current = e.clientX;
    setRotationY((prev) => prev + deltaX * 0.004);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e) => {
    setIsDragging(true);
    if (e.touches.length > 0) {
      lastMouseX.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length === 0) return;
    const deltaX = e.touches[0].clientX - lastMouseX.current;
    lastMouseX.current = e.touches[0].clientX;
    setRotationY((prev) => prev + deltaX * 0.004);
  };

  // Tilt around X-axis (~15 degrees = 0.25 rad)
  const TILT_X = 0.25;

  return (
    <section className="relative py-16 sm:py-24 overflow-hidden bg-white border-t border-gray-100">
      
      <div className="max-w-none px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* 2-Column Grid: Text Left, Globe Right */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-8 items-center">

          {/* LEFT COLUMN: Text Content & CTAs */}
          <div className="lg:col-span-5 text-center lg:text-left flex flex-col items-center lg:items-start justify-center">
            
            {/* Subtitle / Main Headline */}
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


          {/* RIGHT COLUMN: 3D GLOBE SPHERE STAGE */}
          <div className="lg:col-span-7 flex items-center justify-center relative">
            <div
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => {
                setIsHovered(false);
                setIsDragging(false);
              }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleMouseUp}
              className="relative w-full h-[480px] sm:h-[550px] lg:h-[620px] flex items-center justify-center cursor-grab active:cursor-grabbing select-none overflow-hidden"
              style={{ perspective: "900px" }}
            >
              {/* Spherical Soft Light Mesh Gradient Background */}
              <div className="absolute w-[320px] h-[320px] sm:w-[440px] sm:h-[440px] lg:w-[500px] lg:h-[500px] rounded-full bg-[radial-gradient(circle_at_35%_35%,_rgba(224,242,254,0.35)_0%,_rgba(207,250,254,0.22)_35%,_rgba(220,252,231,0.18)_70%,_rgba(255,255,255,0)_100%)] blur-xl pointer-events-none -z-10" />

              {/* 3D Sphere Surface Container with Preserve-3D */}
              <div 
                className="relative w-full h-full flex items-center justify-center pointer-events-none"
                style={{ transformStyle: "preserve-3d" }}
              >
                {SPHERE_NODES.map((pt, idx) => {
                  // 1. Rotate Y
                  const x1 = pt.x * Math.cos(rotationY) + pt.z * Math.sin(rotationY);
                  const y1 = pt.y;
                  const z1 = -pt.x * Math.sin(rotationY) + pt.z * Math.cos(rotationY);

                  // 2. Tilt X
                  const x2 = x1;
                  const y2 = y1 * Math.cos(TILT_X) - z1 * Math.sin(TILT_X);
                  const z2 = y1 * Math.sin(TILT_X) + z1 * Math.cos(TILT_X);

                  // DEPTH CULLING: Show nodes in front hemisphere and horizon (z2 >= -0.1)
                  if (z2 < -0.1) return null;

                  // Sphere Radius in pixels
                  const radiusPx = typeof window !== 'undefined' && window.innerWidth < 640 ? 165 : window.innerWidth < 1024 ? 210 : 235;

                  const screenX = x2 * radiusPx;
                  const screenY = y2 * radiusPx;
                  const screenZ = z2 * radiusPx;

                  // Full 100% Surface Normal Angle Rotations
                  const r_xz = Math.sqrt(x2 * x2 + z2 * z2);
                  const rotYDeg = Math.atan2(x2, z2) * (180 / Math.PI);
                  const rotXDeg = -Math.atan2(y2, r_xz) * (180 / Math.PI);

                  // Fade out smoothly near the edges/back horizon
                  const opacity = Math.min(1, Math.max(0, (z2 + 0.1) / 0.3));
                  const zIndex = Math.round((z2 + 1) * 100);

                  return (
                    <div
                      key={idx}
                      style={{
                        transform: `translate3d(${screenX}px, ${screenY}px, ${screenZ}px) rotateY(${rotYDeg}deg) rotateX(${rotXDeg}deg)`,
                        opacity: opacity,
                        zIndex: zIndex,
                        transformStyle: "preserve-3d",
                      }}
                      className="absolute transition-transform ease-out duration-75 flex flex-col items-center group pointer-events-auto"
                    >
                      {/* White Circular Badge Container lying flat on sphere surface */}
                      <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-13 lg:h-13 rounded-full bg-white border border-gray-100/90 shadow-[0_5px_14px_rgba(0,0,0,0.05)] flex items-center justify-center p-2 sm:p-2.5 transition-all duration-300 group-hover:scale-130 group-hover:shadow-2xl group-hover:border-emerald-300">
                        {pt.brand.svg}
                      </div>

                      {/* Tooltip Label */}
                      <span className="mt-1 px-2.5 py-0.5 rounded-full bg-[#0A0A0A] text-white text-[10px] sm:text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none shadow-md whitespace-nowrap">
                        {pt.brand.name}
                      </span>
                    </div>
                  );
                })}
              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
}
