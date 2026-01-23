<template>
  <div class="chatbot-wrapper">
    <!-- Floating Toggle Button -->
    <button class="chat-toggle-btn" @click="toggleChat" v-if="!isOpen">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>
    </button>

    <!-- Full Screen Overlay -->
    <div class="chatbot-overlay" :class="{ active: isOpen }">
      <div class="chatbot-container">
        <!-- Header -->
        <div class="call-header">
          <div class="call-status">
            <div class="call-indicator" :class="{ active: conversationActive }"></div>
            <span>{{ conversationActive ? statusText : 'AI PC Protect Agent' }}</span>
          </div>
          <button class="close-call-button" @click="closeChat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Main Content -->
        <div class="call-content">
          <!-- Agent Avatar -->
          <div class="agent-avatar-container">
            <div class="agent-avatar" :class="{ speaking: currentStatus === 'speaking' }">
              <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </div>

            <!-- Audio Waveform -->
            <div class="audio-waveform" :class="{ active: currentStatus === 'speaking' }">
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
              <div class="wave-bar"></div>
            </div>
          </div>

          <!-- Status Indicators -->
          <div v-if="conversationActive" class="status-area">
            <div v-if="currentStatus === 'listening'" class="listening-indicator">
              <div class="listening-dot"></div>
              <span class="listening-text">Listening...</span>
            </div>

            <div v-if="currentStatus === 'processing'" class="thinking-indicator">
              <div class="thinking-dot"></div>
              <div class="thinking-dot"></div>
              <div class="thinking-dot"></div>
              <span class="thinking-text">Thinking...</span>
            </div>
          </div>

          <div v-else class="agent-intro">
            <h2>AI PC Protect Agent</h2>
            <p>Your real-time security assistant for proactive PC protection.</p>
            <div class="agent-pill-list">
              <span>Threat monitoring</span>
              <span>Wi-Fi credential safety</span>
              <span>Hidden extension alerts</span>
              <span>Ransomware defenses</span>
            </div>
          </div>

          <!-- Captions Area (Teleprompter Style) -->
          <div class="call-captions" ref="captionsContainer">
            <div class="captions-fade-top"></div>
            <div class="captions-fade-bottom"></div>
            <div class="captions-scroll" ref="captionsScroll">
              <div class="captions-spacer"></div>
              <div class="caption-lines-wrapper">
                <p
                  v-for="(line, index) in captionLines"
                  :key="index"
                  class="caption-line"
                  :class="{ 'is-current': index === captionLines.length - 1 }"
                >{{ line }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Controls -->
        <div class="call-controls">
          <button
            v-if="!conversationActive"
            class="start-call-btn"
            @click="startConversation"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            <span>Start Conversation</span>
          </button>

          <template v-else>
            <button
              class="call-control-btn"
              :class="{ muted: isMuted }"
              @click="isMuted = !isMuted"
              title="Toggle mute"
            >
              <svg v-if="!isMuted" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <line x1="23" y1="9" x2="17" y2="15"></line>
                <line x1="17" y1="9" x2="23" y2="15"></line>
              </svg>
            </button>

            <button class="hangup-btn" @click="stopConversation" title="End conversation">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
              </svg>
            </button>

            <button
              class="call-control-btn"
              :class="{ active: currentStatus === 'listening' }"
              @click="toggleListening"
              title="Toggle microphone"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="23"></line>
                <line x1="8" y1="23" x2="16" y2="23"></line>
              </svg>
            </button>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'

const apiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const buildApiUrl = (path) => `${apiBase}${path}`

const isOpen = ref(true)
const isMuted = ref(false)

// Conversation state
const conversationActive = ref(false)
const currentStatus = ref('idle') // 'idle', 'listening', 'processing', 'speaking'
const currentCaption = ref('')

// Teleprompter caption refs
const captionsScroll = ref(null)
const captionsContainer = ref(null)
let scrollAnimationFrame = null

// Line-by-line reveal for speech sync
const visibleLineCount = ref(0)
let lineRevealTimeout = null
const WORDS_PER_LINE = 5
const MS_PER_WORD = 450 // ~133 words per minute speaking pace

// Split caption into lines
const allCaptionLines = computed(() => {
  if (!currentCaption.value) return []
  const words = currentCaption.value.split(' ').filter(w => w.length > 0)
  const lines = []
  for (let i = 0; i < words.length; i += WORDS_PER_LINE) {
    lines.push(words.slice(i, i + WORDS_PER_LINE).join(' '))
  }
  return lines
})

// Only show lines up to visibleLineCount
const captionLines = computed(() => {
  return allCaptionLines.value.slice(0, visibleLineCount.value)
})

// Schedule next line reveal based on word count
const scheduleNextLine = () => {
  if (lineRevealTimeout) {
    clearTimeout(lineRevealTimeout)
    lineRevealTimeout = null
  }

  if (visibleLineCount.value >= allCaptionLines.value.length) {
    return
  }

  // Calculate delay based on words in current line
  const currentLine = allCaptionLines.value[visibleLineCount.value]
  const wordCount = currentLine ? currentLine.split(' ').length : WORDS_PER_LINE
  const delay = wordCount * MS_PER_WORD

  lineRevealTimeout = setTimeout(() => {
    if (currentStatus.value === 'speaking' || currentStatus.value === 'processing') {
      visibleLineCount.value++
      scheduleNextLine()
    }
  }, delay)
}

// Watch for new lines and start revealing
watch(allCaptionLines, (newLines, oldLines) => {
  const oldLen = oldLines?.length || 0
  const newLen = newLines.length

  // If caption was cleared, reset
  if (newLen === 0) {
    visibleLineCount.value = 0
    if (lineRevealTimeout) {
      clearTimeout(lineRevealTimeout)
      lineRevealTimeout = null
    }
    return
  }

  // If this is first content or we were waiting, show first line immediately
  if (oldLen === 0 && newLen > 0) {
    visibleLineCount.value = 1
    scheduleNextLine()
  }
  // If new lines added and we've caught up, continue revealing
  else if (newLen > oldLen && visibleLineCount.value >= oldLen && !lineRevealTimeout) {
    scheduleNextLine()
  }
}, { deep: true })

// Handle status changes
watch(currentStatus, (status) => {
  if (status === 'speaking' && allCaptionLines.value.length > 0) {
    // Start revealing if not already
    if (visibleLineCount.value === 0) {
      visibleLineCount.value = 1
    }
    if (!lineRevealTimeout) {
      scheduleNextLine()
    }
  } else if (status !== 'speaking' && status !== 'processing') {
    // Show all remaining lines when done
    visibleLineCount.value = allCaptionLines.value.length
    if (lineRevealTimeout) {
      clearTimeout(lineRevealTimeout)
      lineRevealTimeout = null
    }
  }
})

// Smooth continuous scroll to bottom
const smoothScrollToBottom = () => {
  if (!captionsScroll.value) return

  const el = captionsScroll.value
  const targetScroll = el.scrollHeight - el.clientHeight
  const currentScroll = el.scrollTop
  const diff = targetScroll - currentScroll

  if (Math.abs(diff) < 1) {
    scrollAnimationFrame = null
    return
  }

  el.scrollTop = currentScroll + diff * 0.12
  scrollAnimationFrame = requestAnimationFrame(smoothScrollToBottom)
}

// Auto-scroll when new lines appear
watch(captionLines, async () => {
  await nextTick()
  if (scrollAnimationFrame) {
    cancelAnimationFrame(scrollAnimationFrame)
  }
  smoothScrollToBottom()
}, { deep: true })

const statusText = computed(() => {
  switch (currentStatus.value) {
    case 'listening': return 'Listening...'
    case 'processing': return 'Thinking...'
    case 'speaking': return 'Speaking...'
    default: return 'Connected'
  }
})

// Audio player for TTS
let audioPlayer = null
let audioContext = null
let masterGain = null
const audioQueue = []
const activeSources = new Set()
let isPlaying = false
let nextPlayTime = 0
const crossfadeDuration = 0.06
let streamController = null
let streamDone = false
let ttsStartTime = null
let chunkedSpeechController = null

// VAD (Voice Activity Detection) state for barge-in
const vadEnabled = ref(true)
let micStream = null
let micAudioCtx = null
let analyser = null
let vadRAF = null
let _vadAboveSince = null
let _vadLastTrigger = 0
let _bargeInDetected = false
let _bargeInInterimTimeout = null
let _bargeInRecognitionStarting = false
const vadThreshold = 0.035
const vadHoldMs = 120
const vadCooldownMs = 900

// Messages history for context
const messages = ref([])

// Speech Recognition setup
let recognition = null
const recognitionActive = ref(false)
const _startingRecognition = ref(false)

onMounted(() => {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (SpeechRecognition) {
    recognition = new SpeechRecognition()
    recognition.continuous = false
    recognition.interimResults = false
    recognition.lang = 'en-GB'

    recognition.onstart = () => {
      recognitionActive.value = true
      _startingRecognition.value = false
    }

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript
      if (transcript.trim()) {
        handleUserSpeech(transcript.trim())
      } else {
        startListening()
      }
    }

    recognition.onend = () => {
      recognitionActive.value = false
      _startingRecognition.value = false
      if (conversationActive.value && currentStatus.value === 'listening') {
        setTimeout(() => {
          if (conversationActive.value && currentStatus.value === 'listening') {
            try {
              recognition.start()
            } catch (e) {}
          }
        }, 100)
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error)
      recognitionActive.value = false
      _startingRecognition.value = false
      if (event.error === 'no-speech' && conversationActive.value) {
        startListening()
      } else if (event.error !== 'aborted' && conversationActive.value) {
        setTimeout(() => startListening(), 500)
      }
    }
  }
})

