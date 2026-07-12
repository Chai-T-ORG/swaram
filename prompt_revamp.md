# SWARAM UI/UX Redesign

Treat this as designing a completely new product, not a redesign of the existing interface.

The current UI feels like a generic SaaS dashboard. SWARAM is **not** a dashboard. It is a voice-first accessibility assistant that helps blind and low-vision users complete forms naturally through conversation.

The design language should feel closer to **Wispr Flow**, **Apple Intelligence**, **JARVIS**, and **Arc Browser** rather than Notion, Linear, or common AI dashboard templates.

---

# Core Design Philosophy

The voice assistant **is the product**.

Everything else exists to support it.

Every screen should immediately answer one question:

> **What is SWARAM doing right now?**

The experience should feel calm, premium, intentional, and alive.

Avoid anything that resembles a template, AI-generated dashboard, or Dribbble concept.

---

# Overall Information Architecture

Think of the experience as two distinct phases.

### Phase 1 — Before a form exists

The user is simply trying to begin.

The interface should focus on:

- Voice assistant
- Starting a session
- Recent sessions
- Guidance

There should be **no conversation history** yet.

---

### Phase 2 — During form filling

The product transforms into a conversational workspace.

Now the interface focuses on:

- Current conversation
- Current question
- Progress
- Voice controls

The user should never feel like they're navigating a dashboard.

---

# Desktop Home Layout

Use a clean three-column layout.

## Left Column

Dedicated Voice Assistant Panel.

This is NOT navigation.

It should contain:

- SWARAM logo
- Large liquid animated orb
- Layered translucent blobs
- Concentric pulse animations
- Idle / Listening / Speaking animations
- Status text
- "Try saying..." suggestions

This should feel like the assistant is alive.

No emojis.

Use premium SVG icons only.

---

## Center Column

Assistant Activity

If there is **no active form**

Display assistant status.

Examples:

- Ready to help
- Listening...
- Upload a PDF to begin
- Scan a printed form

Do NOT display chat messages.

---

If there **is** an active session

Replace Assistant Activity with

## Our Conversation

Display only

Assistant message

↓

User response

↓

Assistant message

↓

User response

Conversation only starts after entering

/fill/[formId]

---

Below conversation

Display

## Current Session

Instead of

60%

Show

Current Form

Question 11 of 27

41% Complete

Estimated 2 minutes remaining

Last saved just now

---

Below that

Display Voice Commands

Repeat

Go Back

Skip Question

Pause

Type Instead

---

## Right Column

### How would you like to begin?

Large premium action cards

Upload PDF

Scan Printed Form

---

### Recent Sessions

Each card shows

- Form name
- Last opened
- Progress
- Resume button

---

Replace "Tip of the Day"

with

## What happens next?

Explain the process

1. Upload a document
2. I'll read every question aloud
3. Answer naturally
4. Review everything
5. Submit

---

# Navigation

The navigation should communicate workflow instead of pages.

Users should always understand where they are.

Example

Home

↓

Upload

↓

Preparing Document

↓

Voice Guidance

↓

Review

↓

Complete

Current step should always be visually obvious.

---

# Voice Assistant Behaviour

The assistant should exist across the entire application.

Home

Large immersive assistant panel.

Leaving Home

The assistant should

- shrink
- morph
- animate smoothly
- dock into the bottom-right corner

It should remain visible throughout the experience.

Never disappear.

The animation should feel like the assistant is following the user.

---

# Form Filling Screen

This page becomes the conversation workspace.

Layout

Conversation

↓

Current Question

↓

Voice Controls

↓

Progress

↓

Help

The focus is the conversation.

Not cards.

Not dashboards.

---

# Conversation Architecture

Separate messages from system states.

Messages

Assistant

User

System States

Listening

Thinking

Reading Document

Processing OCR

Speaking

Saving Progress

System states should appear as subtle status indicators instead of chat bubbles.

---

# Conversation Logging

Only begin logging after navigation enters

/fill/[formId]

Do NOT log conversations on the Home screen before a session exists.

Capture

Assistant speech (TTS)

↓

User response (STT)

↓

Assistant speech

↓

User response

Store conversation per active form.

When returning Home, only show the latest active session preview.

---

# Mobile Experience

Do NOT mirror the desktop layout.

Design it like a premium native voice application.

Avoid bottom navigation.

Use

- Header
- Contextual back button
- Floating assistant
- Contextual actions

instead.

---

## Mobile Home

Header

↓

Large animated assistant

↓

Primary Actions

Upload PDF

Scan Printed Form

↓

Current Session (if one exists)

↓

Recent Sessions

↓

Privacy / Help

---

## Mobile Form Filling

Header

↓

Conversation

↓

Current Question

↓

Voice Controls

↓

Progress

↓

Need Help

Keep everything in a single scrolling column.

---

# Visual Language

Avoid common AI UI patterns.

Avoid

- Neon gradients
- Dashboard grids
- Oversized rounded cards everywhere
- Glassmorphism overload
- Dribbble-style concepts
- Generic SaaS layouts

Aim for

- Large whitespace
- Strong typography
- Premium spacing
- Thin separators
- Minimal borders
- Soft shadows
- Subtle glass only where appropriate
- Natural green accent palette
- Carefully designed motion

The interface should feel handcrafted rather than AI generated.

---

# Motion Design

Motion should communicate state.

Assistant Orb

- Liquid morphing
- Concentric pulses
- Soft breathing animation while idle
- Waveform animation while speaking
- Smooth transition between listening and thinking

Navigation

The assistant should morph from the large Home assistant into the floating assistant instead of simply appearing.

Cards should animate naturally.

Transitions should feel physically connected.

Animations should never exist purely for decoration.

---

# Technical Requirements

Implement conversation logging.

### textToSpeech.ts

Expose speech listeners.

Trigger listeners every time TTS begins speaking.

---

### GlobalVoice.tsx

Maintain

messages: {
    sender: "assistant" | "user",
    text: string,
    timestamp: number
}[]

Subscribe to

- Speech events
- Transcript events

Persist messages per active form.

Only record messages while inside

/fill/[formId]

---

### Home

Display

Assistant Activity

or

Our Conversation

depending on whether an active session exists.

---

### Fill Page

Display live conversation.

Display current question.

Display progress.

Display assistant state.

---

### globals.css

Create premium animations

- Liquid morph
- Blob wobble
- Concentric pulse
- Waveform
- Floating assistant transition
- Premium chat bubble styling

---

# Ultimate Goal

SWARAM should feel like a premium consumer voice product, not a dashboard.

The experience should immediately communicate that the assistant is alive, understands what the user is doing, guides them naturally through forms, and always makes it obvious what is happening, what will happen next, and what the user should do.