"use client";
import React from "react";
import Link from "next/link";
import { FaGithub } from "react-icons/fa";

const FOOTER_LINKS = [
  { label: 'Markets', href: '/markets' },
  { label: 'Arena', href: '/arena' },
  { label: 'AI Agents', href: '/ai-agents' },
  { label: 'Leaderboard', href: '/leaderboard' },
];

const Footer = () => {
  return (
    <footer className="arcade-footer-grey">
      <div className="footer-content">
        <div className="footer-title-red">
          Warriors AI-rena
        </div>
        <nav className="flex items-center justify-center gap-2 flex-wrap text-[8px] sm:text-[10px]" style={{ fontFamily: 'Press Start 2P, monospace' }}>
          {FOOTER_LINKS.map((link, i) => (
            <React.Fragment key={link.href}>
              {i > 0 && <span className="text-gray-500">·</span>}
              <Link
                href={link.href}
                className="text-gray-400 hover:text-yellow-400 focus:text-yellow-400 focus:outline-none transition-colors"
              >
                {link.label}
              </Link>
            </React.Fragment>
          ))}
        </nav>
        <p
          className="text-gray-500 mt-2 text-[7px] sm:text-[9px]"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          AI-Powered Blockchain Battle Arena
        </p>
        <div className="footer-links">
          © {new Date().getFullYear()}
          <a
            href="https://github.com/yug49/WarriorsAI-rena"
            target="_blank"
            rel="noopener noreferrer"
            className="footer-link"
            aria-label="GitHub repository"
          >
            <FaGithub className="footer-icon" />
          </a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
