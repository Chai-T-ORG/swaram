"use client";

import React, { useState, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * CharReveal: splits text into individual characters and animates them upwards in a stagger.
 */
export function CharReveal({ text, className = "" }: { text: string; className?: string }) {
  const shouldReduce = useReducedMotion();

  if (shouldReduce) {
    return <span className={className}>{text}</span>;
  }

  const chars = text.split("");

  const container = {
    hidden: {},
    visible: {
      transition: {
        staggerChildren: 0.02,
      },
    },
  };

  const child = {
    hidden: { y: "70%", opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring" as const,
        stiffness: 220,
        damping: 22,
      },
    },
  };

  return (
    <motion.span
      className={`inline-block overflow-hidden ${className}`}
      variants={container}
      initial="hidden"
      animate="visible"
    >
      {chars.map((char, index) => (
        <motion.span
          key={index}
          variants={child}
          className="inline-block"
          style={{ whiteSpace: char === " " ? "pre" : "normal" }}
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
}

/**
 * TiltCard: Wraps components, providing a lightweight 3D hover tilt effect for mouse pointer users.
 */
export function TiltCard({
  children,
  className = "",
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  const shouldReduce = useReducedMotion();
  const [coords, setCoords] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  if (shouldReduce) {
    return (
      <div className={className} onClick={onClick}>
        {children}
      </div>
    );
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Calculate rotation coordinates (-4deg to 4deg)
    const x = ((e.clientX - rect.left) / width - 0.5) * 8;
    const y = ((rect.top - e.clientY) / height + 0.5) * 8;

    setCoords({ x, y });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setCoords({ x: 0, y: 0 });
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`${className} transition-all duration-200 ease-out`}
      style={{
        transform: isHovered
          ? `perspective(1000px) rotateX(${coords.y}deg) rotateY(${coords.x}deg) scale3d(1.015, 1.015, 1.015)`
          : "perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
        transformStyle: "preserve-3d",
      }}
    >
      <div style={{ transform: "translateZ(8px)", transformStyle: "preserve-3d" }}>
        {children}
      </div>
    </div>
  );
}
