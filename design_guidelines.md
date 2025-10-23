# Design Guidelines for TabletopScribe Discord Bot

## Design Approach

**Discord-Native Design System Approach**

This bot leverages Discord's native UI patterns and embed formatting to create a polished, professional user experience within Discord's interface. The design focuses on clarity, status feedback, and seamless integration with Discord's visual language.

---

## Core Design Elements

### A. Message Formatting & Embeds

**Embed Color Coding:**
- Success states: Green (#43B581)
- Error states: Red (#F04747)
- Info/Status: Blue (#5865F2)
- Warning: Orange (#FAA61A)
- Recording active: Red (#ED4245)

**Embed Structure:**
- **Title:** Bold, clear action or status
- **Description:** Concise, user-friendly explanation
- **Fields:** Structured data presentation (inline when appropriate)
- **Footer:** Timestamp, environment indicator (DEV/DEVSORT)
- **Thumbnail:** TabletopScribe logo or relevant icon

### B. Typography & Messaging

**Command Responses:**
- Clear hierarchy: Title → Description → Action items
- Use Discord markdown: **bold** for emphasis, `code blocks` for technical details
- Bullet points for lists (campaigns, steps, options)
- Emoji indicators: ✅ success, ❌ error, 🎙️ recording, ⏸️ stopped, 📤 uploading

**Tone:**
- Friendly and encouraging
- Technically precise when needed
- Clear error messages with actionable solutions

### C. Layout System

**Spacing (Discord Embeds):**
- Single-line descriptions for simple confirmations
- Multi-line with line breaks for complex information
- Field spacing: Use inline fields for related data pairs
- Footer always present for context and timestamp

**Information Hierarchy:**
1. Primary action/status (embed title)
2. Key details (description or main field)
3. Supporting information (additional fields)
4. Metadata (footer)

---

## Component Library

### Authentication Components

**/login Command Response:**
- **Loading:** "🔐 Authenticating with TabletopScribe..."
- **Success Embed:**
  - Title: "✅ Authentication Successful"
  - Description: "You're now connected to TabletopScribe!"
  - Fields: Username, Environment (DEV/DEVSORT)
  - Footer: Session timestamp
- **Error Embed:**
  - Title: "❌ Authentication Failed"
  - Description: Clear error message
  - Fields: Suggested actions or troubleshooting steps

### Campaign Management

**/campaigns Command Response:**
- **Embed with Campaign List:**
  - Title: "📚 Your TabletopScribe Campaigns"
  - Description: "Select a campaign name for recording"
  - Fields: Each campaign as a field with name and description
  - Footer: Total count, environment

### Recording Interface

**/record Command:**
- **Start Confirmation Embed:**
  - Title: "🎙️ Recording Started"
  - Description: "Joined voice channel and recording audio"
  - Fields: Campaign name, Voice channel name, Started at (timestamp)
  - Thumbnail: Microphone icon or recording indicator

**Active Recording Status:**
- Periodic status updates (every 5 minutes)
- Embed showing: Duration, Participants, File size estimate

**/stop Command:**
- **Processing Embed:**
  - Title: "⏸️ Recording Stopped"
  - Description: "Processing and uploading your session..."
  - Fields: Duration, File size
  - Progress indicators: "📝 Saving file... 📤 Uploading to S3... 🔗 Creating session..."

- **Success Embed:**
  - Title: "✅ Session Uploaded Successfully"
  - Description: "Your recording is ready in TabletopScribe!"
  - Fields: Session name, Duration, Campaign, Direct link to session
  - Call-to-action: Button or link to view in TabletopScribe

### Status & Error Messages

**/status Command:**
- Real-time recording status
- Upload progress percentage
- Processing queue status

**Error Handling:**
- Clear error titles with emoji indicators
- Plain-language explanations
- Actionable next steps
- Contact information for support (if persistent errors)

---

## Interaction Patterns

### Command Feedback Flow
1. Immediate acknowledgment (ephemeral message or quick embed)
2. Progress updates for long operations (recording, uploading)
3. Final confirmation with actionable links
4. Cleanup of temporary messages where appropriate

### Voice Channel Integration
- Bot presence indicator (nickname shows recording status)
- Silent join/leave (no audio alerts)
- Status updates in text channel where command was invoked

### Multi-User Considerations
- Personal responses when possible (ephemeral messages for auth)
- Public notifications for shared events (recording started/stopped)
- Clear user attribution in multi-user scenarios

---

## Key User Experience Principles

1. **Immediate Feedback:** Every command receives instant acknowledgment
2. **Progress Transparency:** Users always know what's happening during recording/upload
3. **Error Recovery:** Clear guidance when things go wrong
4. **Minimal Friction:** Commands work with sensible defaults, detailed options available
5. **Professional Polish:** Consistent formatting, proper timestamps, branded elements
6. **Context Awareness:** Messages reference relevant campaign/session details

---

## Technical UI Considerations

- **Rate Limit Handling:** Graceful degradation if Discord API limits hit
- **Permission Checks:** Clear messages if bot lacks required permissions
- **Attachment Limits:** Handle large audio files with chunking or external hosting notifications
- **Ephemeral Messages:** Use for sensitive data (login credentials, auth tokens)
- **Persistent Messages:** Use for recording confirmations and session links

---

This design creates a professional, trustworthy bot experience that seamlessly integrates TabletopScribe's audio recording functionality into Discord's familiar interface while maintaining clarity and providing excellent user feedback throughout the recording and upload process.