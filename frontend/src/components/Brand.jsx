import { motion } from 'motion/react';

// The intro logo and the header logo share this id, so Motion flies one into the other.
const LOGO_ID = 'brand-logo';
const LOGO_SRC = '/brand/logo-512.webp';

export function BrandMark({ size = 40 }) {
  return (
    <motion.img
      layoutId={LOGO_ID}
      src={LOGO_SRC}
      alt=""
      width={size}
      height={size}
      className="brand-mark"
      transition={{ type: 'spring', stiffness: 260, damping: 28 }}
    />
  );
}

const WORD = 'PharmGraph';

export function Intro({ onDone }) {
  return (
    <motion.div
      className="intro-screen"
      role="presentation"
      onClick={onDone}
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, ease: 'easeOut' } }}
    >
      <div className="intro-stage">
        {[0, 1, 2].map((ring) => (
          <motion.span
            key={ring}
            className="intro-ring"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: [0.4, 1.9], opacity: [0, 0.55, 0] }}
            transition={{ duration: 1.2, delay: 0.1 + ring * 0.22, ease: 'easeOut' }}
          />
        ))}
        <motion.div
          initial={{ scale: 0.55, opacity: 0, rotate: -18, filter: 'blur(12px)' }}
          animate={{ scale: 1, opacity: 1, rotate: 0, filter: 'blur(0px)' }}
          transition={{ type: 'spring', stiffness: 180, damping: 18 }}
        >
          <BrandMark size={200} />
        </motion.div>
        <p className="intro-word" aria-label="PharmGraph AI">
          {[...WORD].map((letter, i) => (
            <motion.span
              key={i}
              initial={{ y: 18, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25 + i * 0.03, type: 'spring', stiffness: 260, damping: 20 }}
            >
              {letter}
            </motion.span>
          ))}
          <motion.span
            className="intro-ai"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, type: 'spring' }}
          >
            AI
          </motion.span>
        </p>
        <motion.p
          className="intro-tag"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          Every interaction, with its source.
        </motion.p>
      </div>
    </motion.div>
  );
}
