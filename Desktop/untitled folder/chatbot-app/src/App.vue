<script setup>
import ChatBot from './components/ChatBot.vue'
</script>

<template>
  <main>
    <div class="content">
      <h1>My Application</h1>
      <p>Click the chat button in the bottom right corner to start chatting!</p>
    </div>

    <!-- Chatbot component - appears as floating button -->
    <ChatBot />
  </main>
</template>

<style scoped>
main {
  min-height: 100vh;
  padding: 40px;
}

.content {
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
}

h1 {
  color: #333;
  margin-bottom: 20px;
}

p {
  color: #666;
  font-size: 16px;
}
</style>