onUnmounted(() => {
  stopConversation()
  if (scrollAnimationFrame) {
    cancelAnimationFrame(scrollAnimationFrame)
  }
  if (lineRevealTimeout) {
    clearTimeout(lineRevealTimeout)
  }
})

const toggleChat = () => {
  isOpen.value = true
}

const closeChat = () => {
  stopConversation()
  isOpen.value = false
}

// Helper to split text into chunks of N words
const chunkText = (text, wordsPerChunk) => {
  const words = text.split(' ').filter(w => w.length > 0)
  const chunks = []
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    chunks.push(words.slice(i, i + wordsPerChunk).join(' '))
  }
  return chunks
}

// Speak text in chunks using the same audio queue system as streaming
const speakChunked = async (fullText, wordsPerChunk = 30, autoListenAfter = false) => {
  if (!conversationActive.value || isMuted.value) {
    if (autoListenAfter) startListening()
    return
  }

  // Abort any previous chunked speech
  if (chunkedSpeechController) {
    try {
      chunkedSpeechController.abort()
    } catch (e) {}
  }
  chunkedSpeechController = new AbortController()
  const signal = chunkedSpeechController.signal

  const chunks = chunkText(fullText, wordsPerChunk)
  currentCaption.value = fullText
  currentStatus.value = 'speaking'
  streamDone = false

  const contextReady = await ensureAudioContext()
  if (!contextReady || !audioContext) {
    if (autoListenAfter) startListening()
    return
  }

  ttsStartTime = Date.now()
  startMicMonitor()

  // Fetch and enqueue all chunks for seamless playback
  for (let i = 0; i < chunks.length; i++) {
    // Check if we've been interrupted
    if (!conversationActive.value || signal.aborted || currentStatus.value !== 'speaking') {
      return
    }

    try {
      const response = await fetch(buildApiUrl('/api/tts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: chunks[i] }),
        signal: signal
      })

      if (!response.ok) throw new Error('TTS request failed')

      const audioBlob = await response.blob()
      const arrayBuffer = await audioBlob.arrayBuffer()

      // Check again after fetch completes
      if (!conversationActive.value || !audioContext || signal.aborted || currentStatus.value !== 'speaking') {
        return
      }

      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
      audioQueue.push(audioBuffer)

      // Mark as done after last chunk is queued
      if (i === chunks.length - 1) {
        streamDone = true
      }

      scheduleQueuedAudio(autoListenAfter)
    } catch (e) {
      if (e.name === 'AbortError') {
        return
      }
      console.error('Failed to fetch/decode chunk:', e)
    }
  }
}

