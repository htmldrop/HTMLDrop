<template>
  <div id="ai-command-center">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>{{ translate('Conversations') }}</h2>
        <button class="new-chat-btn" @click="newConversation" :title="translate('New Conversation')">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </button>
      </div>
      <div class="conversation-list">
        <div
          v-for="conv in conversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: currentConversation?.id === conv.id }"
          @click="loadConversation(conv.id)"
        >
          <span class="conv-title">{{ conv.title }}</span>
          <button class="delete-conv" @click.stop="deleteConversation(conv.id)" :title="translate('Delete')">
            <svg viewBox="0 0 24 24" width="14" height="14"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </button>
        </div>
        <div v-if="conversations.length === 0" class="empty-conversations">
          {{ translate('No conversations yet') }}
        </div>
      </div>
    </div>

    <!-- Main Chat Area -->
    <div class="chat-area">
      <!-- Header -->
      <div class="chat-header">
        <div class="header-info">
          <h1>{{ translate('AI Command Center') }}</h1>
          <span v-if="activeProvider" class="provider-badge">
            {{ activeProvider }} - {{ activeModel || 'default' }}
          </span>
          <span v-else class="provider-badge warning">
            {{ translate('No provider configured') }}
          </span>
        </div>
        <button class="settings-btn" @click="showSettings = !showSettings">
          <svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
        </button>
      </div>

      <!-- Settings Panel -->
      <div v-if="showSettings" class="settings-panel">
        <div class="settings-row">
          <label>{{ translate('Auto-approve reads') }}</label>
          <input type="checkbox" v-model="settings.auto_approve_reads" @change="saveSettings" />
        </div>
        <div class="settings-row">
          <label>{{ translate('Auto-approve writes') }}</label>
          <input type="checkbox" v-model="settings.auto_approve_writes" @change="saveSettings" />
        </div>
        <router-link to="/settings/ai" class="settings-link">{{ translate('Configure AI Providers') }} →</router-link>
      </div>

      <!-- Messages -->
      <div class="messages" ref="messagesContainer">
        <div v-if="messages.length === 0" class="welcome-message">
          <h2>{{ translate('Welcome to AI Command Center') }}</h2>
          <p>{{ translate('Ask me to help manage your CMS. I can:') }}</p>
          <ul>
            <li>{{ translate('List, activate, or deactivate plugins and themes') }}</li>
            <li>{{ translate('Create, update, or delete posts and users') }}</li>
            <li>{{ translate('Run database migrations') }}</li>
            <li>{{ translate('Check system status and health') }}</li>
            <li>{{ translate('And much more...') }}</li>
          </ul>
        </div>

        <div v-for="msg in messages" :key="msg.id" class="message" :class="'x-' + msg.role">
          <div class="message-avatar">
            <span v-if="msg.role === 'user'">U</span>
            <span v-else-if="msg.role === 'assistant'">AI</span>
            <span v-else>S</span>
          </div>
          <div class="message-content">
            <div class="message-text" v-html="formatMessage(msg.content)"></div>

            <!-- Command Suggestions -->
            <div v-if="msg.commands_suggested && msg.commands_suggested.length > 0" class="commands-section">
              <div class="commands-header">
                <span>{{ translate('Suggested Commands') }}</span>
                <div class="bulk-actions" v-if="hasPendingCommands(msg)">
                  <button class="btn-approve-all" @click="executeCommands(msg, 'all')">
                    {{ translate('Approve All') }}
                  </button>
                  <button class="btn-reject-all" @click="rejectAllCommands(msg)">
                    {{ translate('Reject All') }}
                  </button>
                </div>
              </div>
              <div v-for="(cmd, idx) in msg.commands_suggested" :key="idx" class="command-card" :class="{ executed: isCommandExecuted(msg, cmd), rejected: isCommandRejected(msg, cmd) }">
                <div class="command-info">
                  <span class="command-slug">{{ cmd.slug }}</span>
                  <span class="command-type" :class="cmd.type">{{ cmd.type }}</span>
                  <span v-if="cmd.autoApproved" class="auto-badge">{{ translate('auto') }}</span>
                </div>
                <div class="command-desc">{{ cmd.description || cmd.name }}</div>
                <div v-if="Object.keys(cmd.parameters || {}).length > 0" class="command-params">
                  <code>{{ JSON.stringify(cmd.parameters) }}</code>
                </div>
                <div class="command-actions" v-if="!isCommandExecuted(msg, cmd) && !isCommandRejected(msg, cmd)">
                  <button class="btn-approve" @click="executeCommands(msg, [cmd])">
                    {{ translate('Execute') }}
                  </button>
                  <button class="btn-reject" @click="rejectCommand(msg, cmd)">
                    {{ translate('Reject') }}
                  </button>
                </div>
                <div v-else-if="isCommandExecuted(msg, cmd)" class="command-result" :class="{ success: getCommandResult(msg, cmd)?.success, error: !getCommandResult(msg, cmd)?.success }">
                  <span v-if="getCommandResult(msg, cmd)?.success">✓ {{ getCommandResult(msg, cmd)?.message }}</span>
                  <span v-else>✗ {{ getCommandResult(msg, cmd)?.message || getCommandResult(msg, cmd)?.error }}</span>
                </div>
                <div v-else-if="isCommandRejected(msg, cmd)" class="command-rejected">
                  {{ translate('Rejected') }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="isLoading" class="message assistant loading">
          <div class="message-avatar">AI</div>
          <div class="message-content">
            <div class="typing-indicator">
              <span></span><span></span><span></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Input Area -->
      <div class="input-area">
        <textarea
          ref="inputField"
          v-model="inputMessage"
          :placeholder="translate('Ask AI to help manage your CMS...')"
          @keydown.enter.exact.prevent="sendMessage"
          :disabled="isLoading || !activeProvider"
          rows="1"
        ></textarea>
        <button class="send-btn" @click="sendMessage" :disabled="isLoading || !inputMessage.trim() || !activeProvider">
          <svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  inject: ['translate', 'apiBase', 'apiFetch'],
  data: () => ({
    conversations: [],
    currentConversation: null,
    messages: [],
    inputMessage: '',
    isLoading: false,
    showSettings: false,
    settings: {
      auto_approve_reads: true,
      auto_approve_writes: false,
      active_provider_slug: null,
      active_model: null
    },
    rejectedCommands: new Map(), // Track rejected commands per message
    executedCommands: new Map()  // Track executed commands per message
  }),
  computed: {
    activeProvider() {
      return this.settings.active_provider_slug
    },
    activeModel() {
      return this.settings.active_model
    }
  },
  created() {
    this.loadConversations()
    this.loadSettings()
  },
  methods: {
    async loadConversations() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/conversations`)
      if (result.ok) {
        this.conversations = await result.json()
      }
    },
    async loadSettings() {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/settings`)
      if (result.ok) {
        this.settings = await result.json()
      }
    },
    async saveSettings() {
      await this.apiFetch(`${this.apiBase}/api/v1/ai/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          auto_approve_reads: this.settings.auto_approve_reads,
          auto_approve_writes: this.settings.auto_approve_writes
        })
      })
    },
    async loadConversation(id) {
      const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/conversations/${id}`)
      if (result.ok) {
        const data = await result.json()
        this.currentConversation = data.conversation
        this.messages = data.messages
        this.scrollToBottom()
      }
    },
    async newConversation() {
      this.currentConversation = null
      this.messages = []
      this.rejectedCommands.clear()
      this.executedCommands.clear()
    },
    async deleteConversation(id) {
      if (!confirm(this.translate('Delete this conversation?'))) return

      await this.apiFetch(`${this.apiBase}/api/v1/ai/conversations/${id}`, {
        method: 'DELETE'
      })

      if (this.currentConversation?.id === id) {
        this.newConversation()
      }
      await this.loadConversations()
    },
    async sendMessage() {
      if (!this.inputMessage.trim() || this.isLoading) return

      const message = this.inputMessage.trim()
      this.inputMessage = ''
      this.isLoading = true

      // Add user message to UI
      this.messages.push({
        id: Date.now(),
        role: 'user',
        content: message
      })
      this.scrollToBottom()

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/chat`, {
          method: 'POST',
          body: JSON.stringify({
            message,
            conversationId: this.currentConversation?.id
          })
        })

        if (result.ok) {
          const data = await result.json()

          // Update conversation ID if new
          if (!this.currentConversation) {
            this.currentConversation = { id: data.conversationId }
            await this.loadConversations()
          }

          // Add assistant message
          this.messages.push({
            id: Date.now() + 1,
            role: 'assistant',
            content: data.message,
            commands_suggested: data.commands
          })

          // Auto-execute auto-approved commands
          const autoApproved = (data.commands || []).filter(c => c.autoApproved)
          if (autoApproved.length > 0) {
            await this.executeCommands(this.messages[this.messages.length - 1], autoApproved, true)
          }
        } else {
          const error = await result.json()
          this.messages.push({
            id: Date.now() + 1,
            role: 'assistant',
            content: `Error: ${error.error || 'Failed to get response'}`
          })
        }
      } catch (error) {
        this.messages.push({
          id: Date.now() + 1,
          role: 'assistant',
          content: `Error: ${error.message || 'Network error'}`
        })
      }

      this.isLoading = false
      this.scrollToBottom()
    },
    async executeCommands(msg, commandsOrAll, silent = false) {
      const commands = commandsOrAll === 'all'
        ? msg.commands_suggested.filter(c => !this.isCommandExecuted(msg, c) && !this.isCommandRejected(msg, c))
        : commandsOrAll

      if (commands.length === 0) return

      try {
        const result = await this.apiFetch(`${this.apiBase}/api/v1/ai/execute`, {
          method: 'POST',
          body: JSON.stringify({
            commands: commands.map(c => ({ slug: c.slug, parameters: c.parameters })),
            conversationId: this.currentConversation?.id
          })
        })

        if (result.ok) {
          const data = await result.json()

          // Store results
          const msgKey = msg.id
          if (!this.executedCommands.has(msgKey)) {
            this.executedCommands.set(msgKey, new Map())
          }

          for (const r of data.results) {
            this.executedCommands.get(msgKey).set(r.slug, r.result)
          }

          // Force reactivity update
          this.executedCommands = new Map(this.executedCommands)
        }
      } catch (error) {
        console.error('Execute error:', error)
      }
    },
    rejectCommand(msg, cmd) {
      const msgKey = msg.id
      if (!this.rejectedCommands.has(msgKey)) {
        this.rejectedCommands.set(msgKey, new Set())
      }
      this.rejectedCommands.get(msgKey).add(cmd.slug)
      this.rejectedCommands = new Map(this.rejectedCommands)
    },
    rejectAllCommands(msg) {
      const msgKey = msg.id
      this.rejectedCommands.set(msgKey, new Set(msg.commands_suggested.map(c => c.slug)))
      this.rejectedCommands = new Map(this.rejectedCommands)
    },
    isCommandExecuted(msg, cmd) {
      return this.executedCommands.get(msg.id)?.has(cmd.slug) || false
    },
    isCommandRejected(msg, cmd) {
      return this.rejectedCommands.get(msg.id)?.has(cmd.slug) || false
    },
    getCommandResult(msg, cmd) {
      return this.executedCommands.get(msg.id)?.get(cmd.slug)
    },
    hasPendingCommands(msg) {
      if (!msg.commands_suggested) return false
      return msg.commands_suggested.some(c => !this.isCommandExecuted(msg, c) && !this.isCommandRejected(msg, c))
    },
    formatMessage(content) {
      // Basic markdown-like formatting
      let html = content
        .replace(/```(\w*)\n?([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>')

      // Remove the commands JSON block from display
      html = html.replace(/<pre><code>\s*\[[\s\S]*?\]\s*<\/code><\/pre>/g, '')

      return html
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const container = this.$refs.messagesContainer
        if (container) {
          container.scrollTop = container.scrollHeight
        }
      })
    }
  }
}
</script>

