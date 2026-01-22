import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Original chat endpoint (non-streaming)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' })
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7
    })

    const assistantMessage = completion.choices[0].message.content

    res.json({ message: assistantMessage })
  } catch (error) {
    console.error('OpenAI API error:', error.message)
    res.status(500).json({ error: 'Failed to get response from AI' })
  }
})

// Streaming chat endpoint with chunked TTS
app.post('/api/chat-stream', async (req, res) => {
  try {
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' })
    }

    // Set headers for Server-Sent Events
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
      stream: true
    })

    let buffer = ''
    let fullResponse = ''
    const maxWordsPerChunk = 30

    const sendTtsChunk = async (text) => {
      if (!text) return
      try {
        const mp3 = await openai.audio.speech.create({
          model: 'tts-1',
          voice: 'fable',
          input: text
        })

        const audioBuffer = Buffer.from(await mp3.arrayBuffer())
        const base64Audio = audioBuffer.toString('base64')

        res.write(`data: ${JSON.stringify({
          type: 'audio',
          text,
          audio: base64Audio
        })}\n\n`)
      } catch (ttsError) {
        console.error('TTS error for chunk:', ttsError.message)
        res.write(`data: ${JSON.stringify({
          type: 'text',
          text
        })}\n\n`)
      }
    }

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || ''
      buffer += content
      fullResponse += content

      const endsWithSpace = /\s$/.test(buffer)
      const words = buffer.trim().length ? buffer.trim().split(/\s+/) : []
      const remainder = endsWithSpace ? '' : words.pop() || ''

      while (words.length >= maxWordsPerChunk) {
        const chunkWords = words.splice(0, maxWordsPerChunk)
        await sendTtsChunk(chunkWords.join(' '))
      }

      buffer = ''
      if (words.length > 0) {
        buffer = words.join(' ')
      }
      if (remainder) {
        buffer = buffer ? `${buffer} ${remainder}` : remainder
      }
    }

    // Handle any remaining text in buffer
    if (buffer.trim().length > 0) {
      await sendTtsChunk(buffer.trim())
    }

    // Send completion signal
    res.write(`data: ${JSON.stringify({
      type: 'done',
      fullText: fullResponse
    })}\n\n`)

    res.end()
  } catch (error) {
    console.error('Stream error:', error.message)
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`)
    res.end()
  }
})

// Original TTS endpoint (for single requests)
app.post('/api/tts', async (req, res) => {
  try {
    const { text } = req.body

    if (!text) {
      return res.status(400).json({ error: 'Text is required' })
    }

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'fable',
      input: text
    })

    const buffer = Buffer.from(await mp3.arrayBuffer())

    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length
    })

    res.send(buffer)
  } catch (error) {
    console.error('TTS API error:', error.message)
    res.status(500).json({ error: 'Failed to generate speech' })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