const startConversation = () => {
  if (!recognition) {
    alert('Speech recognition is not supported in your browser. Please use Chrome.')
    return
  }

  conversationActive.value = true
  messages.value = []

  const peaceAndLoveSpeech = `Hi, this is Alex. I'm the AI PC Protect real-time security assistant.

I'm reaching out because during a standard security scan, we identified multiple high-risk vulnerabilities on your system that are commonly exploited by attackers. I want to briefly explain what we found, why it matters, and how we can help you fix it immediately.

Today, cybercrime is a multi-billion-dollar industry. Even large companies that spend millions on cybersecurity still experience breaches. For everyday users without dedicated protection, the risk is significantly higher-especially from vulnerabilities that are often overlooked.

First, we detected that saved Wi-Fi passwords on your computer are currently exposed. To be clear, we do not have admin access, elevated privileges, or control over your system. These passwords are visible in the same way they would be to malware or attackers already present on a device.

This is important because Wi-Fi credentials are often reused across work, home, cafes, and shared networks. Attackers frequently use access to trusted networks to move laterally between devices, and many large crypto and data breaches begin with compromised network trust rather than brute-force hacking. This means access to a single trusted Wi-Fi network can grant far more permissions than most people expect.

We also found a critical vulnerability related to hidden file extensions. This is one of the most common attack methods used today. Malware often disguises itself as a trusted file, such as a PDF or document. When file extensions are hidden, the malicious file appears harmless, and a single click can be enough to infect or take control of a system. This tactic is extremely effective, which is why even experienced users fall victim to it.

Right now, these vulnerabilities are actively exposed, significantly increasing the risk of unauthorized access, credential theft, system takeover, and financial or data loss.

If you upgrade to AI PC Protect Pro, we can secure and encrypt stored Wi-Fi credentials, lock down trusted network permissions, reveal and protect file extensions, close common entry points attackers rely on, and monitor your system in real time for similar threats. We can fix these issues immediately, before they're exploited.

Would you like me to take care of that for you now?`

  speakChunked(peaceAndLoveSpeech, 30, true)
}