<style scoped>
#ai-command-center {
  display: flex;
  height: calc(100vh - 60px);
  background: #f5f5f5;
}

/* Sidebar */
#ai-command-center .sidebar {
  width: 280px;
  background: #fff;
  border-right: 1px solid #e0e0e0;
  display: flex;
  flex-direction: column;
}

#ai-command-center .sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #e0e0e0;
}

#ai-command-center .sidebar-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

#ai-command-center .new-chat-btn {
  background: #3498db;
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

#ai-command-center .new-chat-btn:hover {
  background: #2980b9;
}

#ai-command-center .conversation-list {
  flex: 1;
  overflow-y: auto;
}

#ai-command-center .conversation-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  cursor: pointer;
  border-bottom: 1px solid #f0f0f0;
}

#ai-command-center .conversation-item:hover {
  background: #f8f9fa;
}

#ai-command-center .conversation-item.active {
  background: #e3f2fd;
}

#ai-command-center .conv-title {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

#ai-command-center .delete-conv {
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0;
  padding: 4px;
  color: #999;
}

#ai-command-center .conversation-item:hover .delete-conv {
  opacity: 1;
}

#ai-command-center .empty-conversations {
  padding: 20px;
  text-align: center;
  color: #999;
  font-size: 14px;
}

/* Chat Area */
#ai-command-center .chat-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

