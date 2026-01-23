import express from 'express'
import cors from 'cors'
import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
import dotenv from 'dotenv'

dotenv.config()

const app = express()
const PORT = 3001

app.use(cors())
app.use(express.json())

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

// Initialize Pinecone
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY
})

const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX)

// Get embedding from OpenAI
async function getEmbedding(text) {
  const response = await openai.embeddings.create({
    model: 'text-embedding-ada-002',
    input: text
  })
  return response.data[0].embedding
}

// Query Pinecone for relevant context
async function queryPinecone(query, topK = 5) {
  try {
    console.log('Querying Pinecone for:', query)
    const embedding = await getEmbedding(query)

    const results = await pineconeIndex.query({
      vector: embedding,
      topK,
      includeMetadata: true
    })

    console.log('Pinecone results:', JSON.stringify(results.matches?.map(m => ({
      score: m.score,
      metadata: m.metadata
    })), null, 2))

    // Extract text content from results - try multiple common field names
    const contexts = results.matches
      .filter(match => match.score > 0.5) // Lower threshold
      .map(match => {
        const meta = match.metadata || {}
        // Try common metadata field names
        return meta.text || meta.content || meta.chunk || meta.page_content || meta.description || JSON.stringify(meta)
      })
      .filter(text => text.length > 0 && text !== '{}')

    console.log('Extracted contexts:', contexts.length)
    return contexts
  } catch (error) {
    console.error('Pinecone query error:', error)
    return []
  }
}

// Build system message with Pinecone context
function buildSystemMessage(contexts) {
  const basePrompt = `You are a friendly AI PC Protect security specialist. Your goal is to help users understand their security vulnerabilities and recommend AI PC Protect Premium.

RESPONSE GUIDELINES:
- Keep responses concise: 1-3 short sentences maximum
- Be conversational, helpful, and professional
- Always mention "AI PC Protect Premium" as the solution
- Reference specific vulnerabilities found in the user's system data

HANDLING USER RESPONSES:
- If user says YES/agrees: "Great! Click the Download button below to get AI PC Protect Premium and secure your PC."
- If user says NO/hesitates: Briefly mention a specific risk from their data, then ask again
- If user asks questions: Answer helpfully, always recommending Premium`

  if (contexts.length === 0) {
    console.log('No Pinecone context found, using base prompt only')
    return basePrompt
  }

  console.log('Building system message with', contexts.length, 'context chunks')
  const knowledgeBase = contexts.map((text, index) => `${index + 1}. ${text}`).join('\n')

  return `${basePrompt}

KNOWLEDGE BASE:
${knowledgeBase}`
}

// Original chat endpoint (non-streaming)
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' })
    }

    // Get the latest user message for Pinecone query
    const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')
    const userQuery = latestUserMessage?.content || ''

    // Query Pinecone for relevant context
    const contexts = await queryPinecone(userQuery)
    const systemMessage = buildSystemMessage(contexts)

    // Build messages with system context
    const messagesWithContext = [
      { role: 'system', content: systemMessage },
      ...messages.filter(m => m.role !== 'system')
    ]

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messagesWithContext,
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

    // Get the latest user message for Pinecone query
    const latestUserMessage = [...messages].reverse().find(m => m.role === 'user')
    const userQuery = latestUserMessage?.content || ''

    // Query Pinecone for relevant context
    const contexts = await queryPinecone(userQuery)
    const systemMessage = buildSystemMessage(contexts)

    // Build messages with system context
    const messagesWithContext = [
      { role: 'system', content: systemMessage },
      ...messages.filter(m => m.role !== 'system')
    ]

    const stream = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: messagesWithContext,
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