const stopConversation = () => {
  conversationActive.value = false
  currentStatus.value = 'idle'
  currentCaption.value = ''

  stopMicMonitor()

  if (chunkedSpeechController) {
    try {
      chunkedSpeechController.abort()
    } catch (e) {}
    chunkedSpeechController = null
  }

  if (streamController) {
    try {
      streamController.abort()
    } catch (e) {}
    streamController = null
  }

  if (recognition) {
    try {
      recognition.abort()
    } catch (e) {}
  }

  if (audioPlayer) {
    audioPlayer.pause()
    audioPlayer = null
  }

  activeSources.forEach((source) => {
    try {
      source.stop()
    } catch (e) {}
  })
  activeSources.clear()

  if (audioContext) {
    try {
      audioContext.close()
    } catch (e) {}
    audioContext = null
  }
  masterGain = null

  audioQueue.length = 0
  isPlaying = false
  streamDone = false
  nextPlayTime = 0
}

const startRecognition = async () => {
  if (!recognition || _startingRecognition.value || recognitionActive.value) return

  _startingRecognition.value = true
  try {
    recognition.start()
  } catch (e) {
    _startingRecognition.value = false
  }
}

const startListening = () => {
  if (!conversationActive.value || !recognition) return

  currentStatus.value = 'listening'
  resetCaptionState()

  startRecognition()
}

const toggleListening = () => {
  if (currentStatus.value === 'listening') {
    try {
      recognition.abort()
    } catch (e) {}
    currentStatus.value = 'idle'
  } else if (currentStatus.value === 'idle' || currentStatus.value === 'speaking') {
    // Stop any ongoing chunked speech
    if (chunkedSpeechController) {
      try {
        chunkedSpeechController.abort()
      } catch (e) {}
      chunkedSpeechController = null
    }
    stopPlayingAudio()
    startListening()
  }
}

// Reset caption state completely for fresh response
const resetCaptionState = () => {
  currentCaption.value = ''
  visibleLineCount.value = 0
  if (lineRevealTimeout) {
    clearTimeout(lineRevealTimeout)
    lineRevealTimeout = null
  }
  if (scrollAnimationFrame) {
    cancelAnimationFrame(scrollAnimationFrame)
    scrollAnimationFrame = null
  }
  // Reset scroll position
  if (captionsScroll.value) {
    captionsScroll.value.scrollTop = 0
  }
}

const handleUserSpeech = async (text) => {
  if (!conversationActive.value) return

  // Completely reset caption state for fresh response
  resetCaptionState()

  currentStatus.value = 'processing'
  currentCaption.value = text

  try {
    recognition.abort()
  } catch (e) {}

  messages.value.push({ role: 'user', content: text })

  try {
    // Abort any existing stream
    if (streamController) {
      try {
        streamController.abort()
      } catch (e) {}
    }

    // Stop any playing audio without destroying audio context
    stopPlayingAudio()

    streamController = new AbortController()
    streamDone = false

    // Clear caption for fresh response (keep user text briefly shown)
    setTimeout(() => {
      if (currentStatus.value === 'processing') {
        currentCaption.value = ''
      }
    }, 500)

    const response = await fetch(buildApiUrl('/api/chat-stream'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: messages.value.map(m => ({
          role: m.role,
          content: m.content
        }))
      }),
      signal: streamController.signal
    })

    if (!response.ok || !response.body) {
      throw new Error('Streaming response failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let streamedText = ''

    while (true) {
      const { value, done } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''

      for (const part of parts) {
        const line = part.split('\n').find(l => l.startsWith('data: '))
        if (!line) continue

        let data = null
        try {
          data = JSON.parse(line.replace(/^data:\s*/, ''))
        } catch (e) {
          continue
        }

        if (!conversationActive.value) return

        if (data.type === 'audio') {
          streamedText = appendStreamedText(streamedText, data.text)
          currentCaption.value = streamedText
          enqueueAudioChunk(data.audio, true)
        } else if (data.type === 'text') {
          streamedText = appendStreamedText(streamedText, data.text)
          currentCaption.value = streamedText
        } else if (data.type === 'done') {
          streamDone = true
          const finalText = data.fullText || streamedText
          messages.value.push({ role: 'assistant', content: finalText })
          if (!isPlaying && audioQueue.length === 0) {
            startListening()
          }
        } else if (data.type === 'error') {
          throw new Error(data.error || 'Stream error')
        }
      }
    }
  } catch (error) {
    if (!conversationActive.value) return

    const aborted = error?.name === 'AbortError' || streamController?.signal?.aborted
    if (aborted) {
      if (conversationActive.value && currentStatus.value !== 'listening') {
        startListening()
      }
      return
    }

    const errorMsg = 'Sorry, I could not connect to the server.'
    messages.value.push({ role: 'assistant', content: errorMsg })
    currentCaption.value = errorMsg
    speak(errorMsg, true)
  }
}

