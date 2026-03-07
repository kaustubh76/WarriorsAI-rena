'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useWarriorMessage } from '../contexts/WarriorMessageContext';
import { getWarriorMessage, getRandomMessage, WARRIOR_MESSAGES } from '../utils/warriorMessages';

const ANIMATION_FRAME_COUNT = 6;
const ANIMATION_INTERVAL_MS = 120;
const WELCOME_DISPLAY_MS = 6000;

const WARRIOR_FRAMES = Array.from(
  { length: ANIMATION_FRAME_COUNT },
  (_, i) => `/warrior/Warrior_Idle_${i + 1}.png`
);

const WarriorAssistant: React.FC = () => {
  const [currentFrame, setCurrentFrame] = useState(0);
  const [showWelcome, setShowWelcome] = useState(true);
  const [welcomeMessage, setWelcomeMessage] = useState<string>('');
  const { currentMessage, isVisible } = useWarriorMessage();

  // Set welcome message once on component mount
  useEffect(() => {
    setWelcomeMessage(getRandomMessage(WARRIOR_MESSAGES.WELCOME));
  }, []);

  // Cycle through warrior frames for idle animation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentFrame((prev) => (prev + 1) % ANIMATION_FRAME_COUNT);
    }, ANIMATION_INTERVAL_MS);

    return () => clearInterval(interval);
  }, []);

  // Hide welcome message after 6 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setShowWelcome(false);
    }, WELCOME_DISPLAY_MS);

    return () => clearTimeout(timer);
  }, []);

  // Display message (welcome or context message)
  const displayMessage = currentMessage && isVisible ? currentMessage.text : 
                        showWelcome ? welcomeMessage : null;

  return (
    <div className="warrior-assistant">
      {/* Warrior Model */}
      <motion.div
        className="warrior-container warrior-entrance"
        initial={{ opacity: 0, y: 50, scale: 0.8 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <img
          src={WARRIOR_FRAMES[currentFrame]}
          alt="Warrior Assistant"
          className="warrior-sprite"
        />
      </motion.div>

      {/* Speech Bubble */}
      <AnimatePresence>
        {displayMessage && (
          <motion.div
            className="warrior-speech-bubble"
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            {/* Speech Bubble */}
            <div className="speech-bubble-content">
              {/* Pixelated cloud effect background */}
              <div className="pixelated-cloud-overlay" />
              
              {/* Text content */}
              <motion.p 
                className="speech-bubble-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                {displayMessage}
              </motion.p>

              {/* Speech bubble tail */}
              <div className="speech-bubble-tail">
                <div className="speech-bubble-tail-border">
                  <div className="speech-bubble-tail-fill"></div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default WarriorAssistant;
