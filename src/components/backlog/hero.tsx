'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Loader2, Download } from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Floating particles for background ambience                        */
/* ------------------------------------------------------------------ */
function Particles() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    size: Math.random() * 4 + 1,
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: Math.random() * 12 + 8,
    delay: Math.random() * 4,
    color: i % 3 === 0 ? '#84ff00' : i % 3 === 1 ? '#b026ff' : '#ff3366',
  }))

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full opacity-20"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
            background: p.color,
            boxShadow: `0 0 ${p.size * 3}px ${p.color}`,
          }}
          animate={{
            y: [0, -40, 0],
            x: [0, 20, 0],
            opacity: [0.15, 0.4, 0.15],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Hero section                                                      */
/* ------------------------------------------------------------------ */
export default function Hero() {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDownload = useCallback(async () => {
    setDownloading(true)
    setError(null)
    try {
      const res = await fetch('/api/download-extension')
      if (!res.ok) throw new Error('No se pudo descargar el archivo')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'backlog-maldito-v1.2.0.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      setError('Error al descargar. Intenta de nuevo.')
    } finally {
      setDownloading(false)
    }
  }, [])

  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-4 py-20 overflow-hidden">
      {/* Background layers */}
      <div className="absolute inset-0 bg-gradient-to-b from-arcade-black via-[#0d0d2a] to-arcade-black" />
      <div className="absolute inset-0 retro-grid" />

      {/* Gradient orbs */}
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full opacity-10 blur-[120px]"
        style={{ background: 'radial-gradient(circle, #b026ff 0%, transparent 70%)', top: '-10%', left: '50%', transform: 'translateX(-50%)' }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.08, 0.15, 0.08] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full opacity-10 blur-[80px]"
        style={{ background: 'radial-gradient(circle, #84ff00 0%, transparent 70%)', bottom: '10%', right: '10%' }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.06, 0.12, 0.06] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
      />

      <Particles />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8 text-center max-w-3xl">
        {/* Logo placeholder */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.2 }}
          className="w-24 h-24 sm:w-28 sm:h-28 rounded-xl flex items-center justify-center font-pixel text-2xl sm:text-3xl font-bold pulse-glow-purple"
          style={{
            background: 'linear-gradient(135deg, #b026ff 0%, #8a1fd4 100%)',
            border: '3px solid rgba(176,38,255,0.5)',
            color: '#e8e6e3',
            boxShadow: '0 0 30px rgba(176,38,255,0.3)',
          }}
        >
          BM
        </motion.div>

        {/* Version badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <span className="arcade-badge">
            <span className="inline-block w-2 h-2 rounded-full bg-neon-lime animate-pulse" />
            v1.2.0 — RAWG API + Side Panel
          </span>
        </motion.div>

        {/* Title with glitch */}
        <motion.h1
          className="font-pixel text-2xl sm:text-4xl md:text-5xl leading-tight glitch-text relative neon-text-purple"
          data-text="BACKLOG MALDITO"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
        >
          BACKLOG MALDITO
        </motion.h1>

        {/* Subtitle */}
        <motion.p
          className="text-base sm:text-lg md:text-xl text-ghost-white/70 max-w-xl leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Tu radar oscuro de videojuegos pendientes.
        </motion.p>

        {/* Feature pills */}
        <motion.div
          className="flex flex-wrap justify-center gap-2 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
        >
          {['RAWG API', 'Side Panel', 'FAB Global', '9 Tipos de Contenido', 'Auto-Enrichment'].map((tag) => (
            <span
              key={tag}
              className="px-3 py-1.5 text-xs font-pixel rounded border border-neon-purple/30 bg-neon-purple/5 text-neon-purple/80"
            >
              {tag}
            </span>
          ))}
        </motion.div>

        {/* Download button */}
        <motion.div
          className="mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="pixel-btn text-sm sm:text-base"
          >
            {downloading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                DESCARGANDO...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                INSTALAR EN CHROME
              </>
            )}
          </button>
          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mt-3 text-sm text-red-400 font-pixel"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Chrome install hint */}
        <motion.p
          className="text-xs text-dim-gray mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
        >
          Chrome Extension v1.2.0 (~40 KB) — Instalación manual en 6 pasos
        </motion.p>
      </div>

      {/* Scroll indicator */}
      <motion.div
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-dim-gray"
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      >
        <span className="text-xs font-pixel tracking-wider">SCROLL</span>
        <ChevronDown className="w-5 h-5" />
      </motion.div>
    </section>
  )
}