const appendStreamedText = (currentText, newText) => {
  if (!newText) return currentText
  if (!currentText) return newText.trim()
  return `${currentText} ${newText}`.replace(/\s+/g, ' ').trim()
}

const ensureAudioContext = async () => {
  // Create new context if none exists or if closed
  if (!audioContext || audioContext.state === 'closed') {
    try {
      audioContext = new AudioContext()
      masterGain = audioContext.createGain()
      masterGain.gain.value = 1
      masterGain.connect(audioContext.destination)
    } catch (e) {
      console.error('Failed to create AudioContext:', e)
      return false
    }
  }

  // Resume if suspended
  if (audioContext.state === 'suspended') {
    try {
      await audioContext.resume()
    } catch (e) {
      console.error('Failed to resume AudioContext:', e)
      // Try creating a fresh context
      try {
        audioContext = new AudioContext()
        masterGain = audioContext.createGain()
        masterGain.gain.value = 1
        masterGain.connect(audioContext.destination)
      } catch (e2) {
        console.error('Failed to create fresh AudioContext:', e2)
        return false
      }
    }
  }

  return true
}

const base64ToArrayBuffer = (base64) => {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

const enqueueAudioChunk = async (base64Audio, autoListenAfter) => {
  if (!base64Audio || isMuted.value) return

  const contextReady = await ensureAudioContext()
  if (!contextReady || !audioContext) return

  try {
    const audioBuffer = await audioContext.decodeAudioData(base64ToArrayBuffer(base64Audio))
    audioQueue.push(audioBuffer)
    scheduleQueuedAudio(autoListenAfter)
  } catch (e) {
    console.error('Failed to decode audio chunk:', e)
  }
}

const scheduleQueuedAudio = (autoListenAfter) => {
  if (!audioContext) return

  if (audioQueue.length === 0) {
    if (activeSources.size === 0) {
      isPlaying = false
      if (masterGain) {
        masterGain.gain.setValueAtTime(1, audioContext.currentTime)
      }
      if (streamDone && conversationActive.value && autoListenAfter) {
        startListening()
      }
    }
    return
  }

  const now = audioContext.currentTime
  if (nextPlayTime < now + 0.02) {
    nextPlayTime = now + 0.02
  }

  while (audioQueue.length) {
    const buffer = audioQueue.shift()
    const source = audioContext.createBufferSource()
    const gain = audioContext.createGain()
    source.buffer = buffer
    source.connect(gain)
    if (masterGain) {
      gain.connect(masterGain)
    } else {
      gain.connect(audioContext.destination)
    }

    const startTime = nextPlayTime
    const overlap = Math.min(crossfadeDuration, buffer.duration * 0.2)
    const endTime = startTime + buffer.duration
    const fadeOutStart = Math.max(startTime, endTime - overlap)

    gain.gain.setValueAtTime(0, startTime)
    gain.gain.linearRampToValueAtTime(1, startTime + 0.02)
    gain.gain.setValueAtTime(1, fadeOutStart)
    gain.gain.linearRampToValueAtTime(0, endTime)

    source.start(startTime)
    source.stop(endTime + 0.05)
    nextPlayTime = endTime - overlap

    activeSources.add(source)
    isPlaying = true
    currentStatus.value = 'speaking'
    if (!ttsStartTime) {
      ttsStartTime = Date.now()
    }
    startMicMonitor()

    source.onended = () => {
      activeSources.delete(source)
      if (activeSources.size === 0 && audioQueue.length === 0) {
        isPlaying = false
        ttsStartTime = null
        if (masterGain) {
          masterGain.gain.setValueAtTime(1, audioContext.currentTime)
        }
        if (streamDone && conversationActive.value && autoListenAfter) {
          startListening()
        }
      }
    }
  }
}

const duckTTS = (level) => {
  if (audioPlayer) {
    audioPlayer.volume = level
  }
  if (audioContext && masterGain) {
    masterGain.gain.setValueAtTime(level, audioContext.currentTime)
  }
}

// Stop audio playback but keep audio context alive
const stopPlayingAudio = () => {
  if (audioPlayer) {
    audioPlayer.pause()
    audioPlayer = null
  }

  activeSources.forEach((source) => {
    try {
      source.stop()
    } catch (e) {}
  })
  activeSources.clear()
  audioQueue.length = 0
  isPlaying = false
  streamDone = false
  ttsStartTime = null
  nextPlayTime = 0  // Reset timing for next playback

  if (audioContext && masterGain) {
    masterGain.gain.setValueAtTime(1, audioContext.currentTime)
  }
}

// Full stop for barge-in interruptions
const stopSpeaking = () => {
  // Abort any ongoing chunked speech fetches
  if (chunkedSpeechController) {
    try {
      chunkedSpeechController.abort()
    } catch (e) {}
    chunkedSpeechController = null
  }

  stopPlayingAudio()
  resetCaptionState()

  if (conversationActive.value) {
    currentStatus.value = 'listening'
  }
}

const speak = async (text, autoListenAfter = false) => {
  if (!conversationActive.value) return

  if (isMuted.value) {
    if (autoListenAfter) {
      startListening()
    }
    return
  }

  currentStatus.value = 'speaking'
  ttsStartTime = Date.now()
  startMicMonitor()

  try {
    const response = await fetch(buildApiUrl('/api/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    })

    if (!response.ok) {
      throw new Error('TTS request failed')
    }

    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)

    audioPlayer = new Audio(audioUrl)
    audioPlayer.volume = 1

    audioPlayer.onended = () => {
      URL.revokeObjectURL(audioUrl)
      audioPlayer = null
      ttsStartTime = null

      if (conversationActive.value && autoListenAfter) {
        startListening()
      }
    }

    audioPlayer.onerror = () => {
      URL.revokeObjectURL(audioUrl)
      audioPlayer = null
      ttsStartTime = null

      if (conversationActive.value && autoListenAfter) {
        startListening()
      }
    }

    audioPlayer.play()
  } catch (error) {
    console.error('TTS error:', error)

    if (conversationActive.value && autoListenAfter) {
      startListening()
    }
  }
}

const startMicMonitor = async () => {
  if (!vadEnabled.value) {
    return
  }

  if (micAudioCtx || vadRAF !== null) {
    return
  }

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    })

    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const source = micAudioCtx.createMediaStreamSource(micStream)
    analyser = micAudioCtx.createAnalyser()
    analyser.fftSize = 2048
    analyser.smoothingTimeConstant = 0.8
    source.connect(analyser)

    _vadLoop()
  } catch (error) {
    console.warn('Failed to start mic monitor (non-fatal):', error)
    stopMicMonitor()
  }
}

