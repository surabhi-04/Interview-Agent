<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1VtLyZ6McBhwbemTi231W72OL3qfDMLt2

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
📌 Overview

The AI Interview & GD Voice Agent is an interactive voice-based system built using Gemini 3 and the Google AI Studio Voice Agent framework.
It simulates real interview environments (HR, Technical, and Group Discussion) by:

Asking questions naturally (with human-like greetings)

Listening to the user's spoken responses

Evaluating the answer for clarity, content, structure, and confidence

Giving voice-based feedback, suggestions, and improvements

Maintaining conversation history and showing structured feedback

The entire system is coded in TypeScript and integrates seamlessly with Gemini 3 multimodal capabilities.

✨ Features
Interview Rounds

Natural interviewer-style intro:

“Good morning, please come in and take your seat.”

“Let’s begin with a quick introduction—tell me about yourself.”

HR Round:

Strengths/weaknesses

Conflict resolution

Career motivation

Technical Round:

Role-specific questions (SDE, Analyst, PM)

Conceptual + scenario-based queries

Smart evaluation:

Content depth

STAR structure

Clarity & relevance

Confidence in delivery

AI-generated feedback:

Score

Strengths

Improvements

Suggested outline

Short spoken summary

Group Discussion (GD) Mode

AI moderates the GD like a real panel member.

Provides a topic, e.g.:

“Impact of social media on youth mental health.”

User speaks for ~40–60 seconds.

AI responds every 30 seconds with:

Counterpoints

Supportive points

Additional perspectives

Never repeats the user’s content

After 2–4 cycles, AI produces a GD performance evaluation.

UI/UX

Modern 3-column layout:

Left: Conversation history

Center: Live voice interaction

Right: Feedback & improvements

Everything centered and balanced

Soft colors, rounded cards, minimalistic design

🧰 Tech Stack & APIs Used
Core Technology

Google Gemini 3

Main LLM for interview logic, GD logic, evaluation, and prompts.

Google AI Studio — Voice Agent

Used for:

Voice input

Voice output (TTS)

Managing conversation flow

Multi-turn state handling

Context-aware dialogue

Programming

TypeScript

Used for agent scripts, UI interaction logic (if needed), and model workflow.

Cleaner typing, safer code, modular structure.

Front-end

HTML + CSS (simple custom UI)

JavaScript/TypeScript (compiled)

No heavy frameworks used.

Deployment

Can be run:

Locally

On Firebase Hosting

On any static hosting platform

Or directly integrated with Google AI Studio