#ai-command-center .chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px 20px;
  background: white;
  border-bottom: 1px solid #e0e0e0;
}

#ai-command-center .header-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

#ai-command-center .chat-header h1 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}

#ai-command-center .provider-badge {
  font-size: 12px;
  padding: 4px 10px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 12px;
}

#ai-command-center .provider-badge.warning {
  background: #fff3e0;
  color: #e65100;
}

#ai-command-center .settings-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  color: #666;
}

#ai-command-center .settings-btn:hover {
  background: #f0f0f0;
}

#ai-command-center .settings-panel {
  background: #f8f9fa;
  padding: 15px 20px;
  border-bottom: 1px solid #e0e0e0;
}

#ai-command-center .settings-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

#ai-command-center .settings-row label {
  font-size: 14px;
}

#ai-command-center .settings-link {
  font-size: 13px;
  color: #3498db;
  text-decoration: none;
}

/* Messages */
#ai-command-center .messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

#ai-command-center .welcome-message {
  max-width: 600px;
  margin: 40px auto;
  text-align: center;
  color: #666;
}

#ai-command-center .welcome-message h2 {
  font-size: 24px;
  margin-bottom: 15px;
  color: #333;
}

#ai-command-center .welcome-message ul {
  text-align: left;
  margin: 20px auto;
  max-width: 400px;
}