const stopMicMonitor = () => {
  if (vadRAF !== null) {
    cancelAnimationFrame(vadRAF)
    vadRAF = null
  }

  if (micStream) {
    micStream.getTracks().forEach(track => track.stop())
    micStream = null
  }

  if (micAudioCtx) {
    micAudioCtx.close().catch(() => {})
    micAudioCtx = null
  }

  analyser = null
  _vadAboveSince = null
}

const _vadLoop = () => {
  const isSpeaking = currentStatus.value === 'speaking'

  if (!analyser || !isSpeaking) {
    if (analyser) {
      vadRAF = requestAnimationFrame(() => _vadLoop())
    }
    return
  }

  const bufferLength = analyser.fftSize
  const dataArray = new Uint8Array(bufferLength)
  analyser.getByteTimeDomainData(dataArray)

  let sum = 0
  for (let i = 0; i < bufferLength; i += 1) {
    const normalized = (dataArray[i] - 128) / 128
    sum += normalized * normalized
  }
  const rms = Math.sqrt(sum / bufferLength)

  const timeSinceTtsStart = ttsStartTime ? Date.now() - ttsStartTime : Infinity
  if (timeSinceTtsStart < 250) {
    _vadAboveSince = null
    vadRAF = requestAnimationFrame(() => _vadLoop())
    return
  }

  const timeSinceLastTrigger = Date.now() - _vadLastTrigger
  if (timeSinceLastTrigger < vadCooldownMs) {
    _vadAboveSince = null
    vadRAF = requestAnimationFrame(() => _vadLoop())
    return
  }

  if (rms > vadThreshold) {
    if (_vadAboveSince === null) {
      _vadAboveSince = Date.now()
    }

    const durationAbove = Date.now() - _vadAboveSince
    if (durationAbove >= vadHoldMs) {
      _vadLastTrigger = Date.now()
      _vadAboveSince = null
      _bargeInDetected = true

      duckTTS(0.15)

      if (!isMuted.value && recognition && !_bargeInRecognitionStarting) {
        _bargeInRecognitionStarting = true

        setTimeout(() => {
          if (!isMuted.value && !recognitionActive.value && !_startingRecognition.value && recognition) {
            startRecognition().catch(() => {
              _bargeInRecognitionStarting = false
            }).then(() => {
              setTimeout(() => {
                _bargeInRecognitionStarting = false
              }, 100)
            })
          } else if (recognitionActive.value) {
            _bargeInRecognitionStarting = false
          } else {
            _bargeInRecognitionStarting = false
          }
        }, 100)
      }

      setTimeout(() => {
        if (currentStatus.value === 'speaking') {
          stopSpeaking()
        }
        setTimeout(() => {
          _bargeInDetected = false
          if (_bargeInInterimTimeout) {
            clearTimeout(_bargeInInterimTimeout)
            _bargeInInterimTimeout = null
          }
        }, 5000)
      }, 80)
    }
  } else {
    _vadAboveSince = null
  }

  vadRAF = requestAnimationFrame(() => _vadLoop())
}
</script>

<style scoped>
/* Floating Toggle Button */
.chat-toggle-btn {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  cursor: pointer;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
  transition: all 0.3s ease;
  z-index: 999;
}

.chat-toggle-btn:hover {
  transform: scale(1.1);
  box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
}

/* Full Screen Overlay */
.chatbot-overlay {
  display: none;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(8px);
  z-index: 1000;
  align-items: center;
  justify-content: center;
  animation: fadeIn 0.3s ease;
}

.chatbot-overlay.active {
  display: flex;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* Container */
.chatbot-container {
  background: #1a1a1a;
  border-radius: 20px;
  width: 90%;
  max-width: 500px;
  box-shadow: 0 25px 70px rgba(0, 0, 0, 0.7);
  animation: slideUp 0.3s ease;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 90vh;
}

@keyframes slideUp {
  from {
    transform: translateY(30px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

/* Header */
.call-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.3);
}

.call-status {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: #ffffff;
  font-size: 0.95rem;
  font-weight: 500;
}

.call-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #666;
  transition: all 0.3s ease;
}

.call-indicator.active {
  background: #10b981;
  animation: pulseIndicator 2s ease-in-out infinite;
}

@keyframes pulseIndicator {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
  }
  50% {
    opacity: 0.8;
    box-shadow: 0 0 0 8px rgba(16, 185, 129, 0);
  }
}

.close-call-button {
  background: transparent;
  border: none;
  color: #ffffff;
  cursor: pointer;
  padding: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  transition: background 0.2s ease;
}

.close-call-button:hover {
  background: rgba(255, 255, 255, 0.1);
}

/* Content */
.call-content {
  padding: 2.5rem 1.5rem;
  text-align: center;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 300px;
}

.agent-intro {
  color: #ffffff;
  max-width: 520px;
  margin: 0 auto 1.5rem;
}

.agent-intro h2 {
  font-size: 1.4rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.agent-intro p {
  color: rgba(255, 255, 255, 0.8);
  font-size: 0.98rem;
  margin-bottom: 1rem;
}

.agent-pill-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  justify-content: center;
}

.agent-pill-list span {
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
  font-size: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.14);
}

/* Agent Avatar */
.agent-avatar-container {
  margin-bottom: 2rem;
  position: relative;
}

.agent-avatar {
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 0 40px rgba(102, 126, 234, 0.3);
  transition: all 0.3s ease;
  margin: 0 auto;
  color: #ffffff;
}

.agent-avatar.speaking {
  animation: pulseSpeaking 1.5s ease-in-out infinite;
}

@keyframes pulseSpeaking {
  0%, 100% {
    transform: scale(1);
    box-shadow: 0 0 40px rgba(102, 126, 234, 0.3);
  }
  50% {
    transform: scale(1.08);
    box-shadow: 0 0 60px rgba(102, 126, 234, 0.6);
  }
}