#ai-command-center .welcome-message li {
  margin: 8px 0;
}

#ai-command-center .message {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  max-width: 800px;
}

#ai-command-center .message.x-user {
  margin-left: auto;
  flex-direction: row-reverse;
}

#ai-command-center .message-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

#ai-command-center .message.x-user .message-avatar {
  background: #3498db;
  color: white;
}

#ai-command-center .message.assistant .message-avatar {
  background: #9b59b6;
  color: white;
}

#ai-command-center .message.system .message-avatar {
  background: #95a5a6;
  color: white;
}

#ai-command-center .message-content {
  flex: 1;
  min-width: 0;
}

#ai-command-center .message-text {
  background: white;
  padding: 12px 16px;
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
  line-height: 1.5;
}

#ai-command-center .message.x-user .message-text {
  background: #3498db;
  color: white;
}

#ai-command-center .message-text code {
  background: rgba(0,0,0,0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 13px;
}

#ai-command-center .message-text pre {
  background: #f8f8f8;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 10px 0;
}

#ai-command-center .message-text pre code {
  background: none;
  padding: 0;
}

/* Commands Section */
#ai-command-center .commands-section {
  margin-top: 15px;
}

#ai-command-center .commands-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: #666;
}

#ai-command-center .bulk-actions {
  display: flex;
  gap: 8px;
}