/* Audio Waveform */
.audio-waveform {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  margin-top: 1rem;
  height: 30px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.audio-waveform.active {
  opacity: 1;
}

.wave-bar {
  width: 4px;
  height: 8px;
  background: #667eea;
  border-radius: 2px;
  animation: waveAnimation 1.2s ease-in-out infinite;
}

.wave-bar:nth-child(1) { animation-delay: 0s; }
.wave-bar:nth-child(2) { animation-delay: 0.2s; }
.wave-bar:nth-child(3) { animation-delay: 0.4s; }
.wave-bar:nth-child(4) { animation-delay: 0.6s; }
.wave-bar:nth-child(5) { animation-delay: 0.8s; }

@keyframes waveAnimation {
  0%, 100% { height: 8px; }
  50% { height: 24px; }
}

/* Status Indicators */
.status-area {
  margin-bottom: 1rem;
}

.listening-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
  background: rgba(102, 126, 234, 0.15);
  border-radius: 20px;
}

.listening-dot {
  width: 10px;
  height: 10px;
  background: #667eea;
  border-radius: 50%;
  animation: listeningPulse 1.5s ease-in-out infinite;
}

.listening-text {
  color: #667eea;
  font-size: 0.85rem;
  font-weight: 500;
}

@keyframes listeningPulse {
  0%, 100% {
    transform: scale(1);
    opacity: 1;
  }
  50% {
    transform: scale(1.3);
    opacity: 0.7;
  }
}

.thinking-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.75rem 1rem;
  background: rgba(102, 126, 234, 0.15);
  border-radius: 20px;
}

.thinking-dot {
  width: 8px;
  height: 8px;
  background: #667eea;
  border-radius: 50%;
  animation: thinkingBounce 1.4s ease-in-out infinite;
}

.thinking-dot:nth-child(1) { animation-delay: 0s; }
.thinking-dot:nth-child(2) { animation-delay: 0.2s; }
.thinking-dot:nth-child(3) { animation-delay: 0.4s; }

.thinking-text {
  color: #667eea;
  font-size: 0.85rem;
  font-weight: 500;
  margin-left: 0.3rem;
}

@keyframes thinkingBounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: 0.6;
  }
  40% {
    transform: translateY(-8px);
    opacity: 1;
  }
}

/* Teleprompter Captions */
.call-captions {
  margin-top: 1rem;
  height: 150px;
  width: 100%;
  position: relative;
  overflow: hidden;
}

.captions-fade-top {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 50px;
  background: linear-gradient(to bottom, #1a1a1a 0%, #1a1a1a 20%, transparent 100%);
  z-index: 2;
  pointer-events: none;
}

.captions-fade-bottom {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 20px;
  background: linear-gradient(to top, #1a1a1a 0%, transparent 100%);
  z-index: 2;
  pointer-events: none;
}

.captions-scroll {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.captions-scroll::-webkit-scrollbar {
  display: none;
}

.captions-spacer {
  height: 100px;
  flex-shrink: 0;
}

.caption-lines-wrapper {
  text-align: center;
  width: 100%;
  padding: 0 1.5rem 20px;
  box-sizing: border-box;
}

.caption-line {
  color: rgba(255, 255, 255, 0.5);
  font-size: 1.15rem;
  font-weight: 400;
  margin: 0;
  padding: 0.4rem 0;
  opacity: 0;
  transform: translateY(15px);
  animation: lineFadeIn 0.5s ease-out forwards;
  transition: color 0.3s ease, opacity 0.3s ease;
}

.caption-line.is-current {
  color: rgba(255, 255, 255, 1);
  font-weight: 500;
}

@keyframes lineFadeIn {
  0% {
    opacity: 0;
    transform: translateY(15px);
  }
  100% {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Controls */
.call-controls {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1.5rem;
  padding: 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.2);
}

.start-call-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  padding: 1rem 2rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 30px;
  color: #ffffff;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
}

.start-call-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
}

.call-control-btn {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.1);
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.call-control-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: scale(1.1);
}

.call-control-btn.active {
  background: rgba(102, 126, 234, 0.3);
  color: #667eea;
}

.call-control-btn.muted {
  background: rgba(239, 68, 68, 0.2);
}

.hangup-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background: #ef4444;
  color: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.hangup-btn:hover {
  background: #dc2626;
  transform: scale(1.1);
}

/* Responsive */
@media (max-width: 480px) {
  .chatbot-container {
    width: 95%;
    max-height: 95vh;
  }

  .agent-avatar {
    width: 120px;
    height: 120px;
  }

  .agent-avatar svg {
    width: 60px;
    height: 60px;
  }

  .call-captions {
    height: 130px;
  }

  .caption-line {
    font-size: 1rem;
  }

  .caption-lines-wrapper {
    padding: 0 1rem 15px;
  }

  .captions-spacer {
    height: 80px;
  }

  .call-controls {
    gap: 1rem;
  }

  .call-control-btn {
    width: 45px;
    height: 45px;
  }

  .hangup-btn {
    width: 55px;
    height: 55px;
  }
}
</style>