#ai-command-center .btn-approve-all,
#ai-command-center .btn-reject-all {
  padding: 4px 10px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

#ai-command-center .btn-approve-all {
  background: #27ae60;
  color: white;
}

#ai-command-center .btn-reject-all {
  background: #e74c3c;
  color: white;
}

#ai-command-center .command-card {
  background: #f8f9fa;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
}

#ai-command-center .command-card.executed {
  border-color: #27ae60;
  background: #f0fff4;
}

#ai-command-center .command-card.rejected {
  border-color: #e74c3c;
  background: #fff5f5;
  opacity: 0.7;
}

#ai-command-center .command-info {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

#ai-command-center .command-slug {
  font-family: monospace;
  font-size: 13px;
  font-weight: 600;
  color: #333;
}

#ai-command-center .command-type {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 10px;
  text-transform: uppercase;
}

#ai-command-center .command-type.read {
  background: #e3f2fd;
  color: #1565c0;
}

#ai-command-center .command-type.write {
  background: #fff3e0;
  color: #e65100;
}

#ai-command-center .auto-badge {
  font-size: 10px;
  padding: 2px 6px;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 8px;
}

#ai-command-center .command-desc {
  font-size: 13px;
  color: #666;
  margin-bottom: 6px;
}

#ai-command-center .command-params {
  font-size: 12px;
  margin-bottom: 8px;
}

#ai-command-center .command-params code {
  background: #e8e8e8;
  padding: 4px 8px;
  border-radius: 4px;
  display: block;
  overflow-x: auto;
}

#ai-command-center .command-actions {
  display: flex;
  gap: 8px;
}

#ai-command-center .btn-approve,
#ai-command-center .btn-reject {
  padding: 6px 14px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

#ai-command-center .btn-approve {
  background: #27ae60;
  color: white;
}

#ai-command-center .btn-approve:hover {
  background: #219a52;
}

#ai-command-center .btn-reject {
  background: #e74c3c;
  color: white;
}

#ai-command-center .btn-reject:hover {
  background: #c0392b;
}

#ai-command-center .command-result {
  font-size: 13px;
  padding: 6px 10px;
  border-radius: 4px;
}

#ai-command-center .command-result.success {
  background: #d4edda;
  color: #155724;
}

#ai-command-center .command-result.error {
  background: #f8d7da;
  color: #721c24;
}

#ai-command-center .command-rejected {
  font-size: 13px;
  color: #e74c3c;
  font-style: italic;
}

/* Loading */
#ai-command-center .typing-indicator {
  display: flex;
  gap: 4px;
  padding: 8px 0;
}

#ai-command-center .typing-indicator span {
  width: 8px;
  height: 8px;
  background: #999;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

#ai-command-center .typing-indicator span:nth-child(2) {
  animation-delay: 0.2s;
}

#ai-command-center .typing-indicator span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes typing {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}

/* Input Area */
#ai-command-center .input-area {
  display: flex;
  gap: 12px;
  padding: 15px 20px;
  background: white;
  border-top: 1px solid #e0e0e0;
}

#ai-command-center .input-area textarea {
  flex: 1;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 12px 16px;
  font-size: 14px;
  resize: none;
  max-height: 150px;
  font-family: inherit;
}

#ai-command-center .input-area textarea:focus {
  outline: none;
  border-color: #3498db;
}

#ai-command-center .send-btn {
  background: #3498db;
  color: white;
  border: none;
  border-radius: 8px;
  width: 48px;
  height: 48px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

#ai-command-center .send-btn:hover:not(:disabled) {
  background: #2980b9;
}

#ai-command-center .send-btn:disabled {
  background: #bdc3c7;
  cursor: not-allowed;
}
</style>
